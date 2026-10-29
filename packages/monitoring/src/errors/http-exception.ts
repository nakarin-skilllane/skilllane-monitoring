import type { DependencyType } from '../types'
import { type ErrorCodeRef, isErrorCodeRef } from './error-code'
import { ERROR_CATEGORIES, type ErrorCategory } from './patterns/types'

/**
 * What the second argument of a Nest HTTP exception may tell its log line:
 * `throw new BadRequestException('Coupon has expired', { code, howToFix })`.
 * Nest itself reads only `cause` and `description`. Fields left out still
 * come from the app catalog or the hint table, as for an AppError.
 */
export interface HttpExceptionLogOptions {
  code?: string | ErrorCodeRef
  hint?: string
  detail?: string
  howToFix?: string
  category?: ErrorCategory
  target?: string
  /** Final level of its line. */
  level?: 'warn' | 'error'
}

declare module '@nestjs/common' {
  interface HttpExceptionOptions extends HttpExceptionLogOptions {}
}

/** The words of HttpExceptionLogOptions, checked; `code` as its string. */
export interface HttpExceptionWords {
  code?: string
  /** `ErrorCode.redis.…`: the dependency its code belongs to. */
  codeDependency?: DependencyType
  hint?: string
  detail?: string
  howToFix?: string
  category?: ErrorCategory
  target?: string
  level?: 'warn' | 'error'
}

const TEXTS = ['hint', 'detail', 'howToFix', 'target'] as const

/**
 * The log words in an options object; undefined when it has none. A value
 * of the wrong kind is skipped, like a wrong field in the app catalog.
 */
export function logWordsOf(options: unknown): HttpExceptionWords | undefined {
  if (typeof options !== 'object' || options === null) return undefined
  const given = options as Record<string, unknown>
  const words: HttpExceptionWords = {}
  if (isErrorCodeRef(given.code)) {
    words.code = given.code.code
    words.codeDependency = given.code.dependency
  } else if (typeof given.code === 'string' && given.code) {
    words.code = given.code
  }
  for (const key of TEXTS) {
    const text = given[key]
    if (typeof text === 'string' && text) words[key] = text
  }
  if (ERROR_CATEGORIES.includes(given.category as ErrorCategory)) {
    words.category = given.category as ErrorCategory
  }
  if (given.level === 'warn' || given.level === 'error') {
    words.level = given.level
  }
  return Object.keys(words).length > 0 ? words : undefined
}

/** The log words a Nest HttpException was thrown with (Nest keeps them as `options`). */
export function httpExceptionWords(
  error: unknown,
): HttpExceptionWords | undefined {
  if (typeof (error as any)?.getStatus !== 'function') return undefined
  return logWordsOf((error as any).options)
}
