import { DiagLogLevel, diag, metrics, trace } from '@opentelemetry/api'
import { logs } from '@opentelemetry/api-logs'
import {
  getNodeAutoInstrumentations,
  type InstrumentationConfigMap,
} from '@opentelemetry/auto-instrumentations-node'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  BatchLogRecordProcessor,
  type LogRecordProcessor,
} from '@opentelemetry/sdk-logs'
import {
  type IMetricReader,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics'
import { isEnvelopeTransport } from 'skilllane-monitoring-contract'
import { NodeSDK, type NodeSDKConfiguration } from '@opentelemetry/sdk-node'
import {
  BatchSpanProcessor,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'
import {
  captureInstrumentationConfig,
  chainHooks,
  enableTypeormParameters,
  HOOK_NAMES,
} from '../capture/config'
import { CaptureSpanProcessor } from '../capture/processor'
import { setSpansExported } from '../capture/settings'
import { FailedStepSpanProcessor } from '../integrations/failed-step'
import { otelDiagLogger } from '../integrations/otel'
import { getLogger } from '../logger'
import { setRecordSink } from '../logger/sink'
import {
  installProcessHandlers,
  type UnhandledRejectionMode,
} from '../nest/process-handlers'
import { appRequire, env, envNumber, serviceIdentity } from './identity'
import { hookNestFactory } from '../nest/nest-auto'
import { hookAutoWatch } from './auto-watch'
import { hookKafkajsLogs } from './kafkajs-hook'
import {
  createQueueExport,
  envelopeResource,
  missingConfig,
  type QueueExport,
} from '../transport'
import { setActiveTelemetry, shutdownTelemetry } from './lifecycle'
import { createLogBridge } from './log-bridge'
import {
  type ExportMode,
  type ExportSettings,
  exportSettings,
  selectExportMode,
} from './mode'

type Instrumentation = NonNullable<
  NodeSDKConfiguration['instrumentations']
>[number]

export interface TelemetryOptions {
  /** Default: OTEL_SERVICE_NAME, then the app's package.json name. */
  serviceName?: string
  /** Default: SERVICE_VERSION, npm_package_version, package.json version. */
  serviceVersion?: string
  /** Default: OTEL_ENV, then NODE_ENV. */
  environment?: string
  /**
   * Incoming paths without a span, on top of OPTIONS and the probe paths
   * (/health, /ready, /metrics).
   */
  ignorePaths?: string[]
  /**
   * Per-instrumentation overrides, merged over the defaults: e.g. the app's
   * own http requestHook / responseHook, or oracledb options. Hooks the SDK
   * sets for the capture (requestHook, responseHook, producerHook,
   * publishHook …) run first, then the app's.
   */
  instrumentationConfig?: InstrumentationConfigMap
  /** Extra instrumentations, e.g. TypeormInstrumentation. */
  instrumentations?: Instrumentation[]
  /** Extra span processors; FailedStepSpanProcessor is always added. */
  spanProcessors?: SpanProcessor[]
  /** uncaughtException / unhandledRejection / SIGTERM lines. Default true. */
  processHandlers?: boolean
}

export interface Telemetry {
  mode: ExportMode
  /** False only when OTel failed to start; logging still works. */
  started: boolean
}

const PROBE_PATHS = ['/health', '/ready', '/metrics']

let current: Telemetry | undefined
// The auto-instrumentations of the first call, reconfigured by a later one.
let autoInstrumentations: ReturnType<typeof getNodeAutoInstrumentations> = []

function ignoredRequest(paths: string[]) {
  return (req: { method?: string; url?: string }) => {
    if (req.method === 'OPTIONS') return true
    const path = (req.url ?? '').split('?')[0]
    return paths.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  }
}

export function instrumentationConfig(
  options: TelemetryOptions,
): InstrumentationConfigMap {
  const ignore = ignoredRequest([
    ...PROBE_PATHS,
    ...(options.ignorePaths ?? []),
  ])
  const defaults: InstrumentationConfigMap = {
    // Socket-level spans (one per TCP connect / DNS lookup / file op) are
    // noise next to the http / db / redis spans that cover the same calls.
    '@opentelemetry/instrumentation-net': { enabled: false },
    '@opentelemetry/instrumentation-dns': { enabled: false },
    '@opentelemetry/instrumentation-fs': { enabled: false },
    '@opentelemetry/instrumentation-http': {
      ignoreIncomingRequestHook: (req) => ignore(req),
    },
    // One span per middleware on every request; router/handler spans stay.
    '@opentelemetry/instrumentation-express': {
      ignoreLayersType: ['middleware' as never],
    },
    // Only inside a request/job: BullMQ polls Redis constantly.
    // Express 5 runs on the `router` package; this instrumentation adds a
    // second span per middleware (~20 per request) on top of express'.
    '@opentelemetry/instrumentation-router': { enabled: false },
    '@opentelemetry/instrumentation-ioredis': { requireParentSpan: true },
    '@opentelemetry/instrumentation-nestjs-core': { enabled: false },
    // This package writes logs itself; pino's log sending would duplicate
    // every line in the log pipeline.
    '@opentelemetry/instrumentation-pino': { enabled: false },
  }
  const merged: Record<string, Record<string, unknown>> = { ...defaults } as any
  for (const [name, config] of Object.entries(captureInstrumentationConfig())) {
    merged[name] = { ...(merged[name] ?? {}), ...config }
  }
  for (const [name, override] of Object.entries(
    options.instrumentationConfig ?? {},
  )) {
    const base = merged[name] ?? {}
    const http = name === '@opentelemetry/instrumentation-http'
    merged[name] = { ...base, ...(override as Record<string, unknown>) }
    // The probe filter always applies; an app filter adds to it.
    const appIgnore = (override as any)?.ignoreIncomingRequestHook
    if (http && appIgnore) {
      merged[name].ignoreIncomingRequestHook = (req: any) =>
        ignore(req) || appIgnore(req)
    }
    // The capture's hooks and the app's both run (school-core-api passes
    // its own http requestHook / responseHook).
    for (const hook of HOOK_NAMES) {
      const ours = base[hook]
      const theirs = (override as Record<string, unknown>)?.[hook]
      if (typeof ours !== 'function' || ours === theirs) continue
      if (typeof theirs === 'function') {
        merged[name][hook] = chainHooks(ours as any, theirs as any)
      } else if (theirs === undefined || theirs === null) {
        merged[name][hook] = ours
      }
    }
  }
  return merged as InstrumentationConfigMap
}

function otlpUrl(path: string): string {
  return `${env('OTEL_EXPORTER_ENDPOINT')?.replace(/\/+$/, '')}${path}`
}

function exportPipeline(
  mode: ExportMode,
  settings: ExportSettings,
): {
  spanProcessors: SpanProcessor[]
  logRecordProcessors: LogRecordProcessor[]
  metricReaders: IMetricReader[]
} {
  const none = {
    spanProcessors: [],
    logRecordProcessors: [],
    metricReaders: [],
  }
  const endpoint = env('OTEL_EXPORTER_ENDPOINT')
  // stdout: logs stay on stdout; traces/metrics still go out when a
  // collector is configured (the spec's stdout mode). Queue and http modes
  // publish through the transport instead: no OTLP exporters.
  if (isEnvelopeTransport(mode) || !endpoint) return none
  const batch = {
    scheduledDelayMillis: settings.batchMs,
    maxExportBatchSize: settings.batchSize,
    maxQueueSize: settings.maxQueue,
  }
  return {
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({ url: otlpUrl('/v1/traces') }),
        batch,
      ),
    ],
    logRecordProcessors:
      mode === 'otlp'
        ? [
            new BatchLogRecordProcessor({
              exporter: new OTLPLogExporter({ url: otlpUrl('/v1/logs') }),
              ...batch,
            }),
          ]
        : [],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: otlpUrl('/v1/metrics') }),
        exportIntervalMillis: envNumber('OTEL_METRIC_EXPORT_INTERVAL', 15_000),
      }),
    ],
  }
}

