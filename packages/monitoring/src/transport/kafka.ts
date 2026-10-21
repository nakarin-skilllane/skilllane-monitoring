import {
  CONTRACT_VERSION,
  ENV,
  HEADER_STREAM,
  HEADER_VERSION,
  type TelemetryStream,
  topicName,
} from 'skilllane-monitoring-contract'
import type { Producer, SASLOptions } from 'kafkajs'
import { env } from '../otel/identity'
import { KAFKAJS_UNPATCHED, markInternal } from './internal'
import { noop, type OutgoingMessage, type Transport } from './types'

/** kafkajs' default socket factory, with sockets that never hold the process open. */
function unrefSocketFactory() {
  const net = require('net')
  const tls = require('tls')
  return ({ host, port, ssl, onConnect }: any) => {
    const socket = ssl
      ? tls.connect(
          Object.assign(
            { host, port },
            net.isIP(host) ? {} : { servername: host },
            ssl,
          ),
          onConnect,
        )
      : net.connect({ host, port }, onConnect)
    socket.setKeepAlive(true, 60_000)
    socket.unref()
    // Node 20 tries each address of a name with a new handle (autoSelectFamily):
    // unreference the one that finally connected too.
    socket.once('connect', () => socket.unref())
    socket.once('secureConnect', () => socket.unref())
    return socket
  }
}

const SDK_CLIENT_IDS = new Set<string>()
let requestQueuePatched = false

/**
 * kafkajs 2.2.4: after every response an idle connection re-arms a 1 ms
 * timer forever (scheduleCheckPendingRequests with nothing pending). On the
 * SDK's own connections that would keep the app alive and burn CPU, so the
 * idle re-arm is skipped there and the timer unreferenced. The app's own
 * kafkajs clients are left as they are.
 */
function patchIdleRequestQueue(): void {
  if (requestQueuePatched) return
  requestQueuePatched = true
  try {
    const proto = require('kafkajs/src/network/requestQueue')?.prototype
    const schedule = proto?.scheduleCheckPendingRequests
    if (typeof schedule !== 'function') return
    proto.scheduleCheckPendingRequests = function (this: any) {
      if (!SDK_CLIENT_IDS.has(this.clientId)) return schedule.call(this)
      const throttled = this.throttledUntil > Date.now()
      if (!this.pending?.length && !throttled) return
      schedule.call(this)
      this.throttleCheckTimeoutId?.unref?.()
    }
  } catch {
    // another kafkajs layout: only exit timing is affected
  }
}

function sasl(): SASLOptions | undefined {
  const mechanism = env(ENV.kafkaSaslMechanism)?.toLowerCase()
  if (
    mechanism !== 'plain' &&
    mechanism !== 'scram-sha-256' &&
    mechanism !== 'scram-sha-512'
  ) {
    return undefined
  }
  return {
    mechanism,
    username: env(ENV.kafkaSaslUsername) ?? '',
    password: env(ENV.kafkaSaslPassword) ?? '',
  } as SASLOptions
}

/**
 * Kafka: topics `skilllane-monitoring.logs` / `skilllane-monitoring.spans`, GZIP, key `<service>/<role>`,
 * headers `skilllane-monitoring-stream` and `skilllane-monitoring-v`. kafkajs retries little (the publisher
 * retries and backs off); its own log lines are dropped.
 */
export class KafkaTransport implements Transport {
  readonly name = 'kafka' as const
  readonly target: string
  private readonly brokers: string[]
  private producer?: Producer
  private opening?: Producer
  private connecting?: Promise<void>
  private generation = 0
  private gzip = 1

  constructor(private readonly clientId: string) {
    this.brokers = (env(ENV.kafkaBrokers) ?? '')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean)
    this.target = this.brokers.join(',')
  }

  connect(): Promise<void> {
    if (this.producer) return Promise.resolve()
    this.connecting ??= this.open().finally(() => {
      this.connecting = undefined
    })
    return this.connecting
  }

  private async open(): Promise<void> {
    const generation = this.generation
    const kafkajs = require('kafkajs')
    SDK_CLIENT_IDS.add(this.clientId)
    patchIdleRequestQueue()
    this.gzip = kafkajs.CompressionTypes.GZIP
    // The hook's subclass would watch this producer as an app dependency.
    const Kafka = kafkajs.Kafka[KAFKAJS_UNPATCHED] ?? kafkajs.Kafka
    const ssl = env(ENV.kafkaSsl) === 'true'
    const kafka = new Kafka(
      markInternal({
        clientId: this.clientId,
        brokers: this.brokers,
        ssl: ssl || undefined,
        sasl: sasl(),
        logCreator: () => noop,
        socketFactory: unrefSocketFactory(),
        connectionTimeout: 3_000,
        requestTimeout: 10_000,
        // Its 100 ms interval would keep the process alive; the publisher
        // has its own send timeout.
        enforceRequestTimeout: false,
        retry: { retries: 2, initialRetryTime: 200, maxRetryTime: 1_000 },
      }),
    )
    const producer: Producer = kafka.producer({ allowAutoTopicCreation: true })
    this.opening = producer
    try {
      await producer.connect()
    } catch (error) {
      producer.disconnect().catch(noop)
      throw error
    } finally {
      this.opening = undefined
    }
    if (generation !== this.generation) {
      producer.disconnect().catch(noop)
      throw new Error('Kafka transport was closed while connecting')
    }
    this.producer = producer
  }

  async publish(
    stream: TelemetryStream,
    message: OutgoingMessage,
  ): Promise<void> {
    const producer = this.producer
    if (!producer) throw new Error('Kafka producer is not connected')
    await producer.send({
      topic: topicName(stream),
      compression: this.gzip,
      acks: -1,
      messages: [
        {
          key: message.key,
          value: message.body,
          headers: {
            [HEADER_STREAM]: stream,
            [HEADER_VERSION]: String(CONTRACT_VERSION),
          },
        },
      ],
    })
  }

  async close(): Promise<void> {
    this.generation++
    const producers = [this.producer, this.opening]
    this.producer = undefined
    await Promise.all(
      producers.map((producer) => producer?.disconnect().catch(noop)),
    )
  }
}
