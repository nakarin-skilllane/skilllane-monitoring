import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { gunzipSync } from 'zlib'
import { trace } from '@opentelemetry/api'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getLogger } from '../src/logger'
import { flushTelemetry, shutdownTelemetry } from '../src/otel/lifecycle'
import { registerTelemetry } from '../src/otel/register'
import { captureLogger } from './helpers'

/** A fake engine: records each envelope it is sent. */
let server: Server
const received: { path: string; auth?: string; envelope: any }[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      let body = Buffer.concat(chunks)
      if (req.headers['content-encoding'] === 'gzip') body = gunzipSync(body)
      received.push({
        path: req.url ?? '',
        auth: req.headers.authorization,
        envelope: JSON.parse(body.toString('utf8')),
      })
      res.writeHead(202)
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  // No queue configured, LOG_EXPORT empty: the engine URL alone picks http.
  process.env.LOG_HTTP_URL = `http://ingest-token@127.0.0.1:${port}`
  process.env.OTEL_SERVICE_NAME = 'register-http-test'
  process.env.LOG_EXPORT_BATCH_MS = '50'
})

afterAll(async () => {
  await shutdownTelemetry(1000)
  server.close()
})

describe('registerTelemetry in http mode', () => {
  it('posts redacted logs and spans straight to the engine', async () => {
    const telemetry = registerTelemetry({ processHandlers: false })
    expect(telemetry).toEqual({ mode: 'http', started: true })

    const { lines } = captureLogger({ service: 'register-http-test' })
    getLogger().warn('Coupon rejected', { token: 'secret-token-123' })
    expect(lines).toHaveLength(1)
    trace.getTracer('test').startActiveSpan('checkout', (span) => span.end())

    await flushTelemetry(2000)
    // A second flush sends what the first flush's own requests could have traced.
    await flushTelemetry(2000)

    const logs = received.filter((r) => r.path === '/api/ingest/logs')
    const spans = received.filter((r) => r.path === '/api/ingest/spans')
    expect(logs.length).toBeGreaterThan(0)
    expect(spans.length).toBeGreaterThan(0)
    for (const r of received) expect(r.auth).toBe('Bearer ingest-token')

    const logText = JSON.stringify(logs.map((r) => r.envelope))
    expect(logText).toContain('Coupon rejected')
    expect(logText).not.toContain('secret-token-123')
    expect(logs[0].envelope.resource['service.name']).toBe('register-http-test')

    const spanItems = spans.flatMap((r) => r.envelope.items)
    expect(spanItems.map((s: any) => s.name)).toContain('checkout')
    // The SDK's own POSTs to the engine are never traced (no loop).
    expect(JSON.stringify(spanItems)).not.toContain('/api/ingest')
  })
})
