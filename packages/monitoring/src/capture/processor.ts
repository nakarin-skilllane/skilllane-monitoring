import {
  isSensitiveKey,
  maskBodyText,
  maskHeaderJson,
  maskHeaderValue,
  maskIdentifier,
  maskNumber,
  maskPathByRoute,
  maskQuery,
  maskStatement,
  maskUrl,
  REDACTED,
  redactValue,
  truncateUtf8,
} from '../contract'
import type { Attributes, AttributeValue } from '@opentelemetry/api'
import { CAPTURE_ATTR } from './attributes'
import { type DbParameter, foreignParams, paramList, paramsJson } from './db'
import { put, runPending, wasWritten } from './pending'
import { captureSettings } from './settings'

/**
 * First span processor of the SDK. `onEnding` (the span can still take
 * attributes) writes what the capture hooks collected, then masks everything
 * other code put on the span, so no exporter ever sees an unmasked value: the
 * app's own hooks (school-core-api's http.request.body), instrumentations'
 * raw bind values (oracledb `db.operation.parameter.<i>`, TypeORM
 * `db.statement.parameters`, pg `db.postgresql.values`, moved into
 * `skilllane.monitoring.db.parameters`), url.full / url.query, statements, every other
 * attribute (the key rule on its name, the value rule on its value: a Kafka
 * message key, a BullMQ job id or `enduser.id` holding a token), every
 * event's attributes and the status message. Runs with LOG_CAPTURE=off too.
 */

interface SpanLike {
  attributes?: Attributes
  events?: Array<{ name: string; attributes?: Attributes }>
  status?: { message?: string }
}

const BODY_KEYS = [
  CAPTURE_ATTR.requestBody,
  CAPTURE_ATTR.responseBody,
  CAPTURE_ATTR.messageBody,
]
const HEADER_KEYS = [
  CAPTURE_ATTR.requestHeaders,
  CAPTURE_ATTR.responseHeaders,
  CAPTURE_ATTR.messageHeaders,
]
const URL_KEYS = ['url.full', 'http.url', 'http.target']
const STATEMENT_KEYS = ['db.statement', 'db.query.text']
const HEADER_PREFIXES = ['http.request.header.', 'http.response.header.']
// Ids an app or library builds from its data (dedupe by email, reset:<email>:<token>).
const ID_KEYS = new Set([
  'job.id',
  'messaging.message.id',
  'messaging.message.conversation_id',
  'messaging.kafka.message.key',
])
// Paths that may hold a value under a sensitive route parameter (/reset-password/:token), with url.path.
const PATH_KEYS = new Set(['http.target'])
const HANDLED = new Set<string>([
  ...BODY_KEYS,
  ...HEADER_KEYS,
  ...URL_KEYS,
  ...STATEMENT_KEYS,
  CAPTURE_ATTR.urlQuery,
  CAPTURE_ATTR.dbParameters,
  'url.path',
])

function maxBytes(): number {
  return captureSettings().maxBytes
}

function parsedParams(value: string): DbParameter[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((param) => param && typeof param.key === 'string')
      : []
  } catch {
    return []
  }
}

/** The key rule on `name`, the value rule on a string / string[] value, a Thai ID in a number. */
function maskAttribute(
  name: string,
  value: AttributeValue | undefined,
): AttributeValue | undefined {
  if (value === undefined || value === null) return value
  if (typeof value === 'string') {
    if (isSensitiveKey(name)) return REDACTED
    return ID_KEYS.has(name) ? maskIdentifier(value) : redactValue(value)
  }
  if (typeof value === 'number')
    return maskNumber(value) === REDACTED ? REDACTED : value
  if (Array.isArray(value)) {
    if (isSensitiveKey(name)) return value.map(() => REDACTED)
    return (value as unknown[]).map((item) =>
      typeof item === 'string' ? redactValue(item) : item,
    ) as AttributeValue
  }
  return value
}

function changed(
  before: AttributeValue | undefined,
  after: AttributeValue | undefined,
): boolean {
  if (before === after) return false
  if (Array.isArray(before) && Array.isArray(after)) {
    return (
      before.length !== after.length ||
      before.some((item, i) => item !== after[i])
    )
  }
  return true
}

