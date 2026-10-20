import { amqpHeaders } from '../capture/messaging'
import { getLogger } from '../logger'
import { runJob } from '../jobs/run-job'
import { DependencyMonitor, isShuttingDown } from './dependency-monitor'

export interface RabbitWatch {
  name: string
  host?: string
  port?: number
  affects?: string[]
  configKeys?: string[]
}

/**
 * RabbitMQ connection state. The app creates a new amqplib connection on
 * every reconnect, so call `attach(connection)` each time one is opened.
 */
export class RabbitMonitor {
  private readonly monitor: DependencyMonitor

  constructor(watch: RabbitWatch) {
    this.monitor = new DependencyMonitor({
      type: 'rabbitmq',
      module: 'rabbitmq',
      ...watch,
    })
  }

  attach(connection: any): void {
    this.monitor.markUp()
    if (typeof connection?.on !== 'function') return
    connection.on('error', (error: unknown) => this.monitor.markDown(error))
    connection.on('close', (error?: unknown) => {
      if (!isShuttingDown()) this.monitor.markDown(error)
    })
  }

  /** A connect attempt failed (before any connection object exists). */
  connectFailed(error: unknown): void {
    this.monitor.markDown(error)
  }

  /** Reconnect gave up: consumers stop until the process restarts. */
  gaveUp(error?: unknown): void {
    this.monitor.markGaveUp('RABBITMQ_RECONNECT_EXHAUSTED', error)
  }
}

export interface RabbitMessageMeta {
  queue: string
  /** amqplib message (fields + properties). */
  message: any
  attempt?: number
  maxAttempts?: number
}

/** Wraps a consume callback: job lines, inflight, trace and redelivery. */
export function trackRabbitMessage<T>(
  meta: RabbitMessageMeta,
  fn: () => Promise<T>,
): Promise<T> {
  const deliveryTag = meta.message?.fields?.deliveryTag
  const id =
    meta.message?.properties?.messageId ??
    (deliveryTag === undefined ? undefined : String(deliveryTag))
  if (meta.message?.fields?.redelivered) {
    getLogger().event({
      event: 'job.redelivered',
      logger: `RabbitMQ:${meta.queue}`,
      fields: {
        'event.module': 'rabbitmq',
        'job.queue': meta.queue,
        'job.id': id,
      },
    })
  }
  return runJob(
    {
      kind: 'msg',
      source: 'rabbitmq',
      field: `msg:${meta.queue}:${id ?? Date.now()}`,
      queue: meta.queue,
      type: 'message',
      id,
      attempt: meta.attempt,
      maxAttempts: meta.maxAttempts,
      carrier: meta.message?.properties?.headers,
      logger: `RabbitMQ:${meta.queue}`,
      message: meta.message?.content
        ? {
            body: meta.message.content,
            headers: amqpHeaders(meta.message.properties, {
              exchange: meta.message.fields?.exchange,
              routingKey: meta.message.fields?.routingKey,
              redelivered: meta.message.fields?.redelivered,
            }),
            contentType: meta.message.properties?.contentType,
            contentEncoding: meta.message.properties?.contentEncoding,
          }
        : undefined,
    },
    fn,
  )
}
