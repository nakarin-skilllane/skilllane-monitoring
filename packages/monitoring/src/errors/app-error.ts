import type { DependencyType } from '../types'
import { type ErrorCodeRef, isErrorCodeRef } from './error-code'
import type { ErrorCategory } from './patterns/types'

const MARK = Symbol.for('skilllane-monitoring.app-error')
/**
 * The last AppErrors, oldest first: Nest 9/10 log a thrown error as
 * (message, stack). Stacks are read on lookup, not on construction, so a
 * subclass can still set its `name` first.
 */
const RECENT: AppError[] = []
const RECENT_MAX = 100

export interface AppErrorOptions {
  hint?: string
  detail?: string
  howToFix?: string
  category?: ErrorCategory
  target?: string
  /** Final level of its line. */
  level?: 'warn' | 'error'
  /** HTTP status Nest answers with (its filter reads `statusCode`); default 500. The message goes to the client. */
  status?: number
  cause?: unknown
}

/**
 * An error that names its code and may replace any word of its hint-table
 * entry; fields left out still come from the table.
 */
export class AppError extends Error {
  readonly code: string
  /** Picks the dependency-scoped pattern of the code. */
  readonly dependency?: DependencyType
  readonly hint?: string
  readonly detail?: string
  readonly howToFix?: string
  readonly category?: ErrorCategory
  readonly target?: string
  readonly level?: 'warn' | 'error'
  readonly statusCode?: number

  constructor(
    code: string | ErrorCodeRef,
    message: string,
    options: AppErrorOptions = {},
  ) {
    super(message)
    this.name = 'AppError'
    // Set by hand: the es2021 lib target has no ErrorOptions.
    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        enumerable: false,
        writable: true,
        configurable: true,
      })
    }
    this.code = isErrorCodeRef(code) ? code.code : code
    this.dependency = isErrorCodeRef(code) ? code.dependency : undefined
    this.hint = options.hint
    this.detail = options.detail
    this.howToFix = options.howToFix
    this.category = options.category
    this.target = options.target
    this.level = options.level
    this.statusCode = options.status
    // Not enumerable: Nest's legacy ConsoleLogger prints own symbol keys.
    Object.defineProperty(this, MARK, { value: true })
    RECENT.push(this)
    if (RECENT.length > RECENT_MAX) RECENT.shift()
  }
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' && value !== null && (value as any)[MARK] === true
  )
}

/** The AppError a stack string came from, if it is one of the last 100. */
export function appErrorByStack(stack: string): AppError | undefined {
  for (let i = RECENT.length - 1; i >= 0; i--) {
    if (RECENT[i].stack === stack) return RECENT[i]
  }
  return undefined
}
