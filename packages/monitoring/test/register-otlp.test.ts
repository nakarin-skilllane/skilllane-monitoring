import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getLogger } from '../src/logger'
import { flushTelemetry, shutdownTelemetry } from '../src/otel/lifecycle'
import { registerTelemetry } from '../src/otel/register'
import { captureLogger } from './helpers'

/** A fake collector: records each OTLP request path and its protobuf body. */
let server: Server
const received: { path: string; body: Buffer }[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      received.push({ path: req.url ?? '', body: Buffer.concat(chunks) })
      res.writeHead(200, { 'content-type': 'application/x-protobuf' })
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  process.env.OTEL_EXPORTER_ENDPOINT = `http://127.0.0.1:${port}`
  process.env.OTEL_SERVICE_NAME = 'register-test'
  process.env.LOG_EXPORT_BATCH_MS = '50'
})

afterAll(async () => {
  await shutdownTelemetry(1000)
  server.close()
})

describe('registerTelemetry in otlp mode', () => {
  it('sends log lines to <endpoint>/v1/logs after redaction', async () => {
    const telemetry = registerTelemetry({ processHandlers: false })
    expect(telemetry).toEqual({ mode: 'otlp', started: true })
    // A second call is the first result.
    expect(registerTelemetry()).toBe(telemetry)

    const { lines } = captureLogger({ service: 'register-test' })
    getLogger().warn('Coupon rejected', { token: 'secret-token-123' })
    expect(lines).toHaveLength(1)

    await flushTelemetry(2000)
    const logs = received.filter((r) => r.path === '/v1/logs')
    expect(logs.length).toBeGreaterThan(0)
    const body = Buffer.concat(logs.map((r) => r.body)).toString('latin1')
    expect(body).toContain('Coupon rejected')
    expect(body).toContain('register-test')
    expect(body).not.toContain('secret-token-123')
  })
})
