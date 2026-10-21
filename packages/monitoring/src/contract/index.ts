/**
 * skilllane-monitoring-contract: the wire format between skilllane-monitoring (publisher, inside
 * the customer's app) and the skilllane-monitoring engine (subscriber, writes ClickHouse).
 *
 * One queue message = one Envelope, encoded as UTF-8 JSON. Version 1.
 * This file is the source of truth; SPEC.md §4 (skilllane-monitoring engine repository) explains it in prose.
 */

export const CONTRACT_VERSION = 1 as const

/** What a message carries. */
export type TelemetryStream = 'logs' | 'spans'
export const STREAMS: readonly TelemetryStream[] = ['logs', 'spans']

/** Queue transports the customer can choose (LOG_EXPORT). */
export const QUEUE_TRANSPORTS = ['kafka', 'rabbitmq', 'bullmq'] as const
export type QueueTransport = (typeof QUEUE_TRANSPORTS)[number]

/**
 * Transports that carry envelopes: the queues, and http (POST straight to the
 * engine, for an app without a queue).
 */
export const ENVELOPE_TRANSPORTS = [...QUEUE_TRANSPORTS, 'http'] as const
export type EnvelopeTransport = (typeof ENVELOPE_TRANSPORTS)[number]

/** Every LOG_EXPORT value the SDK accepts. http/otlp/stdout are not queues. */
export const EXPORT_MODES = [
  'kafka',
  'rabbitmq',
  'bullmq',
  'http',
  'otlp',
  'stdout',
] as const
export type ExportMode = (typeof EXPORT_MODES)[number]

export function isQueueTransport(value: unknown): value is QueueTransport {
  return (QUEUE_TRANSPORTS as readonly unknown[]).includes(value)
}

export function isEnvelopeTransport(
  value: unknown,
): value is EnvelopeTransport {
  return (ENVELOPE_TRANSPORTS as readonly unknown[]).includes(value)
}

/**
 * http transport: the engine's endpoint for one stream is
 * `${LOG_HTTP_URL}${INGEST_PATH}/<stream>`, body = one envelope (JSON, may be
 * gzip), `Authorization: Bearer <token>`. 2xx = the rows are in ClickHouse.
 */
export const INGEST_PATH = '/api/ingest'

/**
 * Kafka topic, RabbitMQ routing key + queue name, BullMQ queue name.
 * Dots only: BullMQ forbids ':' in queue names.
 */
export const DEFAULT_TOPICS: Record<TelemetryStream, string> = {
  logs: 'skilllane-monitoring.logs',
  spans: 'skilllane-monitoring.spans',
}

/** RabbitMQ: one durable direct exchange; routing key = topic name. */
export const DEFAULT_RABBITMQ_EXCHANGE = 'skilllane-monitoring.telemetry'

/** Kafka / RabbitMQ header names. BullMQ uses the job name for the stream. */
export const HEADER_STREAM = 'skilllane-monitoring-stream'
export const HEADER_VERSION = 'skilllane-monitoring-v'

/** Default max encoded bytes of one message; the publisher splits batches above it. */
export const DEFAULT_MAX_MESSAGE_BYTES = 800_000

/** Who sent the batch. Same for every item in it. */
export interface ResourceInfo {
  'service.name': string
  'service.version'?: string
  /** dev | staging | prod … from OTEL_ENV, then NODE_ENV. */
  'deployment.environment.name'?: string
  'host.name'?: string
  /** APP_ROLE: api | worker | persister … */
  'app.role'?: string
  'telemetry.sdk.name'?: string
  'telemetry.sdk.version'?: string
  /**
   * MASK_VERSION of the rules the sender masked its items with (src/mask).
   * Absent or older: the engine masks the items itself.
   */
  'skilllane.monitoring.mask'?: string
}

export interface Envelope<T> {
  v: typeof CONTRACT_VERSION
  stream: TelemetryStream
  resource: ResourceInfo
  /** ISO time the batch left the process. */
  sentAt: string
  items: T[]
}

export type LogLevelName = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

/**
 * One log line exactly as skilllane-monitoring writes it to stdout: flat ECS keys
 * with dots, already redacted. `labels` is the only nested object.
 */
