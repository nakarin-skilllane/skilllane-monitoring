import { inspect } from 'util'
import type { DependencyType } from '../types'

/** Global, so a second copy of the SDK in the process still recognises it. */
const MARK = Symbol.for('skilllane-monitoring.error-code')

/**
 * One code of the hint table as `ErrorCode.smtp.ECONNECTION` gives it: the
 * `error.code` to log and, for codes the table scopes by dependency, which
 * one. Prints as the code, so Nest's own logger (LOGGING_ENGINE=legacy)
 * still shows something readable.
 */
export class ErrorCodeRef {
  readonly [MARK] = true

  constructor(
    readonly code: string,
    readonly dependency?: DependencyType,
  ) {
    Object.freeze(this)
  }

  toString(): string {
    return this.code
  }

  toJSON(): string {
    return this.code
  }

  [inspect.custom](): string {
    return this.code
  }
}

export function errorCode(
  code: string,
  dependency?: DependencyType,
): ErrorCodeRef {
  return new ErrorCodeRef(code, dependency)
}

export function isErrorCodeRef(value: unknown): value is ErrorCodeRef {
  return (
    typeof value === 'object' && value !== null && (value as any)[MARK] === true
  )
}
