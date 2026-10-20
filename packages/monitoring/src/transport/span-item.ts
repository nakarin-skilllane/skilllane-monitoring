import type {
  AttributeValue,
  SpanItem,
  SpanKindName,
  SpanStatusName,
} from '@skilllane/monitoring-contract'
import { hrTimeToNanos, truncateUtf8 } from '@skilllane/monitoring-contract'
import { type Attributes, TraceFlags } from '@opentelemetry/api'
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import type { Publisher } from './publisher'

const KINDS: SpanKindName[] = [
  'INTERNAL',
  'SERVER',
  'CLIENT',
  'PRODUCER',
  'CONSUMER',
]
const STATUSES: SpanStatusName[] = ['UNSET', 'OK', 'ERROR']
const INVALID_SPAN_ID = '0000000000000000'

function attributes(
  input: Attributes | undefined,
): Record<string, AttributeValue> {
  const out: Record<string, AttributeValue> = {}
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value === undefined || value === null) continue
    out[key] = Array.isArray(value)
      ? (value as unknown[]).map(
          (item) => (item ?? null) as string | number | boolean | null,
        )
      : (value as AttributeValue)
  }
  return out
}

/** OTel ReadableSpan (sdk-trace 2.x field names) → contract SpanItem. */
export function toSpanItem(span: ReadableSpan): SpanItem {
  const context = span.spanContext()
  const item: SpanItem = {
    traceId: context.traceId,
    spanId: context.spanId,
    name: span.name,
    kind: KINDS[span.kind] ?? 'INTERNAL',
    startTimeUnixNano: hrTimeToNanos(span.startTime),
    endTimeUnixNano: hrTimeToNanos(span.endTime),
    status: { code: STATUSES[span.status?.code ?? 0] ?? 'UNSET' },
    attributes: attributes(span.attributes),
  }
  if (span.status?.message) item.status.message = span.status.message
  const parent = span.parentSpanContext
  if (parent?.spanId && parent.spanId !== INVALID_SPAN_ID) {
    item.parentSpanId = parent.spanId
    if (parent.isRemote) item.parentIsRemote = true
  }
  if (span.events?.length) {
    item.events = span.events.map((event) => ({
      name: event.name,
      timeUnixNano: hrTimeToNanos(event.time),
      ...(event.attributes ? { attributes: attributes(event.attributes) } : {}),
    }))
  }
  if (span.links?.length) {
    item.links = span.links.map((link) => ({
      traceId: link.context.traceId,
      spanId: link.context.spanId,
    }))
  }
  const scope = span.instrumentationScope
  if (scope?.name) {
    item.scope = scope.version
      ? { name: scope.name, version: scope.version }
      : { name: scope.name }
  }
  return item
}

// JSON objects / arrays among the captured values: cut so they stay valid JSON.
const HEADER_JSON = new Set([
  'http.request.headers',
  'http.response.headers',
  'messaging.message.headers',
])
const PARAMS_JSON = 'skilllane.monitoring.db.parameters'
const TRUNCATED_FLAG: Record<string, string> = {
  'http.request.body': 'http.request.body.truncated',
  'http.response.body': 'http.response.body.truncated',
  'messaging.message.body': 'messaging.message.body.truncated',
}

function encodedSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? '')
}

/** A headers JSON object whose values are cut (then dropped) until its encoded size is at most `max`. */
function cutHeaders(json: string, max: number): string {
  let headers: Record<string, unknown>
  try {
    headers = JSON.parse(json)
  } catch {
    return truncateUtf8(json, Math.max(0, Math.floor(max / 6))).text
  }
  for (const limit of [1024, 256, 64, 16]) {
    const cut = Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [
        name,
        Array.isArray(value)
          ? value.map((item) =>
              String(item).length > limit
                ? `${String(item).slice(0, limit)}…`
                : item,
            )
          : String(value).length > limit
            ? `${String(value).slice(0, limit)}…`
            : value,
      ]),
    )
    const text = JSON.stringify(cut)
    if (encodedSize(text) <= max) return text
  }
  return '{}'
}

