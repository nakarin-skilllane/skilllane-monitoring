import { Hook } from 'require-in-the-middle'
import { KAFKAJS_UNPATCHED } from '../transport/internal'
import { parseAddress } from '../integrations/dependency-monitor'
import {
  kafkaLogCreator,
  trackKafkaBatch,
  trackKafkaMessage,
  watchKafkaConsumer,
  watchKafkaProducer,
} from '../integrations/kafka'

const PATCHED = Symbol.for('@skilllane/monitoring.kafkajs-patched')
const BROKERS = Symbol('@skilllane/monitoring.kafkajs-brokers')

let hook: Hook | undefined

/** The first broker, as the target of dependency lines. */
function firstBroker(brokers: unknown): { host?: string; port?: number } {
  if (typeof brokers === 'string') return parseAddress(brokers)
  if (Array.isArray(brokers)) return parseAddress(brokers[0])
  return {}
}

/** Each message (eachMessage) or batch (eachBatch) runs as a job. */
export function trackRun(consumer: any): void {
  const run = consumer?.run
  if (typeof run !== 'function') return
  consumer.run = function (this: unknown, config: any = {}) {
    const { eachMessage, eachBatch } = config
    return run.call(this, {
      ...config,
      eachMessage:
        eachMessage &&
        ((payload: any) =>
          trackKafkaMessage(
            {
              topic: payload.topic,
              partition: payload.partition,
              offset: payload.message?.offset,
              headers: payload.message?.headers,
              value: payload.message?.value,
              key: payload.message?.key,
            },
            () => eachMessage(payload),
          )),
      eachBatch:
        eachBatch &&
        ((payload: any) => {
          const { batch } = payload
          const messages = batch?.messages ?? []
          return trackKafkaBatch(
            {
              topic: batch?.topic,
              partition: batch?.partition,
              firstOffset: messages[0]?.offset,
              lastOffset: messages[messages.length - 1]?.offset,
              size: messages.length,
            },
            () => eachBatch(payload),
          )
        }),
    })
  }
}

/**
 * kafkajs takes a logCreator only in `new Kafka({ logCreator })`. Every
 * Kafka created after this point without one gets kafkaLogCreator, so its
 * lines go through the logger. With `watch`, its producers and consumers are
 * watched too: connection state, rebalances, one job per message or batch.
 * CommonJS only (require-in-the-middle); an app that passes its own
 * logCreator keeps it.
 */
export function hookKafkajsLogs(options: { watch?: boolean } = {}): void {
  if (hook) return
  hook = new Hook(['kafkajs'], (exports: any) => {
    const Original = exports?.Kafka
    if (typeof Original !== 'function' || Original[PATCHED]) return exports
    class Kafka extends Original {
      constructor(config: Record<string, unknown> = {}) {
        super(
          config.logCreator
            ? config
            : { ...config, logCreator: kafkaLogCreator },
        )
        Object.defineProperty(this, BROKERS, { value: config.brokers })
      }

      producer(...args: unknown[]) {
        const producer = super.producer(...args)
        if (options.watch) {
          watchKafkaProducer(producer, {
            name: 'producer',
            ...firstBroker((this as any)[BROKERS]),
          })
        }
        return producer
      }

      consumer(config?: { groupId?: string }, ...args: unknown[]) {
        const consumer = super.consumer(config, ...args)
        if (options.watch) {
          watchKafkaConsumer(consumer, { name: config?.groupId ?? 'consumer' })
          trackRun(consumer)
        }
        return consumer
      }
    }
    Object.defineProperty(Kafka, PATCHED, { value: true })
    // The SDK's own producer uses the original: not an app dependency.
    Object.defineProperty(Kafka, KAFKAJS_UNPATCHED, { value: Original })
    Object.defineProperty(Kafka, 'name', { value: 'Kafka' })
    exports.Kafka = Kafka
    return exports
  })
}
