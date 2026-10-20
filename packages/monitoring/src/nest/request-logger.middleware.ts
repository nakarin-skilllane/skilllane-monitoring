import type { NextFunction, Request, Response } from 'express'
import { inflight } from '../inflight/tracker'
import { getLogger } from '../logger'
import { activeTraceIds, newScope, runInScope } from '../logger/context'
import { releaseHeld } from '../logger/held-lines'
import { stripQuery } from '../logger/redact'
import type { LogLevel } from '../types'

export const REQUEST_ID_HEADER = 'request-id'

export interface RequestLoggerOptions {
  /** Requests running longer than this are written to the inflight registry. */
  inflightAfterMs: number
  /** Paths (prefix match) that get no http.request line, e.g. health checks. */
  ignorePaths?: string[]
}

function levelFor(status: number): LogLevel {
  if (status >= 500) return 'error'
  if (status >= 400) return 'warn'
  return 'info'
}

/**
 * First middleware of the app: opens the log scope, sets the `request-id`
 * response header (= trace.id), records long requests as inflight and
 * writes one `http.request` line when the response finishes. Error lines
 * held for the status (held-lines.ts) are written just before it.
 */
export function createRequestLogger(options: RequestLoggerOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const scope = newScope(req)
    scope.held = []
    runInScope(scope, () => {
      const started = process.hrtime.bigint()
      const path = stripQuery(req.originalUrl ?? req.url ?? '')
      const ignored = options.ignorePaths?.some((prefix) =>
        path.startsWith(prefix),
      )
      const { traceId } = activeTraceIds()
      const requestId = traceId ?? scope.correlationId
      const incomingId =
        req.headers[REQUEST_ID_HEADER] ?? req.headers['x-request-id']
      try {
        res.setHeader(REQUEST_ID_HEADER, requestId)
      } catch {
        // headers already sent
      }

      const field = `http:${requestId}`
      let tracked = false
      const timer = ignored
        ? undefined
        : setTimeout(() => {
            tracked = true
            inflight.start(field, {
              kind: 'http',
              type: path,
              method: req.method,
              path,
              started_at: new Date().toISOString(),
              trace_id: traceId,
            })
          }, options.inflightAfterMs)
      timer?.unref()

      let done = false
      const finish = () => {
        if (done) return
        done = true
        if (timer) clearTimeout(timer)
        if (tracked) inflight.finish(field)
        const status = res.statusCode
        const aborted = !res.writableFinished
        // The status actually sent decides; a closed response keeps the warn.
        releaseHeld(scope, aborted ? undefined : status)
        if (!ignored) {
          getLogger().event({
            event: 'http.request',
            level: aborted ? 'warn' : levelFor(status),
            logger: 'HttpRequest',
            fields: {
              'http.request.method': req.method,
              'url.path': path,
              'http.route': req.route?.path,
              'http.response.status_code': aborted ? undefined : status,
              'http.request.id': Array.isArray(incomingId)
                ? incomingId[0]
                : incomingId,
              duration_ms: Number(process.hrtime.bigint() - started) / 1e6,
              reason: aborted ? 'client_closed' : undefined,
            },
          })
        }
        // Let timers started during the request release the request object.
        scope.req = undefined
      }
      res.once('finish', finish)
      res.once('close', finish)
      next()
    })
  }
}