/** The parameters JSON with as many whole entries as fit, then the `<n> more` entry. */
function cutParams(json: string, max: number): string {
  let params: unknown[]
  try {
    params = JSON.parse(json)
    if (!Array.isArray(params)) return '[]'
  } catch {
    return '[]'
  }
  let keep = params.length
  while (keep > 0) {
    keep = Math.floor(keep / 2)
    const text = JSON.stringify([
      ...params.slice(0, keep),
      {
        key: '…',
        type: 'null',
        value: `${params.length - keep} more`,
        truncated: true,
      },
    ])
    if (encodedSize(text) <= max) return text
  }
  return '[]'
}

/** Text cut to about `chars` characters, never inside a surrogate pair. */
function cutText(text: string, chars: number): string {
  let cut = text.slice(0, Math.max(0, chars))
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return cut
}

/**
 * A span item over the message cap (LOG_EXPORT_MAX_BYTES): its largest string
 * values (bodies, header and parameter JSON, statements, an exception's stack)
 * are cut, largest first, until it fits, rather than the whole span being
 * dropped: JSON-escaping makes control bytes 6× and quotes in header JSON 4×
 * their size, so values each under LOG_BODY_MAX_BYTES can add up past it.
 */
export function fitSpanItem(
  input: unknown,
  maxBytes: number,
): SpanItem | undefined {
  const item = input as SpanItem
  if (!item || typeof item !== 'object') return undefined
  const attributes: Record<string, AttributeValue> = {
    ...(item.attributes ?? {}),
  }
  const events = (item.events ?? []).map((event) => ({
    ...event,
    attributes: event.attributes ? { ...event.attributes } : undefined,
  }))
  const build = (): SpanItem => ({
    ...item,
    attributes,
    ...(item.events ? { events } : {}),
  })
  let size = encodedSize(build())
  for (let round = 0; round < 32 && size > maxBytes; round++) {
    // The largest string anywhere on the span.
    let target: Record<string, AttributeValue | undefined> | undefined
    let key = ''
    let largest = 0
    const consider = (owner: Record<string, AttributeValue | undefined>) => {
      for (const [name, value] of Object.entries(owner)) {
        if (typeof value !== 'string' || value.length < 32) continue
        const encoded = encodedSize(value)
        if (encoded > largest) {
          largest = encoded
          target = owner
          key = name
        }
      }
    }
    consider(attributes)
    for (const event of events) if (event.attributes) consider(event.attributes)
    if (!target) break
    const value = target[key] as string
    const goal = Math.max(0, largest - (size - maxBytes) - 64)
    if (HEADER_JSON.has(key)) target[key] = cutHeaders(value, goal)
    else if (key === PARAMS_JSON) target[key] = cutParams(value, goal)
    else {
      target[key] = cutText(value, Math.floor((value.length * goal) / largest))
      if (target === attributes && TRUNCATED_FLAG[key])
        attributes[TRUNCATED_FLAG[key]] = true
    }
    size = encodedSize(build())
  }
  return size <= maxBytes ? build() : undefined
}

/** Each sampled span, when it ends, goes to the spans publisher. */
export class QueueSpanProcessor implements SpanProcessor {
  constructor(
    private readonly publisher: Publisher,
    private readonly flushMs: number,
  ) {}

  onStart(): void {}

  onEnd(span: ReadableSpan): void {
    try {
      if (!(span.spanContext().traceFlags & TraceFlags.SAMPLED)) return
      this.publisher.push(toSpanItem(span))
    } catch {
      // never affect the traced code
    }
  }

  forceFlush(): Promise<void> {
    return this.publisher.flush(Date.now() + this.flushMs)
  }

  /** The queue export closes the publisher itself (after the logs). */
  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}
