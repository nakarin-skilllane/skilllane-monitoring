import { createRequire } from 'module'
import type { AddressInfo } from 'net'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { hookNestFactory } from '../src/nest/nest-auto'
import { captureLogger } from './helpers'

// Hook first, then load Nest: what `--require @skilllane/monitoring/register` does.
hookNestFactory()
const load = createRequire(__filename)
require('reflect-metadata')
const { Controller, Get, Inject, Injectable, Logger, Module } =
  load('@nestjs/common')
const { NestFactory } = load('@nestjs/core')

const { lines } = captureLogger()

/** An app with no logging code at all. */
@Injectable()
class Greeter {
  private readonly logger = new Logger('Greeter')
  hello() {
    this.logger.log('Greeting', { name: 'n' })
    return 'hi'
  }
}

@Controller()
class AppController {
  // Explicit token: vitest's esbuild emits no decorator metadata.
  constructor(@Inject(Greeter) private readonly greeter: Greeter) {}
  @Get('hello')
  hello() {
    return this.greeter.hello()
  }
}

@Module({ controllers: [AppController], providers: [Greeter] })
class AppModule {}

let close: (() => Promise<void>) | undefined

afterAll(async () => {
  await close?.()
})

describe('automatic Nest wiring', () => {
  it('logs boot lines in order, app.started with the port, and each request', async () => {
    const app = await NestFactory.create(AppModule)
    close = () => app.close()
    // The app's own setupLogging after the automatic one changes nothing.
    const { setupLogging } = await import('../src/nest/setup-logging')
    setupLogging(app)
    // An existing app installs its old logger after create(); it is ignored.
    const oldLogger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() }
    app.useLogger(oldLogger)
    await app.listen(0, '127.0.0.1')
    const { port } = app.getHttpServer().address() as AddressInfo

    const response = await fetch(`http://127.0.0.1:${port}/hello`)
    expect(await response.text()).toBe('hi')
    await new Promise((resolve) => setTimeout(resolve, 20))

    const codes = lines.map((l) => `${l['event.code']}:${l['log.logger']}`)
    const started = codes.indexOf('app.started:@skilllane/monitoring')
    expect(started).toBeGreaterThan(codes.indexOf('app.log:NestFactory'))
    expect(lines[started]['server.port']).toBe(port)
    expect(lines.filter((l) => l.message === 'Greeting')).toHaveLength(1)
    expect(oldLogger.log).not.toHaveBeenCalled()
    const requests = lines.filter((l) => l['event.code'] === 'http.request')
    // One request line: the middleware is installed once, not twice.
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      'http.request.method': 'GET',
      'http.route': '/hello',
      'http.response.status_code': 200,
    })
  })

  it('logs a failing boot once and rejects instead of aborting', async () => {
    @Injectable()
    class Broken {
      constructor() {
        throw new Error('config missing: DATABASE_URL')
      }
    }
    @Module({ providers: [Broken] })
    class BrokenModule {}

    const before = lines.length
    await expect(
      NestFactory.createApplicationContext(BrokenModule),
    ).rejects.toThrow('config missing')
    const boot = lines
      .slice(before)
      .filter((l) => l['event.code'] === 'app.boot_failed')
    expect(boot).toHaveLength(1)
    expect(boot[0]['error.message']).toContain('config missing: DATABASE_URL')
  })

  it("keeps this package's logger when the app passes only log levels", async () => {
    @Module({ providers: [Greeter] })
    class WorkerModule {}

    const before = lines.length
    // What an existing worker entry point does.
    const app = await NestFactory.createApplicationContext(WorkerModule, {
      logger: ['log', 'warn', 'error'],
    })
    await app.close()

    const loaders = lines
      .slice(before)
      .filter((l) => l['log.logger'] === 'InstanceLoader')
    expect(loaders.length).toBeGreaterThan(0)
  })
})