export type LogItem = {
  '@timestamp': string
  'log.level': LogLevelName
  'log.logger'?: string
  'event.code': string
  message: string
  labels?: Record<string, string>
} & Record<string, unknown>

export type SpanKindName =
  | 'INTERNAL'
  | 'SERVER'
  | 'CLIENT'
  | 'PRODUCER'
  | 'CONSUMER'
export type SpanStatusName = 'UNSET' | 'OK' | 'ERROR'
export type AttributeValue =
  | string
  | number
  | boolean
  | Array<string | number | boolean | null>

export interface SpanEventItem {
  name: string
  timeUnixNano: string
  attributes?: Record<string, AttributeValue>
}

/** One finished OTel span (ReadableSpan), converted. */
export interface SpanItem {
  /** 32 lower-case hex chars. */
  traceId: string
  /** 16 lower-case hex chars. */
  spanId: string
  /** Absent for a root span. */
  parentSpanId?: string
  /** The parent lives in another process (came in as traceparent). */
  parentIsRemote?: boolean
  name: string
  kind: SpanKindName
  /** Nanoseconds since the Unix epoch as a decimal string (exceeds 2^53). */
  startTimeUnixNano: string
  endTimeUnixNano: string
  status: { code: SpanStatusName; message?: string }
  attributes: Record<string, AttributeValue>
  events?: SpanEventItem[]
  links?: Array<{ traceId: string; spanId: string }>
  /** Instrumentation scope, e.g. @opentelemetry/instrumentation-http. */
  scope?: { name: string; version?: string }
}

export type LogEnvelope = Envelope<LogItem>
export type SpanEnvelope = Envelope<SpanItem>
export type AnyEnvelope = LogEnvelope | SpanEnvelope

/**
 * Environment variable names. The SDK and the engine read the same .env:
 * LOG_EXPORT picks the queue for both sides.
 */
export const ENV = {
  // which queue (both sides)
  transport: 'LOG_EXPORT',
  // Kafka
  kafkaBrokers: 'LOG_KAFKA_BROKERS',
  kafkaClientId: 'LOG_KAFKA_CLIENT_ID',
  kafkaSsl: 'LOG_KAFKA_SSL',
  kafkaSaslMechanism: 'LOG_KAFKA_SASL_MECHANISM',
  kafkaSaslUsername: 'LOG_KAFKA_SASL_USERNAME',
  kafkaSaslPassword: 'LOG_KAFKA_SASL_PASSWORD',
  // RabbitMQ
  rabbitmqUrl: 'LOG_RABBITMQ_URL',
  rabbitmqExchange: 'LOG_RABBITMQ_EXCHANGE',
  // BullMQ
  bullmqRedisUrl: 'LOG_BULLMQ_REDIS_URL',
  bullmqPrefix: 'LOG_BULLMQ_PREFIX',
  // http (no queue: straight to the engine)
  httpUrl: 'LOG_HTTP_URL',
  httpToken: 'LOG_HTTP_TOKEN',
  // names
  topicLogs: 'LOG_TOPIC_LOGS',
  topicSpans: 'LOG_TOPIC_SPANS',
  // publisher batching (SDK)
  batchMs: 'LOG_EXPORT_BATCH_MS',
  batchSize: 'LOG_EXPORT_BATCH_SIZE',
  maxQueue: 'LOG_EXPORT_MAX_QUEUE',
  maxBytes: 'LOG_EXPORT_MAX_BYTES',
  shutdownMs: 'LOG_EXPORT_SHUTDOWN_MS',
} as const

type EnvSource = Record<string, string | undefined>

function envValue(env: EnvSource, name: string): string | undefined {
  const value = env[name]?.trim()
  return value ? value : undefined
}

/**
 * LOG_EXPORT when valid; otherwise the first configured connection:
 * Kafka brokers → kafka, RabbitMQ URL → rabbitmq, BullMQ Redis → bullmq,
 * engine URL → http, OTEL_EXPORTER_ENDPOINT → otlp, nothing → stdout.
 * A queue wins over http: with both set, the app uses its queue.
 */