/** Loads .env before anything reads the environment, if the app uses dotenv. */
function loadDotenv(): void {
  if (env('LOG_DOTENV') === 'false') return
  try {
    appRequire('dotenv')?.config?.({ quiet: true })
  } catch {
    // no .env support in this app
  }
}

/**
 * Kafka / RabbitMQ / BullMQ: logs and spans go to the customer's queue; http:
 * straight to the engine (no queue). The transport's connection setting must
 * be there; otherwise stdout only.
 */
function queueExport(
  mode: ExportMode,
  settings: ExportSettings,
  options: TelemetryOptions,
): QueueExport | undefined {
  if (!isEnvelopeTransport(mode)) return undefined
  const missing = missingConfig(mode)
  if (missing) {
    getLogger().event({
      event: 'app.log',
      level: 'warn',
      logger: 'skilllane-monitoring',
      message: `LOG_EXPORT=${mode} needs ${missing}; logs and traces stay on stdout`,
      fields: { reason: `${missing} is empty` },
    })
    return undefined
  }
  const identity = serviceIdentity()
  return createQueueExport(
    mode,
    settings,
    envelopeResource({
      ...identity,
      name: options.serviceName ?? identity.name,
      version: options.serviceVersion ?? identity.version,
      environment: options.environment ?? identity.environment,
    }),
  )
}

