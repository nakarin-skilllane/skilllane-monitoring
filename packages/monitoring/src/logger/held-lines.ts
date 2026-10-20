import type { LogLevel } from '../types'
import type { LogScope } from './context'

/**
 * An `app.log` error line that its error pattern would write at warn (a
 * caller mistake: 404, 400, a value too long …), logged inside an HTTP
 * request. Whether it was the caller's fault is only known from the status
 * the response actually sends: the line waits for the response, then is
 * written at `error` when the status is 5xx and at `warn` otherwise, with
 * its original `@timestamp`.
 */
export interface HeldLine {
  record: Record<string, unknown>
  /** The level decided without the status: the pattern's warn. */
  level: LogLevel
  write: (record: Record<string, unknown>, level: LogLevel) => void
}

// Requests with held lines, so a crash or shutdown can write them.
const holding = new Set<LogScope>()

/** True inside an HTTP request whose response has not finished yet. */
export function canHold(
  scope: LogScope | undefined,
): scope is LogScope & { held: HeldLine[] } {
  return !!scope?.req && Array.isArray(scope.held)
}

export function holdLine(
  scope: LogScope & { held: HeldLine[] },
  line: HeldLine,
): void {
  scope.held.push(line)
  holding.add(scope)
}

/** 5xx → error, anything else → warn. */
export function levelForStatus(status: number): LogLevel {
  return status >= 500 ? 'error' : 'warn'
}

/**
 * Writes the held lines of a request: at the level of `status` when the
 * response finished, as originally decided when it did not (`undefined`:
 * closed early, crash, shutdown). Lines logged after this are not held.
 */
export function releaseHeld(scope: LogScope, status?: number): void {
  const lines = scope.held
  scope.held = undefined
  holding.delete(scope)
  if (!lines?.length) return
  for (const line of lines) {
    try {
      line.write(
        line.record,
        status === undefined ? line.level : levelForStatus(status),
      )
    } catch {
      // the next line still gets written
    }
  }
}

/** Crash / shutdown: every held line, as originally decided. */
export function releaseAllHeld(): void {
  for (const scope of [...holding]) releaseHeld(scope)
}
