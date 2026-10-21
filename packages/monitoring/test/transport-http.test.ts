import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { gunzipSync } from 'zlib'
import { resolveExportMode } from 'skilllane-monitoring-contract'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { HttpTransport, httpTarget } from '../src/transport/http'
import { ExportLink, Publisher } from '../src/transport/publisher'
import {
  type OutgoingMessage,
  RejectedMessageError,
  type Transport,
} from '../src/transport/types'

interface Received {
  path: string
  headers: Record<string, string | string[] | undefined>
  body: Buffer
}

/** A fake engine: answers `status` and records each request. */
let server: Server
let base = ''
let status = 200
const received: Received[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      received.push({
        path: req.url ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks),
      })
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end('{}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(() => {
  vi.unstubAllEnvs()
  received.length = 0
  status = 200
})

afterAll(() => {
  server.close()
})

const message = (body: string) => ({
  body: Buffer.from(body, 'utf8'),
  key: 'svc/api',
  count: 1,
})

describe('resolveExportMode with LOG_HTTP_URL', () => {
  it('picks http when no queue is configured', () => {
    expect(
      resolveExportMode({ LOG_HTTP_URL: 'https://monitoring.local' }),
    ).toEqual({
      mode: 'http',
    })
  })

  it('prefers a configured queue over http', () => {
    expect(
      resolveExportMode({
        LOG_KAFKA_BROKERS: 'kafka:9092',
        LOG_HTTP_URL: 'https://monitoring.local',
      }),
    ).toEqual({ mode: 'kafka' })
  })

  it('still honours an explicit LOG_EXPORT', () => {
    expect(
      resolveExportMode({
        LOG_EXPORT: 'http',
        LOG_KAFKA_BROKERS: 'kafka:9092',
      }),
    ).toEqual({ mode: 'http' })
  })
})

describe('httpTarget', () => {
  it('takes the token from the user part and strips it from the URL', () => {
    vi.stubEnv('LOG_HTTP_URL', 'https://s3cr%2Ft@monitoring.local:8443/base/')
    expect(httpTarget()).toEqual({
      base: 'https://monitoring.local:8443/base',
      token: 's3cr/t',
    })
  })

  it('prefers LOG_HTTP_TOKEN', () => {
    vi.stubEnv('LOG_HTTP_URL', 'https://inurl@monitoring.local')
    vi.stubEnv('LOG_HTTP_TOKEN', 'from-env')
    expect(httpTarget()?.token).toBe('from-env')
  })

  it('is undefined for a missing or non-http URL', () => {
    vi.stubEnv('LOG_HTTP_URL', '')
    expect(httpTarget()).toBeUndefined()
    vi.stubEnv('LOG_HTTP_URL', 'kafka://broker:9092')
    expect(httpTarget()).toBeUndefined()
  })
})

describe('HttpTransport', () => {
  it('posts the envelope to /api/ingest/<stream> with the bearer token', async () => {
    const transport = new HttpTransport({ base, token: 'tok' })
    await transport.publish('logs', message('{"v":1}'))
    expect(received).toHaveLength(1)
    expect(received[0].path).toBe('/api/ingest/logs')
    expect(received[0].headers.authorization).toBe('Bearer tok')
    expect(received[0].headers['content-encoding']).toBeUndefined()
    expect(received[0].body.toString()).toBe('{"v":1}')
  })

  it('gzips a large body', async () => {
    const body = JSON.stringify({ items: 'x'.repeat(5_000) })
    await new HttpTransport({ base }).publish('spans', message(body))
    expect(received[0].path).toBe('/api/ingest/spans')
    expect(received[0].headers['content-encoding']).toBe('gzip')
    expect(received[0].headers.authorization).toBeUndefined()
    expect(gunzipSync(received[0].body).toString()).toBe(body)
  })

  it('throws a retryable error when the engine is busy or down', async () => {
    status = 503
    const publish = new HttpTransport({ base }).publish('logs', message('{}'))
    await expect(publish).rejects.toThrow('engine answered HTTP 503')
    await expect(publish).rejects.not.toBeInstanceOf(RejectedMessageError)
  })

  it('rejects for good what the engine will never take', async () => {
    status = 413
    await expect(
      new HttpTransport({ base }).publish('logs', message('{}')),
    ).rejects.toBeInstanceOf(RejectedMessageError)
  })
})

describe('Publisher with a rejected message', () => {
  it('drops it and keeps sending the items behind it', async () => {
    const sent: string[] = []
    const transport: Transport = {
      name: 'http',
      target: 'engine',
      connect: () => Promise.resolve(),
      close: () => Promise.resolve(),
      async publish(_stream, outgoing: OutgoingMessage) {
        const text = outgoing.body.toString()
        if (text.includes('too-big')) throw new RejectedMessageError('HTTP 413')
        sent.push(text)
      },
    }
    const publisher = new Publisher(
      'logs',
      new ExportLink(transport),
      {
        batchMs: 10_000,
        batchSize: 1,
        maxQueue: 100,
        maxQueueBytes: 1_000_000,
        maxBytes: 100_000,
        sendTimeoutMs: 1_000,
      },
      '{"service.name":"svc"}',
      'svc',
    )
    publisher.push({ message: 'too-big' })
    publisher.push({ message: 'next' })
    await publisher.flush(Date.now() + 2_000)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('next')
    await publisher.close(Date.now() + 500)
  })
})
