import {
  ENV,
  STREAMS,
  type TelemetryStream,
  topicName,
} from '@skilllane/monitoring-contract'
import type { Queue } from 'bullmq'
import type Redis from 'ioredis'
import { parseAddress } from '../integrations/dependency-monitor'
import { env } from '../otel/identity'
import { INTERNAL_NAME, markInternal } from './internal'
import { noop, type OutgoingMessage, type Transport } from './types'

const JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: true,
  removeOnFail: 1_000,
}

/**
 * BullMQ: queues `skilllane-monitoring.logs` / `skilllane-monitoring.spans` (prefix LOG_BULLMQ_PREFIX) on the
 * customer's Redis, over one ioredis connection of the SDK's own. Job name =
 * stream, data = the envelope. ioredis does not reconnect by itself: the
 * publisher reopens the connection on the next send, with backoff.
 */
export class BullmqTransport implements Transport {
  readonly name = 'bullmq' as const
  readonly target: string
  private readonly url: string
  private readonly prefix = env(ENV.bullmqPrefix) ?? 'bull'
  private client?: Redis
  private queues?: Record<TelemetryStream, Queue>
  private opening?: { client: Redis; queues: Queue[] }
  private connecting?: Promise<void>
  private generation = 0

  constructor() {
    this.url = env(ENV.bullmqRedisUrl) ?? ''
    const { host, port } = parseAddress(this.url)
    this.target = host ? `${host}:${port ?? 6379}` : ''
  }

  connect(): Promise<void> {
    if (this.queues) return Promise.resolve()
    this.connecting ??= this.open().finally(() => {
      this.connecting = undefined
    })
    return this.connecting
  }

  private async open(): Promise<void> {
    const generation = this.generation
    const { Queue } = require('bullmq')
    const ioredis = require('ioredis')
    const RedisClass = ioredis.default ?? ioredis
    const client: Redis = new RedisClass(this.url, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      retryStrategy: () => null,
      connectTimeout: 3_000,
      connectionName: INTERNAL_NAME,
    })
    // Marked before connect(): the ioredis hook runs inside connect().
    markInternal(client)
    client.on('error', noop)
    const opening = { client, queues: [] as Queue[] }
    this.opening = opening
    try {
      await client.connect()
      ;(client as any).stream?.unref?.()
      const queues = {} as Record<TelemetryStream, Queue>
      for (const stream of STREAMS) {
        const queue: Queue = markInternal(
          new Queue(topicName(stream), {
            connection: client,
            prefix: this.prefix,
          }),
        )
        queue.on('error', noop)
        opening.queues.push(queue)
        queues[stream] = queue
      }
      await Promise.all(opening.queues.map((queue) => queue.waitUntilReady()))
      if (generation !== this.generation) {
        throw new Error('BullMQ transport was closed while connecting')
      }
      this.client = client
      this.queues = queues
    } catch (error) {
      this.dispose(opening.client, opening.queues)
      throw error
    } finally {
      if (this.opening === opening) this.opening = undefined
    }
  }

  async publish(
    stream: TelemetryStream,
    message: OutgoingMessage,
  ): Promise<void> {
    const queue = this.queues?.[stream]
    if (!queue) throw new Error('BullMQ queue is not connected')
    const envelope = JSON.parse(message.body.toString('utf8'))
    await queue.add(stream, envelope, JOB_OPTIONS as any)
  }

  private dispose(client: Redis | undefined, queues: Queue[]): Promise<void> {
    return Promise.all(queues.map((queue) => queue.close().catch(noop)))
      .then(() => {
        // On a socket that already closed, ioredis' disconnect() starts a
        // 2 s timer nobody clears, which would delay the app's exit.
        if (client && client.status !== 'end') client.disconnect()
      })
      .catch(noop)
  }

  async close(): Promise<void> {
    this.generation++
    const client = this.client
    const queues = Object.values(this.queues ?? {})
    this.client = undefined
    this.queues = undefined
    const opening = this.opening
    this.opening = undefined
    await Promise.all([
      this.dispose(client, queues),
      opening ? this.dispose(opening.client, opening.queues) : undefined,
    ])
  }
}