function maskSpan(span: any, attributes: Attributes): void {
  const max = maxBytes()
  for (const key of BODY_KEYS) {
    const value = attributes[key]
    if (typeof value === 'string' && !wasWritten(span, key, value))
      put(span, key, maskBodyText(value, max))
  }
  for (const key of HEADER_KEYS) {
    const value = attributes[key]
    if (typeof value === 'string' && !wasWritten(span, key, value)) {
      put(
        span,
        key,
        maskHeaderJson(value, key !== CAPTURE_ATTR.messageHeaders, max),
      )
    }
  }
  const query = attributes[CAPTURE_ATTR.urlQuery]
  if (
    typeof query === 'string' &&
    !wasWritten(span, CAPTURE_ATTR.urlQuery, query)
  ) {
    put(
      span,
      CAPTURE_ATTR.urlQuery,
      truncateUtf8(maskQuery(query.replace(/^\?/, '')), max).text,
    )
  }
  const route =
    typeof attributes['http.route'] === 'string'
      ? attributes['http.route']
      : undefined
  for (const key of URL_KEYS) {
    const value = attributes[key]
    if (typeof value !== 'string') continue
    let masked = maskUrl(value)
    if (route && PATH_KEYS.has(key)) masked = maskPathByRoute(masked, route)
    if (masked !== value) put(span, key, masked)
  }
  const path = attributes['url.path']
  if (typeof path === 'string') {
    const masked = maskPathByRoute(redactValue(path), route)
    if (masked !== path) put(span, 'url.path', masked)
  }

  const system = String(
    attributes['db.system.name'] ?? attributes['db.system'] ?? '',
  )
  let statement: string | undefined
  for (const key of STATEMENT_KEYS) {
    const value = attributes[key]
    if (typeof value !== 'string') continue
    statement ??= value
    put(span, key, maskStatement(value, system, max))
  }
  const foreign = foreignParams(attributes)
  const current = attributes[CAPTURE_ATTR.dbParameters]
  if (current === undefined && foreign.list.count) {
    put(span, CAPTURE_ATTR.dbParameters, paramsJson(statement, foreign.list))
  } else if (
    typeof current === 'string' &&
    !wasWritten(span, CAPTURE_ATTR.dbParameters, current)
  ) {
    put(
      span,
      CAPTURE_ATTR.dbParameters,
      paramsJson(statement, paramList(parsedParams(current))) || '[]',
    )
  }
  for (const key of foreign.keys) delete attributes[key]

  // Everything else: per-header attributes by the header rules, any other
  // attribute by the key rule on its name and the value rule on its value.
  for (const key of Object.keys(attributes)) {
    if (HANDLED.has(key) || wasWritten(span, key, attributes[key])) continue
    const value = attributes[key]
    const prefix = HEADER_PREFIXES.find((candidate) =>
      key.startsWith(candidate),
    )
    let masked: AttributeValue | undefined
    if (prefix) {
      const name = key.slice(prefix.length).replace(/_/g, '-')
      masked = Array.isArray(value)
        ? (value as unknown[]).map((item) =>
            maskHeaderValue(name, String(item)),
          )
        : typeof value === 'string'
          ? maskHeaderValue(name, value)
          : value
    } else {
      masked = maskAttribute(key, value)
    }
    if (masked !== undefined && changed(value, masked)) put(span, key, masked)
  }

  for (const event of (span as SpanLike).events ?? []) {
    const eventAttributes = event.attributes
    if (!eventAttributes) continue
    // exception.message / exception.stacktrace (its first line repeats the message) and any event's own attributes.
    for (const key of Object.keys(eventAttributes)) {
      const masked = maskAttribute(key, eventAttributes[key])
      if (masked !== undefined) eventAttributes[key] = masked
    }
  }
  const status = (span as SpanLike).status
  if (status && typeof status.message === 'string')
    status.message = redactValue(status.message)
}

export class CaptureSpanProcessor {
  onStart(): void {}

  onEnding(span: unknown): void {
    try {
      runPending(span as any)
      const attributes = (span as SpanLike).attributes
      if (attributes && typeof attributes === 'object')
        maskSpan(span, attributes)
    } catch {
      // never affect tracing
    }
  }

  onEnd(): void {}

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}
