import type { DependencyType } from '../types'
import { type AdapterResult, ERROR_ADAPTERS } from './adapters'
import { type ErrorOrigin, originOf } from './origin'
import { usecaseOf } from '../logger/usecase'

const MAX_CAUSE_DEPTH = 3

export interface SerializedCause {
  type: string
  message: string
  code?: string
  cause?: SerializedCause
}

export interface SerializedError {
  type: string
  message: string
  code?: string
  stack?: string
  origin?: ErrorOrigin
  /** CQRS query/command (or job) that was running when it was thrown. */
  usecase?: string
  cause?: SerializedCause
  status?: number
  dependency?: DependencyType
  domain?: string
  /** Hint carried by the error itself (AppError or a compatible shape). */
  hint?: string
  hintDetail?: string
}

function runAdapters(error: unknown): AdapterResult {
  for (const adapter of ERROR_ADAPTERS) {
    try {
      if (adapter.match(error)) return adapter.extract(error)
    } catch {
      // A broken adapter must not lose the log line; try the next one.
    }
  }
  return {}
}

function typeOf(error: unknown): string {
  const name = (error as any)?.name
  if (typeof name === 'string' && name) return name
  if (error instanceof Error) return error.constructor.name
  return 'NonError'
}

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error
  const message = (error as any)?.message
  if (typeof message === 'string') return message
  try {
    return JSON.stringify(error) ?? String(error)
  } catch {
    return String(error)
  }
}

function serializeCause(
  cause: unknown,
  depth: number,
  seen: Set<unknown>,
): SerializedCause | undefined {
  if (cause === undefined || cause === null || depth > MAX_CAUSE_DEPTH) {
    return undefined
  }
  if (typeof cause === 'object') {
    if (seen.has(cause)) return undefined
    seen.add(cause)
  }
  const extracted = runAdapters(cause)
  return {
    type: typeOf(cause),
    message: messageOf(cause),
    code: extracted.code,
    cause: serializeCause(extracted.cause, depth + 1, seen),
  }
}

/**
 * Reads only whitelisted properties of an error and its causes: name,
 * message, code and stack. Library-specific fields that hold request data
 * (axios config, TypeORM parameters) are never copied.
 */
export function serializeError(error: unknown): SerializedError {
  try {
    const extracted = runAdapters(error)
    const stack =
      typeof (error as any)?.stack === 'string'
        ? (error as any).stack
        : undefined
    const seen = new Set<unknown>([error])
    return {
      type: typeOf(error),
      message: messageOf(error),
      code: extracted.code,
      stack,
      origin: originOf(stack),
      usecase: usecaseOf(error),
      cause: serializeCause(extracted.cause, 1, seen),
      status: extracted.status,
      dependency: extracted.dependency,
      domain: extracted.domain,
      hint:
        typeof (error as any)?.hint === 'string'
          ? (error as any).hint
          : undefined,
      hintDetail:
        typeof (error as any)?.hintDetail === 'string'
          ? (error as any).hintDetail
          : undefined,
    }
  } catch {
    return { type: 'NonError', message: '[unserializable error]' }
  }
}

export function isErrorLike(value: unknown): boolean {
  return (
    value instanceof Error ||
    (typeof value === 'object' &&
      value !== null &&
      typeof (value as any).message === 'string' &&
      typeof (value as any).stack === 'string')
  )
}
