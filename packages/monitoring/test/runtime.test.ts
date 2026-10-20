import { afterEach, describe, expect, it, vi } from 'vitest'
import { inflight } from '../src/inflight/tracker'
import {
  DependencyMonitor,
  STILL_DOWN_MS,
} from '../src/integrations/dependency-monitor'
import { runJob, tracked } from '../src/jobs/run-job'
import { captureLogger } from './helpers'

afterEach(() => {
  vi.useRealTimers()
})

describe('DependencyMonitor', () => {
  it('logs down once, still_down periodically, then up', () => {
    vi.useFakeTimers()
    const { lines } = captureLogger()
    const monitor = new DependencyMonitor({
      type: 'redis',
      name: 'cache',
      host: '10.0.0.1',
      port: 6379,
      affects: ['cache'],
      configKeys: ['REDIS_HOST'],
    })
    const err = Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:6379'), {
      code: 'ECONNREFUSED',
    })
    monitor.markDown(err)
    monitor.markDown(err)
    vi.advanceTimersByTime(STILL_DOWN_MS + 10)
    monitor.markUp()
    expect(lines.map((l) => l['event.code'])).toEqual([
      'dependency.down',
      'dependency.still_down',
      'dependency.up',
    ])
    expect(lines[0]).toMatchObject({
      'error.hint': 'Redis "cache" unreachable',
      'dependency.affects': ['cache'],
    })
  })
})

describe('runJob', () => {
  it('logs started → finished and clears inflight', async () => {
    const { lines } = captureLogger()
    const meta = {
      kind: 'job' as const,
      source: 'bullmq' as const,
      field: 'job:email:1',
      queue: 'email',
      type: 'send',
      id: '1',
      logger: 'Queue:email',
    }
    await runJob(meta, async () => {
      expect(inflight.list()).toEqual(['job:send#1'])
    })
    expect(lines.map((l) => l['event.code'])).toEqual([
      'job.started',
      'job.finished',
    ])
    expect(inflight.size).toBe(0)
  })

  it('logs retry, then failed on the last attempt, and rethrows', async () => {
    const { lines } = captureLogger()
    const boom = new TypeError('x is undefined')
    const base = {
      kind: 'job' as const,
      source: 'bullmq' as const,
      field: 'job:email:2',
      queue: 'email',
      type: 'send',
      id: '2',
      logger: 'Queue:email',
      maxAttempts: 2,
    }
    await expect(
      runJob({ ...base, attempt: 1 }, async () => {
        throw boom
      }),
    ).rejects.toBe(boom)
    await expect(
      runJob({ ...base, attempt: 2 }, async () => {
        throw boom
      }),
    ).rejects.toBe(boom)
    expect(
      lines
        .filter((l) => l['event.code'] !== 'job.started')
        .map((l) => [l['event.code'], l['job.final']]),
    ).toEqual([
      ['job.retry', false],
      ['job.failed', true],
    ])
  })
})

describe('event.module and server.port', () => {
  it('tags job lines with their source', async () => {
    const { lines } = captureLogger()
    await tracked('announcement', async () => {}, { source: 'cron' })
    expect(lines[0]).toMatchObject({
      'event.code': 'job.started',
      'event.module': 'cron',
      'job.type': 'announcement',
    })
  })

  it('logs app.started when the server listens, with the port', async () => {
    const { lines } = captureLogger()
    const { logStartedAfterListen } = await import('../src/nest/app-started')
    const { EventEmitter } = await import('events')
    const server = Object.assign(new EventEmitter(), {
      address: () => ({ port: 3123 }),
    })
    // Like Nest's application proxy: writes to the app are swallowed.
    const app = new Proxy(
      { getHttpServer: () => server, listen: async () => {} },
      { set: () => true },
    )
    logStartedAfterListen(app)
    expect(lines).toHaveLength(0)
    server.emit('listening')
    expect(lines[0]).toMatchObject({
      'event.code': 'app.started',
      'server.port': 3123,
    })
  })

  it('parses a broker address without credentials', async () => {
    const { parseAddress } = await import(
      '../src/integrations/dependency-monitor'
    )
    expect(parseAddress('amqp://user:secret@mq.local:5672/vh')).toEqual({
      host: 'mq.local',
      port: 5672,
    })
    expect(parseAddress('kafka-0.kafka:9092,kafka-1.kafka:9092')).toEqual({
      host: 'kafka-0.kafka',
      port: 9092,
    })
  })
})

describe('watchers never break the app', () => {
  it('skip clients without an event API', async () => {
    const { watchKafkaConsumer, watchKafkaProducer } = await import(
      '../src/integrations/kafka'
    )
    const { watchRedis } = await import('../src/integrations/redis')
    const { RabbitMonitor } = await import('../src/integrations/rabbitmq')
    expect(() => watchKafkaProducer({}, { name: 'p' })).not.toThrow()
    expect(() => watchKafkaConsumer({}, { name: 'c' })).not.toThrow()
    expect(() => watchRedis({ client: {}, name: 'r' })).not.toThrow()
    expect(() => new RabbitMonitor({ name: 'mq' }).attach({})).not.toThrow()
  })
})
