import { AsyncLocalStorage } from 'async_hooks'
import { randomUUID } from 'crypto'
import { isSpanContextValid, trace } from '@opentelemetry/api'
import type { HeldLine } from './held-lines'
import { currentUsecase } from './usecase'

export interface RequestUser {
  id?: string
  roles?: string[]
  organizationId?: string
}

/** Reads the user from the request lazily, so auth that runs later counts. */
export type RequestUserResolver = (req: any) => RequestUser | undefined

/**
 * Per request or job. `req` is cleared when the response finishes so that
 * timers started during the request do not keep it in memory.
 */
export interface LogScope {
  req?: any
  correlationId: string
  /** Date.now() when the request or job began; elapsed time of its lines. */
  startedAt: number
  /** Last outgoing call (DB, Redis, HTTP) that failed; see FailedStepSpanProcessor. */
  failedStep?: { name: string; endedAtMs: number }
  /**
   * HTTP requests only: error lines whose level waits for the response
   * status (see held-lines.ts). Set to [] by the request logger, cleared
   * when the response finishes.
   */
  held?: HeldLine[]
}

const storage = new AsyncLocalStorage<LogScope>()

/**
 * Time since the request/job began, on lines that have no duration_ms. A
 * symbol key: the pretty format shows it, JSON.stringify and pino skip it,
 * so the JSON output is unchanged.
 */
export const ELAPSED_MS = Symbol.for('skilllane-monitoring.elapsed_ms')

export function runInScope<T>(scope: LogScope, fn: () => T): T {
  return storage.run(scope, fn)
}

export function currentScope(): LogScope | undefined {
  return storage.getStore()
}

export function newScope(req?: any): LogScope {
  return { req, correlationId: `local-${randomUUID()}`, startedAt: Date.now() }
}

export interface TraceIds {
  traceId?: string
  spanId?: string
}

export function activeTraceIds(): TraceIds {
  const spanContext = trace.getActiveSpan()?.spanContext()
  if (!spanContext || !isSpanContextValid(spanContext)) return {}
  return { traceId: spanContext.traceId, spanId: spanContext.spanId }
}

function present(value: unknown): string | undefined {
  return value === undefined || value === null || value === ''
    ? undefined
    : String(value)
}

/**
 * The request shape this SDK reads: `req.user` from the auth guard, the active role
 * in `req.user.currentRole` or the `current-role` header, and the school as
 * the organization. Apps with another shape pass `resolveUser`.
 */
export const defaultRequestUser: RequestUserResolver = (req) => {
  const user = req?.user
  const id = present(user?.id)
  const role = present(user?.currentRole ?? req?.headers?.['current-role'])
  const organizationId = present(user?.organizationId ?? user?.schoolId)
  if (!id && !role && !organizationId) return undefined
  return {
    id,
    roles: role ? [role] : undefined,
    organizationId,
  }
}

/** Context fields for the current line: trace, user and correlation id. */
export function contextFields(
  resolveUser: RequestUserResolver,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  const labels: Record<string, string> = {}
  const { traceId, spanId } = activeTraceIds()
  const scope = currentScope()
  if (traceId) {
    fields['trace.id'] = traceId
    fields['span.id'] = spanId
  } else if (scope) {
    // No real span: never invent a trace.id that Tempo cannot find.
    labels.correlation_id = scope.correlationId
  }
  const usecase = currentUsecase()
  if (usecase) labels.usecase = usecase
  if (Object.keys(labels).length) fields.labels = labels
  if (scope?.req) {
    try {
      const user = resolveUser(scope.req)
      if (user?.id) fields['user.id'] = user.id
      if (user?.roles?.length) fields['user.roles'] = user.roles
      if (user?.organizationId) fields['organization.id'] = user.organizationId
    } catch {
      // A failing resolver must not lose the line.
    }
  }
  return fields
}