function warnIgnored(option: string): void {
  getLogger().event({
    event: 'app.log',
    level: 'warn',
    logger: 'skilllane-monitoring',
    message: 'Telemetry is already started; this option is ignored',
    fields: { reason: option },
  })
}

/**
 * A later call, e.g. the app's instrumentation file after
 * NODE_OPTIONS=--require skilllane-monitoring/register: its instrumentation
 * overrides and extra instrumentations still apply. What the SDK fixes at
 * start (service identity, span processors) cannot change.
 */
function applyLaterOptions(options: TelemetryOptions): void {
  const overrides = Object.keys(options.instrumentationConfig ?? {})
  if (overrides.length || options.ignorePaths?.length) {
    const merged = instrumentationConfig(options) as Record<string, any>
    const names = new Set([
      ...overrides,
      ...(options.ignorePaths?.length
        ? ['@opentelemetry/instrumentation-http']
        : []),
    ])
    for (const instrumentation of autoInstrumentations as any[]) {
      const name = instrumentation?.instrumentationName
      if (!names.has(name) || typeof instrumentation.setConfig !== 'function') {
        continue
      }
      instrumentation.setConfig({
        ...instrumentation.getConfig?.(),
        ...merged[name],
      })
    }
  }
  enableTypeormParameters(options.instrumentations ?? [])
  for (const instrumentation of (options.instrumentations ?? []) as any[]) {
    // What registerInstrumentations does, against the running SDK.
    instrumentation.setTracerProvider?.(trace.getTracerProvider())
    instrumentation.setMeterProvider?.(metrics.getMeterProvider())
    instrumentation.enable?.()
  }
  if (options.spanProcessors?.length) warnIgnored('spanProcessors')
  if (options.serviceName || options.serviceVersion || options.environment) {
    warnIgnored('serviceName / serviceVersion / environment')
  }
}

/**
 * Starts OpenTelemetry (traces, metrics, logs) and the process handlers.
 * Must run before the app imports http / express / ioredis / kafkajs, so it
 * belongs on the first line of main.ts — `import 'skilllane-monitoring/register'`,
 * or `registerTelemetry({...})` in the app's own instrumentation file when
 * it needs options. A later call applies its instrumentation options and
 * returns the first result.
 */
