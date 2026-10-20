import { getLogger } from '../logger'
import { runJob } from '../jobs/run-job'
import type { LogLevel } from '../types'
import { DependencyMonitor, isShuttingDown } from './dependency-monitor'

// kafkajs logLevel numbers: NOTHING 0, ERROR 1, WARN 2, INFO 4, DEBUG 5.
function levelOf(kafkaLevel: number): LogLevel | undefined {
  if (kafkaLevel === 1) return 'error'
  if (kafkaLevel === 2) return 'warn'
  if (kafkaLevel >= 4) return 'debug'
  return undefined
}

/**
 * `logCreator` for `new Kafka({ logCreator })`: kafkajs' own lines go through
 * the pipeline. Its INFO lines (every connect/rebalance) become debug.
 */
export const kafkaLogCreator =
  (_level: number) =>
  (entry: { namespace: string; level: number; log: Record<string, any> }) => {
    const level = levelOf(entry.level)
    if (!level) return
    const logger = getLogger()
    if (!logger.isLevelEnabled(level)) return
    const { message, error, stack } = entry.log ?? {}
    const asError =
      error !== undefined
        ? Object.assign(new Error(String(error)), stack ? { stack } : {})
        : undefined
    logger.event({
      event: 'app.log',
      level,
      logger: entry.namespace ? `kafkajs:${entry.namespace}` : 'kafkajs',
      message: typeof message === 'string' ? message : 'kafkajs log',
      error: asError,
      fields: { 'dependency.type': 'kafka', 'event.module': 'kafka' },
    })
  }

export interface KafkaWatch {
  name: string
  configKeys?: string[]
  /** Broker shown as the target, without credentials (see parseAddress). */
  host?: string
  port?: number
}

const KAFKA = { 'event.module': 'kafka' } as const

/** Attach before `consumer.run()`: rebalances, joins and crashes. */
export function watchKafkaConsumer(consumer: any, watch: KafkaWatch): void {
  const events = consumer?.events
  if (!events || typeof consumer.on !== 'function') return
  const logger = `KafkaConsumer:${watch.name}`
  consumer.on(events.REBALANCING, () =>
    getLogger().event({
      event: 'consumer.rebalancing',
      logger,
      fields: KAFKA,
    }),
  )
  consumer.on(events.GROUP_JOIN, (event: any) => {
    const assignment = event?.payload?.memberAssignment ?? {}
    const partitions = Object.values(assignment).reduce<number>(
      (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
      0,
    )
    getLogger().event({
      event: 'consumer.joined',
      logger,
      fields: { ...KAFKA, partitions },
    })
  })
  consumer.on(events.CRASH, (event: any) =>
    getLogger().event({
      event: 'consumer.crashed',
      logger,
      error: event?.payload?.error,
      fields: {
        ...KAFKA,
        'dependency.type': 'kafka',
        reason: event?.payload?.restart ? 'restart' : 'no_restart',
      },
    }),
  )
}

/** Producer connection state and request timeouts. */
export function watchKafkaProducer(
  producer: any,
  watch: KafkaWatch,
): DependencyMonitor {
  const monitor = new DependencyMonitor({
    type: 'kafka',
    name: watch.name,
    configKeys: watch.configKeys,
    host: watch.host,
    port: watch.port,
    module: 'kafka',
  })
  const events = producer?.events
  // A client without events (e.g. a test double) is simply not watched.
  if (!events || typeof producer.on !== 'function') return monitor
  producer.on(events.CONNECT, () => monitor.markUp())
  producer.on(events.DISCONNECT, () => {
    if (!isShuttingDown()) monitor.markDown()
  })
  producer.on(events.REQUEST_TIMEOUT, (event: any) =>
    getLogger().event({
      event: 'app.log',
      level: 'warn',
      logger: `KafkaProducer:${watch.name}`,
      message: 'Kafka request timed out',
      fields: {
        ...KAFKA,
        'dependency.type': 'kafka',
        'dependency.name': watch.name,
        'error.code': 'KafkaJSRequestTimeoutError',
        reason: event?.payload?.apiName,
      },
    }),
  )
  return monitor
}

export interface KafkaMessageMeta {
  topic: string
  partition: number
  offset: string
  headers?: Record<string, unknown>
  /** The message value and key, captured (masked) on the job span. */
  value?: unknown
  key?: unknown
  attempt?: number
  maxAttempts?: number
  /** False for errors that make Kafka redeliver the message. */
  isFinal?: (error: unknown) => boolean
}

/** Wraps the handling of one message: job lines, inflight, trace from headers. */
export function trackKafkaMessage<T>(
  meta: KafkaMessageMeta,
  fn: () => Promise<T>,
): Promise<T> {
  return runJob(
    {
      kind: 'msg',
      source: 'kafka',
      field: `msg:${meta.topic}:p${meta.partition}-o${meta.offset}`,
      queue: meta.topic,
      type: 'message',
      id: `p${meta.partition}-o${meta.offset}`,
      attempt: meta.attempt,
      maxAttempts: meta.maxAttempts,
      carrier: meta.headers,
      isFinal: meta.isFinal,
      logger: `Kafka:${meta.topic}`,
      message:
        meta.value === undefined
          ? undefined
          : {
              body: meta.value,
              headers: {
                ...(meta.key === undefined || meta.key === null
                  ? {}
                  : { 'kafka.key': meta.key }),
                ...(meta.headers ?? {}),
              },
            },
    },
    fn,
  )
}

/** Wraps one batch when messages are handled together (batch mode). */
export function trackKafkaBatch<T>(
  meta: {
    topic: string
    partition: number
    firstOffset: string
    lastOffset: string
    size: number
  },
  fn: () => Promise<T>,
): Promise<T> {
  const id = `p${meta.partition}-o${meta.firstOffset}..${meta.lastOffset}`
  return runJob(
    {
      kind: 'msg',
      source: 'kafka',
      field: `msg:${meta.topic}:${id}`,
      queue: meta.topic,
      type: `batch(${meta.size})`,
      id,
      logger: `Kafka:${meta.topic}`,
    },
    fn,
  )
}

/** A message was moved to the dead-letter topic. */
export function logDeadLettered(meta: {
  topic: string
  dlq: string
  partition?: number
  offset?: string
  error?: unknown
  reason?: string
  attempt?: number
  maxAttempts?: number
}): void {
  getLogger().event({
    event: 'message.dead_lettered',
    logger: `Kafka:${meta.topic}`,
    error: meta.error,
    fields: {
      ...KAFKA,
      'job.queue': meta.topic,
      'job.attempt': meta.attempt,
      'job.max_attempts': meta.maxAttempts,
      'job.id':
        meta.offset === undefined
          ? undefined
          : `p${meta.partition}-o${meta.offset}`,
      dlq: meta.dlq,
      reason: meta.reason,
    },
  })
}
