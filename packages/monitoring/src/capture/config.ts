import { oracledbRequestHook, pgRequestHook } from './db'
import {
  httpRequestHook,
  httpResponseHook,
  undiciRequestHook,
  undiciResponseHook,
} from './http'
import { amqpPublishHook, kafkaProducerHook } from './messaging'
import { redisStatement } from './redis'
import { captureActive } from './settings'

type ConfigMap = Record<string, Record<string, unknown>>

/**
 * The instrumentation options the capture needs, merged under the app's
 * own `instrumentationConfig`: its hooks are chained after these (see
 * HOOK_NAMES), never replaced; its other options win. Empty when
 * LOG_CAPTURE=off or spans are not exported.
 */
export function captureInstrumentationConfig(): ConfigMap {
  if (!captureActive()) return {}
  return {
    '@opentelemetry/instrumentation-http': {
      requestHook: httpRequestHook,
      responseHook: httpResponseHook,
    },
    '@opentelemetry/instrumentation-undici': {
      requestHook: undiciRequestHook,
      responseHook: undiciResponseHook,
    },
    // Bind values: oracledb's own (as strings, moved by the processor) and,
    // typed, from its requestHook.
    '@opentelemetry/instrumentation-oracledb': {
      enhancedDatabaseReporting: true,
      requestHook: oracledbRequestHook,
    },
    '@opentelemetry/instrumentation-pg': { requestHook: pgRequestHook },
    '@opentelemetry/instrumentation-ioredis': {
      dbStatementSerializer: redisStatement,
    },
    '@opentelemetry/instrumentation-redis': {
      dbStatementSerializer: redisStatement,
    },
    '@opentelemetry/instrumentation-kafkajs': {
      producerHook: kafkaProducerHook,
    },
    '@opentelemetry/instrumentation-amqplib': { publishHook: amqpPublishHook },
  }
}

/** Hook options an app may pass too: both run, the SDK's first. */
export const HOOK_NAMES = new Set([
  'requestHook',
  'responseHook',
  'producerHook',
  'consumerHook',
  'publishHook',
  'publishConfirmHook',
  'consumeHook',
  'consumeEndHook',
])

export function chainHooks(
  first: (...args: unknown[]) => unknown,
  second: (...args: unknown[]) => unknown,
): (...args: unknown[]) => unknown {
  return function (this: unknown, ...args: unknown[]) {
    try {
      first.apply(this, args)
    } catch {
      // the app's hook still runs
    }
    return second.apply(this, args)
  }
}

const TYPEORM = 'opentelemetry-instrumentation-typeorm'

/**
 * TypeORM spans (a TypeormInstrumentation the app passes): with
 * `collectParameters` its query-builder spans carry the bind values
 * (`db.statement.parameters`, masked and moved by the processor).
 */
export function enableTypeormParameters(instrumentations: unknown[]): void {
  if (!captureActive()) return
  for (const instrumentation of instrumentations as any[]) {
    try {
      if (instrumentation?.instrumentationName !== TYPEORM) continue
      if (typeof instrumentation.setConfig !== 'function') continue
      instrumentation.setConfig({
        ...instrumentation.getConfig?.(),
        collectParameters: true,
      })
    } catch {
      // the instrumentation keeps its own options
    }
  }
}