export function resolveExportMode(env: EnvSource = process.env): {
  mode: ExportMode
  /** LOG_EXPORT held a value that is not a mode; it was ignored. */
  invalid?: string
} {
  const explicit = envValue(env, ENV.transport)?.toLowerCase()
  if (explicit && (EXPORT_MODES as readonly string[]).includes(explicit)) {
    return { mode: explicit as ExportMode }
  }
  const auto: ExportMode = envValue(env, ENV.kafkaBrokers)
    ? 'kafka'
    : envValue(env, ENV.rabbitmqUrl)
      ? 'rabbitmq'
      : envValue(env, ENV.bullmqRedisUrl)
        ? 'bullmq'
        : envValue(env, ENV.httpUrl)
          ? 'http'
          : envValue(env, 'OTEL_EXPORTER_ENDPOINT')
            ? 'otlp'
            : 'stdout'
  return explicit ? { mode: auto, invalid: explicit } : { mode: auto }
}

/** Topic / queue name of a stream, after LOG_TOPIC_* overrides. */
export function topicName(
  stream: TelemetryStream,
  env: EnvSource = process.env,
): string {
  const override = envValue(
    env,
    stream === 'logs' ? ENV.topicLogs : ENV.topicSpans,
  )
  return override ?? DEFAULT_TOPICS[stream]
}

export function rabbitmqExchange(env: EnvSource = process.env): string {
  return envValue(env, ENV.rabbitmqExchange) ?? DEFAULT_RABBITMQ_EXCHANGE
}

export function isEnvelope(value: unknown): value is AnyEnvelope {
  const v = value as Partial<AnyEnvelope> | null
  return (
    !!v &&
    typeof v === 'object' &&
    v.v === CONTRACT_VERSION &&
    (v.stream === 'logs' || v.stream === 'spans') &&
    Array.isArray(v.items) &&
    typeof v.resource === 'object' &&
    v.resource !== null &&
    typeof v.resource['service.name'] === 'string'
  )
}

/** Accepts a Kafka/RabbitMQ Buffer, a string, or a BullMQ job.data object. */
export function parseEnvelope(
  raw: Buffer | Uint8Array | string | object,
): AnyEnvelope {
  let value: unknown = raw
  if (typeof raw === 'string') value = JSON.parse(raw)
  else if (raw instanceof Uint8Array)
    value = JSON.parse(Buffer.from(raw).toString('utf8'))
  if (!isEnvelope(value))
    throw new Error('Not an skilllane-monitoring-contract v1 envelope')
  return value
}

export function encodeEnvelope(envelope: AnyEnvelope): Buffer {
  return Buffer.from(JSON.stringify(envelope), 'utf8')
}

/** OTel HrTime [seconds, nanos] → decimal nanosecond string. */
export function hrTimeToNanos(time: [number, number]): string {
  return (
    BigInt(Math.trunc(time[0])) * 1_000_000_000n +
    BigInt(Math.trunc(time[1]))
  ).toString()
}

/** ISO string (ms precision) → decimal nanosecond string. */
export function isoToNanos(iso: string): string {
  const ms = Date.parse(iso)
  return (BigInt(Number.isFinite(ms) ? ms : 0) * 1_000_000n).toString()
}

/**
 * Decimal nanoseconds → ClickHouse DateTime64 text in UTC,
 * 'YYYY-MM-DD hh:mm:ss.ffffff' (digits = 6) or '.fff' (digits = 3).
 */
export function nanosToDateTime64(nanos: string, digits = 6): string {
  const n = BigInt(nanos)
  const iso = new Date(Number(n / 1_000_000n)).toISOString()
  const fraction = (n % 1_000_000_000n)
    .toString()
    .padStart(9, '0')
    .slice(0, digits)
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}${digits > 0 ? `.${fraction}` : ''}`
}

/** Duration in nanoseconds between two decimal nanosecond strings (never negative). */
export function durationNanos(startNanos: string, endNanos: string): bigint {
  const d = BigInt(endNanos) - BigInt(startNanos)
  return d > 0n ? d : 0n
}

/** The masking rules both ends apply (SPEC.md §3 of the skilllane-monitoring engine repository): the SDK before export, the engine for other senders. */
export * from './mask'
