import type { Span } from '@opentelemetry/api'
import { CAPTURE_ATTR } from './attributes'
import { bodyBytes, renderBytes } from './body'
import { maskHeaders, truncateUtf8 } from './mask'
import { put, recording } from './pending'
import { captureActive, captureSettings } from './settings'

/**
 * Queue payloads on the job / consumer span and the producer span:
 * `messaging.message.body` (masked, first LOG_BODY_MAX_BYTES bytes),
 * `messaging.message.body.size` (bytes), `messaging.message.body.truncated`
 * (with a body) and `messaging.message.headers`
 * (JSON object, masked). Kafka: value + headers; RabbitMQ: content +
 * properties.headers and the message properties; BullMQ: job.data + the job
 * name and options.
 */
export interface MessageCapture {
  /** Buffer / string as sent, or the object (BullMQ job.data) as JSON. */
  body: unknown
  headers?: Record<string, unknown>
  contentType?: string
  contentEncoding?: string
}

function headerValue(value: unknown): unknown {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string' || Buffer.isBuffer(value)) return value
  if (Array.isArray(value)) return value.map((item) => headerValue(item) ?? '')
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

/** Header values as strings (objects as JSON); undefined dropped. */
export function messageHeaders(
  headers: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(headers ?? {})) {
    const text = headerValue(value)
    if (text !== undefined) out[key] = text
  }
  return out
}

export function captureMessage(span: Span, message: MessageCapture): void {
  if (!recording(span) || !captureActive()) return
  try {
    const { maxBytes } = captureSettings()
    const headers = messageHeaders(message.headers)
    if (Object.keys(headers).length) {
      put(
        span,
        CAPTURE_ATTR.messageHeaders,
        truncateUtf8(JSON.stringify(maskHeaders(headers, false)), maxBytes)
          .text,
      )
    }
    const body = bodyBytes(message.body)
    if (!body) return
    const contentType =
      message.contentType ??
      (typeof headers['content-type'] === 'string'
        ? headers['content-type']
        : undefined) ??
      (body.json ? 'application/json' : undefined)
    const rendered = renderBytes(body.bytes.subarray(0, maxBytes), {
      contentType,
      contentEncoding: message.contentEncoding,
      size: body.bytes.length,
      complete: body.bytes.length <= maxBytes,
      limit: maxBytes,
    })
    put(span, CAPTURE_ATTR.messageBodySize, rendered.size)
    if (rendered.text) {
      put(span, CAPTURE_ATTR.messageBody, rendered.text)
      put(span, CAPTURE_ATTR.messageBodyTruncated, rendered.truncated)
    }
  } catch {
    // never affect the job
  }
}

/** `producerHook` of @opentelemetry/instrumentation-kafkajs. */
export function kafkaProducerHook(
  span: Span,
  info: {
    topic: string
    message: {
      key?: unknown
      value: unknown
      headers?: Record<string, unknown>
    }
  },
): void {
  const message = info?.message
  if (!message) return
  captureMessage(span, {
    body: message.value,
    headers: {
      ...(message.key !== undefined && message.key !== null
        ? { 'kafka.key': message.key }
        : {}),
      ...(message.headers ?? {}),
    },
  })
}

/** RabbitMQ message properties (non-empty) next to its application headers. */
export function amqpHeaders(
  properties: Record<string, unknown> | undefined,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const { headers, ...rest } = properties ?? {}
  const out: Record<string, unknown> = { ...extra }
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined && value !== null && value !== '') out[key] = value
  }
  return { ...out, ...((headers as Record<string, unknown>) ?? {}) }
}

/** `publishHook` of @opentelemetry/instrumentation-amqplib. */
export function amqpPublishHook(
  span: Span,
  info: {
    exchange: string
    routingKey: string
    content: Buffer
    options?: Record<string, unknown>
  },
): void {
  if (!info) return
  captureMessage(span, {
    body: info.content,
    headers: amqpHeaders(info.options, {
      exchange: info.exchange,
      routingKey: info.routingKey,
    }),
    contentType: info.options?.contentType as string | undefined,
    contentEncoding: info.options?.contentEncoding as string | undefined,
  })
}
