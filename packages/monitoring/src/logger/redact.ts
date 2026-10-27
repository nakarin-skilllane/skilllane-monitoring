import {
  isSensitiveKey,
  maskEndpoint,
  maskIdentifier,
  maskPathByRoute,
  REDACTED,
  redactText,
  redactValue,
  stripQuery,
} from '../contract'
import { ALLOWED_FIELDS, MAX_LABELS } from '../types'

// The rules themselves are shared with the engine and the demo seed (skilllane-monitoring-contract, SPEC.md §3).
export {
  isThaiNationalId,
  REDACTED,
  redactText,
  redactValue,
  stripQuery,
} from '../contract'

/** Free text: the value rule, and query strings removed. */
const TEXT_FIELDS = [
  'message',
  'error.message',
  'error.stack_trace',
  'error.hint',
  'error.hint_detail',
  'error.fix',
  'db.statement',
  'reason',
]

/** Values that may carry a token: the value rule. */
const VALUE_FIELDS = ['user.id', 'url.domain']
/** Where a dependency is: a URL or `user:password@host` (the password). */
const ENDPOINT_FIELDS = ['dependency.name', 'dependency.host']

function redactCause(cause: any, depth = 0): any {
  if (!cause || typeof cause !== 'object' || depth > 3) return cause
  return {
    ...cause,
    message:
      typeof cause.message === 'string' ? redactText(cause.message) : undefined,
    ...(typeof cause.code === 'string'
      ? { code: redactValue(cause.code) }
      : {}),
    ...(typeof cause.type === 'string'
      ? { type: redactValue(cause.type) }
      : {}),
    cause: redactCause(cause.cause, depth + 1),
  }
}

/**
 * Applies the privacy rules to a record in place and returns the names of
 * fields that are not in the spec (dropped), for a dev-mode warning.
 */
export function redactRecord(record: Record<string, unknown>): string[] {
  const dropped: string[] = []
  for (const key of Object.keys(record)) {
    if (!ALLOWED_FIELDS.has(key)) {
      dropped.push(key)
      delete record[key]
    }
  }
  for (const key of TEXT_FIELDS) {
    if (typeof record[key] === 'string') {
      record[key] = redactText(record[key] as string)
    }
  }
  for (const key of VALUE_FIELDS) {
    if (typeof record[key] === 'string')
      record[key] = redactValue(record[key] as string)
  }
  for (const key of ENDPOINT_FIELDS) {
    if (typeof record[key] === 'string')
      record[key] = maskEndpoint(record[key] as string)
  }
  // A job id built like a key (reset:<email>:<token>): its segments too.
  if (typeof record['job.id'] === 'string')
    record['job.id'] = maskIdentifier(record['job.id'] as string)
  if (typeof record['url.path'] === 'string') {
    // A segment under a sensitive route parameter (/reset-password/:token), a JWT.
    const route =
      typeof record['http.route'] === 'string'
        ? (record['http.route'] as string)
        : undefined
    record['url.path'] = maskPathByRoute(
      redactValue(stripQuery(record['url.path'] as string)),
      route,
    )
  }
  if (record['error.cause']) {
    record['error.cause'] = redactCause(record['error.cause'])
  }
  const labels = record.labels as Record<string, string> | undefined
  if (labels) {
    const entries = Object.entries(labels).slice(0, MAX_LABELS)
    // The key rule, as on every other key: the label stays, its value does not.
    record.labels = Object.fromEntries(
      entries.map(([key, value]) => [
        key,
        isSensitiveKey(key) ? REDACTED : redactText(String(value)),
      ]),
    )
  }
  return dropped
}
