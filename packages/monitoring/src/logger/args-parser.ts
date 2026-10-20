import { isSensitiveKey, REDACTED } from '@skilllane/monitoring-contract'
import { isErrorLike } from '../errors/error-serializer'
import type { LogOptions } from '../types'

export interface ParsedArgs {
  message?: string
  context?: string
  error?: unknown
  options: LogOptions
  /** ECS fields mapped from a legacy metadata object. */
  fields: Record<string, unknown>
  labels: Record<string, string>
}

const OPTION_KEYS = new Set(['event', 'code', 'hint', 'hintDetail', 'reason'])
const ERROR_KEYS = ['err', 'error', 'exception']
const STACK_LINE = /\n\s+at\s/
// Legacy metadata keys that hold personal or bulky data and are never logged.
// A secret under any other name (newPassword, accessToken, apiKey …) stays a
// label with the value [REDACTED], so the field's presence still shows.
const DROPPED_KEYS = new Set([
  'dbParameters',
  'parameters',
  'body',
  'payload',
  'headers',
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !isErrorLike(value)
  )
}

function isOptions(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value)
  return keys.length > 0 && keys.every((key) => OPTION_KEYS.has(key))
}

function stackAsError(stack: string): Error {
  const error = new Error(stack.split('\n')[0].replace(/^\w*Error:\s*/, ''))
  error.stack = stack
  return error
}

function absorbMetadata(meta: Record<string, unknown>, parsed: ParsedArgs) {
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === null || value === '') continue
    if (OPTION_KEYS.has(key)) {
      ;(parsed.options as Record<string, unknown>)[key] = value
    } else if (ERROR_KEYS.includes(key) && parsed.error === undefined) {
      parsed.error = value
    } else if (key === 'stack' && typeof value === 'string') {
      parsed.error ??= stackAsError(value)
    } else if (key === 'dbQuery' || key === 'query') {
      if (typeof value === 'string') parsed.fields['db.statement'] = value
    } else if (key === 'schoolId' || key === 'school_id') {
      parsed.fields['organization.id'] = String(value)
    } else if (key === 'user_role' || key === 'currentRole') {
      parsed.fields['user.roles'] = [String(value)]
    } else if (key === 'labels' && isPlainObject(value)) {
      for (const [label, labelValue] of Object.entries(value)) {
        parsed.labels[label] = isSensitiveKey(label)
          ? REDACTED
          : String(labelValue)
      }
    } else if (DROPPED_KEYS.has(key)) {
      // bulky or personal: never logged
    } else if (isSensitiveKey(key)) {
      parsed.labels[key] = REDACTED
    } else if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      parsed.labels[key] = String(value)
    }
  }
}

/**
 * Accepts every shape NestJS forwards to a LoggerService:
 *   (msg) · (msg, context) · (msg, err, context) · (err, context)
 *   (msg, stack, context) · (msg, { code, hint, event, reason }, context)
 *   (msg, legacyMetadata, context)
 * A `Logger` created with a context always appends it as the last argument,
 * and `Logger.error(msg)` passes `undefined` before it.
 */
export function parseArgs(
  first: unknown,
  rest: unknown[],
  hasContext = true,
): ParsedArgs {
  const parsed: ParsedArgs = { options: {}, fields: {}, labels: {} }
  const params = [...rest]

  if (
    hasContext &&
    params.length > 0 &&
    typeof params[params.length - 1] === 'string' &&
    !STACK_LINE.test(params[params.length - 1] as string)
  ) {
    parsed.context = params.pop() as string
  }

  if (typeof first === 'string') {
    parsed.message = first
  } else if (isErrorLike(first)) {
    parsed.error = first
  } else if (isPlainObject(first)) {
    absorbMetadata(first, parsed)
    if (typeof first.message === 'string') parsed.message = first.message
  } else if (first !== undefined && first !== null) {
    parsed.message = String(first)
  }

  for (const param of params) {
    if (param === undefined || param === null) continue
    if (isErrorLike(param)) {
      parsed.error ??= param
    } else if (typeof param === 'string') {
      if (STACK_LINE.test(param)) parsed.error ??= stackAsError(param)
      else parsed.labels[`arg${Object.keys(parsed.labels).length}`] = param
    } else if (isPlainObject(param)) {
      if (isOptions(param)) Object.assign(parsed.options, param)
      else absorbMetadata(param, parsed)
    } else {
      parsed.error ??= param
    }
  }

  return parsed
}