export function registerTelemetry(options: TelemetryOptions = {}): Telemetry {
  if (current) {
    if (current.started) applyLaterOptions(options)
    return current
  }
  loadDotenv()
  const legacy = env('LOGGING_ENGINE') === 'legacy'
  const selection = selectExportMode()
  const settings = exportSettings()
  const identity = serviceIdentity()

  if (options.processHandlers !== false && process.env.NODE_ENV !== 'test') {
    const mode: UnhandledRejectionMode =
      env('UNHANDLED_REJECTION') === 'log' ? 'log' : 'exit'
    installProcessHandlers(mode)
  }
  if (!legacy) {
    diag.setLogger(otelDiagLogger, DiagLogLevel.WARN)
    const autoWatch = env('LOG_AUTO_WATCH') !== 'false'
    hookKafkajsLogs({ watch: autoWatch })
    if (autoWatch) hookAutoWatch()
    if (env('LOG_NEST_AUTO') !== 'false') hookNestFactory()
  }

  const pipeline = exportPipeline(selection.mode, settings)
  const queue = queueExport(selection.mode, settings, options)
  // No exporter (stdout without a collector): nothing to capture for.
  setSpansExported(
    !!queue ||
      pipeline.spanProcessors.length > 0 ||
      (options.spanProcessors?.length ?? 0) > 0,
  )
  let sdk: NodeSDK | undefined
  try {
    autoInstrumentations = getNodeAutoInstrumentations(
      instrumentationConfig(options),
    )
    enableTypeormParameters(options.instrumentations ?? [])
    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: options.serviceName ?? identity.name,
        [ATTR_SERVICE_VERSION]: options.serviceVersion ?? identity.version,
        'deployment.environment.name':
          options.environment ?? identity.environment,
        // The pre-semconv-1.27 key; existing dashboards filter on it.
        'deployment.environment': options.environment ?? identity.environment,
        'host.name': env('HOSTNAME'),
        'app.role': identity.role,
      }),
      spanProcessors: [
        // First: writes and masks the capture attributes in onEnding,
        // before any exporter reads the span.
        new CaptureSpanProcessor() as unknown as SpanProcessor,
        ...(queue ? [queue.spanProcessor] : []),
        ...pipeline.spanProcessors,
        ...(options.spanProcessors ?? []),
        new FailedStepSpanProcessor() as unknown as SpanProcessor,
      ],
      logRecordProcessors: pipeline.logRecordProcessors,
      metricReaders: pipeline.metricReaders,
      instrumentations: [
        autoInstrumentations,
        ...(options.instrumentations ?? []),
      ],
    })
    sdk.start()
    current = { mode: selection.mode, started: true }
  } catch (error) {
    sdk = undefined
    current = { mode: selection.mode, started: false }
    getLogger().event({
      event: 'app.log',
      level: 'warn',
      logger: 'skilllane-monitoring',
      message: queue
        ? 'OpenTelemetry failed to start; logs still go to the queue, no traces'
        : 'OpenTelemetry failed to start; logs stay on stdout',
      error,
    })
  }

  const started = sdk
  if (started || queue) {
    setActiveTelemetry({
      forceFlush: async (timeoutMs) => {
        await Promise.all([
          ...pipeline.logRecordProcessors.map((p) => p.forceFlush()),
          ...pipeline.spanProcessors.map((p) => p.forceFlush()),
          ...pipeline.metricReaders.map((r) => r.forceFlush()),
          queue?.flush(timeoutMs),
        ])
      },
      shutdown: async (timeoutMs) => {
        // Spans end before the OTel shutdown; the queue then sends them.
        await started?.shutdown().catch(() => undefined)
        await queue?.close(timeoutMs)
      },
    })
  }
  if (queue && !legacy) {
    // The logs publisher gets the same redacted record stdout gets.
    setRecordSink(queue.logSink)
  } else if (started && pipeline.logRecordProcessors.length && !legacy) {
    setRecordSink(createLogBridge(logs.getLogger('skilllane-monitoring')))
  }
  if (queue) {
    // A script that simply ends: its sockets are unreferenced, so the loop
    // empties; send what is buffered before the process exits.
    process.once('beforeExit', () => {
      void shutdownTelemetry()
    })
  }

  if (selection.invalid) {
    getLogger().event({
      event: 'app.log',
      level: 'warn',
      logger: 'skilllane-monitoring',
      message: 'Unknown LOG_EXPORT value; destination chosen from config',
      fields: { reason: `LOG_EXPORT=${selection.invalid} → ${selection.mode}` },
    })
  }
  return current
}

export function currentTelemetry(): Telemetry | undefined {
  return current
}

/**
 * The options an auto-instrumentation runs with (SDK defaults, capture
 * hooks, the app's overrides), e.g. for a stand-in that has to behave like
 * the instrumented driver. undefined before start or for an unknown name.
 */
export function instrumentationConfigOf(
  name: string,
): Record<string, any> | undefined {
  const instrumentation = (autoInstrumentations as any[]).find(
    (candidate) => candidate?.instrumentationName === name,
  )
  return instrumentation?.getConfig?.()
}
