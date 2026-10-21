import { randomUUID } from 'crypto'
import {
  type Attributes,
  type Context,
  context,
  propagation,
  ROOT_CONTEXT,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api'
import { captureMessage, type MessageCapture } from '../capture/messaging'
import { inflight } from '../inflight/tracker'
import type { InflightKind } from '../inflight/types'
import { activeTraceIds, newScope, runInScope } from '../logger/context'
import { getLogger } from '../logger'
import type { JobSource } from '../types'

export interface JobMeta {
  kind: InflightKind
  /** `event.module`: bullmq, kafka, rabbitmq, cron or task. */
  source: JobSource
  /** Registry field, unique while the work runs. */
  field: string
  queue: string
  type: string
  id?: string
  attempt?: number
  maxAttempts?: number
  logger: string
  /** W3C trace headers carried by the job or message. */
  carrier?: Record<string, unknown>
  /**
   * The payload and headers of the job or message, captured (masked) on
   * the job span as messaging.message.body / .headers.
   */
  message?: MessageCapture
  /**
   * Whether a failure is final; default: attempt ≥ maxAttempts (or unknown).
   * A non-final failure logs job.retry instead of job.failed.
   */
  isFinal?: (error: unknown) => boolean
}

const tracer = trace.getTracer('skilllane-monitoring')

function parentContext(carrier: Record<string, unknown> | undefined): Context {
  if (trace.getActiveSpan()) return context.active()
  if (!carrier) return ROOT_CONTEXT
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(carrier)) {
    if (typeof value === 'string') headers[key] = value
    else if (Buffer.isBuffer(value)) headers[key] = value.toString()
  }
  return propagation.extract(ROOT_CONTEXT, headers)
}

/** The job fields as span attributes (OTel takes no undefined values). */
function spanAttributes(fields: Record<string, unknown>): Attributes {
  const out: Attributes = {}
  for (const [key, value] of Object.entries(fields)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    )
      out[key] = value
  }
  return out
}

function jobFields(meta: JobMeta): Record<string, unknown> {
  return {
    'event.module': meta.source,
    'job.queue': meta.queue,
    'job.type': meta.type,
    'job.id': meta.id,
    'job.attempt': meta.attempt,
    'job.max_attempts': meta.maxAttempts,
  }
}

/**
 * Runs one job, message or tracked task: its own log scope and span,
 * `job.started` → `job.finished` / `job.retry` / `job.failed`, and an
 * inflight entry. The error is always rethrown; behaviour is unchanged.
 */
export async function runJob<T>(
  meta: JobMeta,
  fn: () => Promise<T>,
): Promise<T> {
  const logger = getLogger()
  const scope = newScope()
  return runInScope(scope, () =>
    tracer.startActiveSpan(
      `${meta.queue} ${meta.type}`,
      { kind: meta.kind === 'task' ? SpanKind.INTERNAL : SpanKind.CONSUMER },
      parentContext(meta.carrier),
      async (span: Span) => {
        const started = Date.now()
        const fields = jobFields(meta)
        // The same job.* on the span: /api/traces reads them from the entry span.
        span.setAttributes(spanAttributes(fields))
        if (meta.message) captureMessage(span, meta.message)
        try {
          inflight.start(meta.field, {
            kind: meta.kind,
            source: meta.source,
            type: meta.type,
            queue: meta.queue,
            job_id: meta.id,
            started_at: new Date(started).toISOString(),
            trace_id: activeTraceIds().traceId,
          })
          logger.event({ event: 'job.started', logger: meta.logger, fields })
        } catch {
          // never block the job
        }
        try {
          const result = await fn()
          logger.event({
            event: 'job.finished',
            logger: meta.logger,
            fields: { ...fields, duration_ms: Date.now() - started },
          })
          return result
        } catch (error) {
          const final = meta.isFinal
            ? meta.isFinal(error)
            : meta.maxAttempts === undefined ||
              meta.attempt === undefined ||
              meta.attempt >= meta.maxAttempts
          logger.event({
            event: final ? 'job.failed' : 'job.retry',
            logger: meta.logger,
            error,
            fields: {
              ...fields,
              'job.final': final,
              duration_ms: Date.now() - started,
            },
          })
          span.recordException(error as Error)
          span.setStatus({ code: SpanStatusCode.ERROR })
          throw error
        } finally {
          inflight.finish(meta.field)
          span.end()
        }
      },
    ),
  )
}

/**
 * Runs out-of-queue work (cache rebuild, sync) with the same tracking as a
 * job. `{ source: 'cron' }` for a scheduled method (@Cron).
 */
export function tracked<T>(
  name: string,
  fn: () => Promise<T>,
  options: { source?: 'task' | 'cron' } = {},
): Promise<T> {
  const source = options.source ?? 'task'
  return runJob(
    {
      kind: 'task',
      source,
      field: `task:${name}:${randomUUID()}`,
      queue: source,
      type: name,
      logger: 'tracked',
    },
    fn,
  )
}
