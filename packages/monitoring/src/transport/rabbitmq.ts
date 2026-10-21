import {
  CONTRACT_VERSION,
  ENV,
  HEADER_STREAM,
  HEADER_VERSION,
  rabbitmqExchange,
  STREAMS,
  type TelemetryStream,
  topicName,
} from '../contract'
import type { ChannelModel, ConfirmChannel } from 'amqplib'
import { parseAddress } from '../integrations/dependency-monitor'
import { env } from '../otel/identity'
import { INTERNAL_NAME, markInternal } from './internal'
import { noop, type OutgoingMessage, type Transport } from './types'

/** The socket and heartbeat timers must not keep the app alive. */
function unref(model: ChannelModel): void {
  try {
    const connection = (model as any).connection
    connection?.stream?.unref?.()
    connection?.heartbeater?.sendTimer?.unref?.()
    connection?.heartbeater?.recvTimer?.unref?.()
  } catch {
    // only affects exit timing
  }
}

/**
 * RabbitMQ: durable direct exchange `skilllane-monitoring.telemetry`; per stream a durable
 * queue named after the topic, bound with routing key = topic name.
 * Persistent JSON messages on a confirm channel. A lost connection is
 * reopened on the next send (the publisher backs off).
 */
export class RabbitmqTransport implements Transport {
  readonly name = 'rabbitmq' as const
  readonly target: string
  private readonly url: string
  private readonly exchange = rabbitmqExchange()
  private model?: ChannelModel
  private channel?: ConfirmChannel
  private connecting?: Promise<void>
  private generation = 0

  constructor() {
    this.url = env(ENV.rabbitmqUrl) ?? ''
    const { host, port } = parseAddress(this.url)
    this.target = host ? `${host}:${port ?? 5672}` : ''
  }

  connect(): Promise<void> {
    if (this.channel) return Promise.resolve()
    this.connecting ??= this.open().finally(() => {
      this.connecting = undefined
    })
    return this.connecting
  }

  private async open(): Promise<void> {
    const generation = this.generation
    const amqp = require('amqplib')
    // Marked: the auto-watch hook passes it to the original connect().
    const model: ChannelModel = await amqp.connect(
      this.url,
      markInternal({
        timeout: 3_000,
        clientProperties: { connection_name: INTERNAL_NAME },
      }),
    )
    const drop = () => {
      if (this.model !== model) return
      this.model = undefined
      this.channel = undefined
    }
    model.on('error', noop)
    model.on('close', drop)
    unref(model)
    try {
      const channel = await model.createConfirmChannel()
      channel.on('error', noop)
      channel.on('close', drop)
      await channel.assertExchange(this.exchange, 'direct', { durable: true })
      for (const stream of STREAMS) {
        const queue = topicName(stream)
        await channel.assertQueue(queue, { durable: true })
        await channel.bindQueue(queue, this.exchange, queue)
      }
      if (generation !== this.generation) {
        throw new Error('RabbitMQ transport was closed while connecting')
      }
      this.model = model
      this.channel = channel
    } catch (error) {
      model.close().catch(noop)
      throw error
    }
  }

  publish(stream: TelemetryStream, message: OutgoingMessage): Promise<void> {
    const channel = this.channel
    if (!channel) return Promise.reject(new Error('RabbitMQ is not connected'))
    const topic = topicName(stream)
    return new Promise<void>((resolve, reject) => {
      try {
        channel.publish(
          this.exchange,
          topic,
          message.body,
          {
            persistent: true,
            contentType: 'application/json',
            contentEncoding: 'utf-8',
            appId: message.key,
            timestamp: Math.floor(Date.now() / 1000),
            headers: {
              [HEADER_STREAM]: stream,
              [HEADER_VERSION]: CONTRACT_VERSION,
            },
          },
          (error: unknown) => (error ? reject(error) : resolve()),
        )
      } catch (error) {
        reject(error)
      }
    })
  }

  async close(): Promise<void> {
    this.generation++
    const model = this.model
    this.model = undefined
    this.channel = undefined
    await model?.close().catch(noop)
  }
}
