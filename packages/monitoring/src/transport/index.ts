import { readFileSync } from 'fs'
import { hostname } from 'os'
import { join } from 'path'
import {
  ENV,
  MASK_RESOURCE_KEY,
  MASK_VERSION,
  type EnvelopeTransport,
  type ResourceInfo,
  topicName,
} from 'skilllane-monitoring-contract'
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base'
import type { RecordSink } from '../logger/sink'
import { env, type ServiceIdentity } from '../otel/identity'
import type { ExportSettings } from '../otel/mode'
import { BullmqTransport } from './bullmq'
import { HttpTransport, httpTarget } from './http'
import { KafkaTransport } from './kafka'
import { ExportLink, Publisher } from './publisher'
import { RabbitmqTransport } from './rabbitmq'
import { fitSpanItem, QueueSpanProcessor } from './span-item'
import { keepAlive, type Transport, untilDeadline } from './types'

export { isInternal, markInternal } from './internal'
export { toSpanItem } from './span-item'
export type { OutgoingMessage, Transport } from './types'

/** Connect + publish of one message, outside shutdown. */
const SEND_TIMEOUT_MS = 10_000

export interface QueueExport {
  mode: EnvelopeTransport
  /** Where it publishes, for the start line. */
  describe(): string
  /** Gets every redacted record stdout gets. */
  logSink: RecordSink
  /** Feeds the spans publisher. */
  spanProcessor: SpanProcessor
  /** Sends what is buffered now, within `timeoutMs`. */
  flush(timeoutMs?: number): Promise<void>
  /** Final flush and close, within `timeoutMs` (LOG_EXPORT_SHUTDOWN_MS). */
  close(timeoutMs?: number): Promise<void>
}

function sdkVersion(): string | undefined {
  try {
    return JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
    ).version
  } catch {
    return undefined
  }
}

/** The resource of every envelope: service.name without the role. */
export function envelopeResource(identity: ServiceIdentity): ResourceInfo {
  const resource: ResourceInfo = {
    'service.name': identity.name,
    'service.version': identity.version,
    'deployment.environment.name': identity.environment,
    'host.name': env('HOSTNAME') ?? hostname(),
    'app.role': identity.role,
    'telemetry.sdk.name': 'skilllane-monitoring',
    'telemetry.sdk.version': sdkVersion(),
    // Items are masked with these rules before they leave the app: the engine trusts them.
    [MASK_RESOURCE_KEY]: String(MASK_VERSION),
  }
  for (const key of Object.keys(resource) as Array<keyof ResourceInfo>) {
    if (resource[key] === undefined) delete resource[key]
  }
  return resource
}

/** The env var a transport needs, when it is missing. */
export function missingConfig(mode: EnvelopeTransport): string | undefined {
  if (mode === 'http') return httpTarget() ? undefined : ENV.httpUrl
  const name =
    mode === 'kafka'
      ? ENV.kafkaBrokers
      : mode === 'rabbitmq'
        ? ENV.rabbitmqUrl
        : ENV.bullmqRedisUrl
  return env(name) ? undefined : name
}

function createTransport(
  mode: EnvelopeTransport,
  resource: ResourceInfo,
): Transport {
  if (mode === 'http') {
    const target = httpTarget()
    if (!target) throw new Error(`${ENV.httpUrl} is not an http(s) URL`)
    return new HttpTransport(target)
  }
  if (mode === 'kafka') {
    return new KafkaTransport(
      env(ENV.kafkaClientId) ??
        `skilllane-monitoring-${resource['service.name']}`,
    )
  }
  if (mode === 'rabbitmq') return new RabbitmqTransport()
  return new BullmqTransport()
}

/**
 * Queue (or http) mode: the logs and spans publishers over one transport.
 * Nothing connects until the first batch is due; the client library is
 * loaded then.
 */
export function createQueueExport(
  mode: EnvelopeTransport,
  settings: ExportSettings,
  resource: ResourceInfo,
): QueueExport {
  const link = new ExportLink(createTransport(mode, resource))
  const role = resource['app.role']
  const key = role
    ? `${resource['service.name']}/${role}`
    : resource['service.name']
  const resourceJson = JSON.stringify(resource)
  const publisherSettings = {
    batchMs: settings.batchMs,
    batchSize: settings.batchSize,
    maxQueue: settings.maxQueue,
    maxQueueBytes: settings.maxQueueBytes,
    maxBytes: settings.maxBytes,
    sendTimeoutMs: SEND_TIMEOUT_MS,
  }
  const logs = new Publisher('logs', link, publisherSettings, resourceJson, key)
  const spans = new Publisher(
    'spans',
    link,
    publisherSettings,
    resourceJson,
    key,
    fitSpanItem,
  )
  let closing: Promise<void> | undefined

  return {
    mode,
    describe: () =>
      mode === 'http'
        ? link.describe()
        : `${link.describe()} (${topicName('logs')}, ${topicName('spans')})`,
    logSink: (record) => logs.push(record),
    spanProcessor: new QueueSpanProcessor(spans, settings.shutdownMs),
    flush(timeoutMs = settings.shutdownMs) {
      const deadline = Date.now() + timeoutMs
      return keepAlive(
        Promise.all([logs.flush(deadline), spans.flush(deadline)]).then(
          () => undefined,
        ),
        timeoutMs,
      )
    },
    close(timeoutMs = settings.shutdownMs) {
      closing ??= keepAlive(
        (async () => {
          const end = Date.now() + timeoutMs
          // Leave a little time to close the connection.
          const flushEnd = end - Math.min(500, timeoutMs / 4)
          await Promise.all([spans.close(flushEnd), logs.close(flushEnd)])
          await untilDeadline(link.close(), end)
        })(),
        timeoutMs,
      )
      return closing
    },
  }
}
