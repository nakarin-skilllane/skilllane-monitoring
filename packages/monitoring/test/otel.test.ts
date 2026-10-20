import { createRequire } from 'module'
import { context, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { SeverityNumber } from '@opentelemetry/api-logs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setRecordSink } from '../src/logger/sink'
import { hookKafkajsLogs } from '../src/otel/kafkajs-hook'
import { toLogRecord } from '../src/otel/log-bridge'
import { exportSettings, selectExportMode } from '../src/otel/mode'
import { captureLogger, lastLine } from './helpers'

const MODE_ENV = [
  'LOG_EXPORT',
  'LOG_KAFKA_BROKERS',
  'OTEL_EXPORTER_ENDPOINT',
  'LOG_EXPORT_BATCH_MS',
  'LOG_EXPORT_MAX_QUEUE',
]

afterEach(() => {
  for (const name of MODE_ENV) vi.stubEnv(name, '')
  vi.unstubAllEnvs()
  setRecordSink(undefined)
})

describe('selectExportMode (plan A)', () => {
  it('brokers → kafka, endpoint → otlp, neither → stdout', () => {
    vi.stubEnv('LOG_KAFKA_BROKERS', 'localhost:19094')
    vi.stubEnv('OTEL_EXPORTER_ENDPOINT', 'http://localhost:4318')
    expect(selectExportMode()).toEqual({ mode: 'kafka' })

    vi.stubEnv('LOG_KAFKA_BROKERS', '')
    expect(selectExportMode()).toEqual({ mode: 'otlp' })

    vi.stubEnv('OTEL_EXPORTER_ENDPOINT', '  ')
    expect(selectExportMode()).toEqual({ mode: 'stdout' })
  })

  it('LOG_EXPORT wins over what is configured', () => {
    vi.stubEnv('LOG_KAFKA_BROKERS', 'localhost:19094')
    vi.stubEnv('LOG_EXPORT', 'STDOUT')
    expect(selectExportMode()).toEqual({ mode: 'stdout' })
  })

  it('an unknown LOG_EXPORT falls back to the configured destination', () => {
    vi.stubEnv('LOG_EXPORT', 'loki')
    vi.stubEnv('OTEL_EXPORTER_ENDPOINT', 'http://localhost:4318')
    expect(selectExportMode()).toEqual({ mode: 'otlp', invalid: 'loki' })
  })

  it('batch settings default to 1s / 500 / 10000 / 800 KB / 64 MB / 3s', () => {
    expect(exportSettings()).toEqual({
      batchMs: 1000,
      batchSize: 500,
      maxQueue: 10000,
      maxBytes: 800_000,
      maxQueueBytes: 64 * 1024 * 1024,
      shutdownMs: 3000,
    })
    vi.stubEnv('LOG_EXPORT_BATCH_MS', '250')
    vi.stubEnv('LOG_EXPORT_MAX_QUEUE', 'lots')
    expect(exportSettings()).toMatchObject({ batchMs: 250, maxQueue: 10000 })
  })
})

describe('toLogRecord', () => {
  const record = {
    '@timestamp': '2026-10-14T07:02:11.204Z',
    'log.level': 'warn',
    'service.name': 'school-core-api/api',
    'service.version': '31.0.0',
    'service.environment': 'uat',
    'log.logger': 'OrdersController',
    'event.code': 'http.request',
    message: 'Request completed',
    'trace.id': '4bf92f3577b34da6a3ce929d0e0e4736',
    'span.id': '00f067aa0ba902b7',
    'http.response.status_code': 400,
    'user.roles': ['teacher'],
    'job.inflight': ['http:GET /a', 'job:send#1'],
    'error.cause': { type: 'Error', message: 'root' },
    labels: { usecase: 'CreateOrder', error_category: 'validation' },
  }

  it('maps the record onto body, time, severity and attributes', () => {
    const log = toLogRecord(record, 'warn')
    expect(log.body).toBe('Request completed')
    expect(log.timestamp).toBe(Date.parse('2026-10-14T07:02:11.204Z'))
    expect(log.severityNumber).toBe(SeverityNumber.WARN)
    expect(log.severityText).toBe('WARN')
    expect(log.attributes).toEqual({
      'log.logger': 'OrdersController',
      'event.code': 'http.request',
      'http.response.status_code': 400,
      'user.roles': ['teacher'],
      'job.inflight': ['http:GET /a', 'job:send#1'],
      'error.cause': '{"type":"Error","message":"root"}',
      'labels.usecase': 'CreateOrder',
      'labels.error_category': 'validation',
    })
  })

  it('takes trace context from the active span, not from attributes', () => {
    // The SDK installs this in the app; the test has to do it itself.
    context.setGlobalContextManager(
      new AsyncLocalStorageContextManager().enable(),
    )
    const spanContext = {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceFlags: 1,
    }
    const active = trace.setSpanContext(context.active(), spanContext)
    const log = context.with(active, () => toLogRecord(record, 'info'))
    expect(trace.getSpanContext(log.context!)).toEqual(spanContext)
    expect(log.attributes).not.toHaveProperty('trace.id')
  })
})

describe('logger → sink', () => {
  it('adds service.version and service.environment to every line', () => {
    const { logger, lines } = captureLogger({
      version: '1.4.2',
      environment: 'uat',
    })
    logger.log('Order created')
    expect(lastLine(lines)).toMatchObject({
      'service.version': '1.4.2',
      'service.environment': 'uat',
    })
  })

  it('hands the sink the redacted record stdout got', () => {
    const { logger, lines } = captureLogger()
    const sent: Record<string, unknown>[] = []
    setRecordSink((record) => sent.push(record))
    logger.log('Login', { password: 'hunter2', 'user.id': 'u_1' })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual(lastLine(lines))
    expect(JSON.stringify(sent[0])).not.toContain('hunter2')
  })

  it('a failing sink never reaches the caller and stdout keeps the line', () => {
    const { logger, lines } = captureLogger()
    setRecordSink(() => {
      throw new Error('exporter down')
    })
    expect(() => logger.error('Payment failed')).not.toThrow()
    expect(lastLine(lines).message).toBe('Payment failed')
  })
})

describe('kafkajs logCreator hook', () => {
  it('routes kafkajs lines of a new Kafka() through the logger', () => {
    hookKafkajsLogs()
    const { lines } = captureLogger()
    const { Kafka } = createRequire(__filename)('kafkajs')
    const kafka = new Kafka({ clientId: 't', brokers: ['localhost:1'] })
    kafka.logger().error('Broker went away', { broker: 'localhost:1' })
    expect(lastLine(lines)).toMatchObject({
      'log.logger': 'kafkajs',
      'log.level': 'error',
      message: 'Broker went away',
      'dependency.type': 'kafka',
    })
  })

  it('keeps a logCreator the app passed itself', () => {
    hookKafkajsLogs()
    const own = vi.fn(() => () => {})
    const { Kafka } = createRequire(__filename)('kafkajs')
    new Kafka({ clientId: 't', brokers: ['localhost:1'], logCreator: own })
    expect(own).toHaveBeenCalled()
  })
})

describe('instrumentationConfig', () => {
  it('turns off socket, router and pino noise and keeps app overrides', async () => {
    const { instrumentationConfig } = await import('../src/otel/register')
    const appIgnore = vi.fn((req: { url?: string }) => req.url === '/internal')
    const config: Record<string, any> = instrumentationConfig({
      instrumentationConfig: {
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: appIgnore as any,
        },
        '@opentelemetry/instrumentation-oracledb': {
          enhancedDatabaseReporting: true,
        },
      },
    })
    for (const name of ['net', 'dns', 'fs', 'router', 'pino', 'nestjs-core']) {
      expect(config[`@opentelemetry/instrumentation-${name}`]).toEqual({
        enabled: false,
      })
    }
    // The serializer writes the command with its arguments, masked (capture).
    expect(config['@opentelemetry/instrumentation-ioredis']).toEqual({
      requireParentSpan: true,
      dbStatementSerializer: expect.any(Function),
    })
    // The app's option is kept next to the capture hook for bind values.
    expect(config['@opentelemetry/instrumentation-oracledb']).toEqual({
      enhancedDatabaseReporting: true,
      requestHook: expect.any(Function),
    })
    const ignore =
      config['@opentelemetry/instrumentation-http'].ignoreIncomingRequestHook
    expect(ignore({ method: 'OPTIONS', url: '/orders' })).toBe(true)
    expect(ignore({ method: 'GET', url: '/health?probe=1' })).toBe(true)
    expect(ignore({ method: 'GET', url: '/metrics' })).toBe(true)
    expect(ignore({ method: 'GET', url: '/internal' })).toBe(true)
    expect(ignore({ method: 'GET', url: '/healthcare' })).toBe(false)
    expect(ignore({ method: 'GET', url: '/orders' })).toBe(false)
  })
})
