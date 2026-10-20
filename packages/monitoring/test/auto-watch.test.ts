import { createRequire } from 'module'
import { describe, expect, it, vi } from 'vitest'
import { defaultRequestUser } from '../src/logger/context'
import {
  hookAutoWatch,
  patchAmqplib,
  patchConsume,
  patchScheduleExplorer,
} from '../src/otel/auto-watch'
import { hookKafkajsLogs, trackRun } from '../src/otel/kafkajs-hook'
import { captureLogger, type Line } from './helpers'

// Hook first, then load the clients: what `--require @skilllane/monitoring/register` does.
hookAutoWatch()
hookKafkajsLogs({ watch: true })
const load = createRequire(__filename)

const codes = (lines: Line[]) => lines.map((l) => l['event.code'])

async function waitFor(check: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe('ioredis', () => {
  it('reports a Redis the app cannot reach, without any app code', async () => {
    const { lines } = captureLogger()
    const Redis = load('ioredis')
    const client = new Redis({
      host: '127.0.0.1',
      port: 1,
      lazyConnect: true,
      retryStrategy: () => null,
      maxRetriesPerRequest: 0,
    })
    await client.connect().catch(() => undefined)
    await waitFor(() => codes(lines).includes('dependency.down'))
    client.disconnect()

    const down = lines.find((l) => l['event.code'] === 'dependency.down')
    expect(down).toMatchObject({
      'dependency.type': 'redis',
      'dependency.name': 'redis',
      'dependency.port': 1,
    })
  })
})

describe('kafkajs', () => {
  it('runs each message as a job', async () => {
    const { lines } = captureLogger()
    let eachMessage: ((payload: unknown) => Promise<void>) | undefined
    const consumer = {
      run: vi.fn(async (config: any) => {
        eachMessage = config.eachMessage
      }),
    }
    trackRun(consumer)
    const handle = vi.fn(async () => undefined)
    await consumer.run({ eachMessage: handle })
    await eachMessage?.({
      topic: 'exam-answers',
      partition: 2,
      message: { offset: '41', headers: {} },
    })

    expect(handle).toHaveBeenCalledTimes(1)
    expect(lines.find((l) => l['event.code'] === 'job.finished')).toMatchObject(
      {
        'event.module': 'kafka',
        'job.queue': 'exam-answers',
        'job.id': 'p2-o41',
      },
    )
  })

  it('watches the consumers an app creates', () => {
    const { Kafka } = load('kafkajs')
    const consumer = new Kafka({
      clientId: 't',
      brokers: ['localhost:1'],
    }).consumer({ groupId: 'g' })
    // trackRun replaced run with its own wrapper.
    expect(consumer.run.name).toBe('')
  })
})

describe('amqplib', () => {
  it('reports a broker the app cannot reach', async () => {
    const { lines } = captureLogger()
    const amqplib = patchAmqplib({
      connect: vi.fn(async () => {
        throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5672'), {
          code: 'ECONNREFUSED',
        })
      }),
    })
    await expect(amqplib.connect('amqp://127.0.0.1:5672')).rejects.toThrow()

    expect(
      lines.find((l) => l['event.code'] === 'dependency.down'),
    ).toMatchObject({
      'dependency.type': 'rabbitmq',
      'dependency.host': '127.0.0.1',
      'dependency.port': 5672,
    })
  })

  it('runs each delivery as a job and keeps a failure from crashing the process', async () => {
    const { lines } = captureLogger()
    let deliver: ((message: unknown) => unknown) | undefined
    const channel = patchConsume({
      consume: vi.fn((_queue: string, onMessage: (m: unknown) => unknown) => {
        deliver = onMessage
      }),
    })
    channel.consume('notifications', async () => {
      throw new Error('handler failed')
    })
    await deliver?.({
      fields: { deliveryTag: 7, redelivered: false },
      properties: { headers: {} },
    })

    expect(lines.find((l) => l['event.code'] === 'job.failed')).toMatchObject({
      'event.module': 'rabbitmq',
      'job.queue': 'notifications',
      'job.id': '7',
    })
  })
})

describe('@nestjs/schedule', () => {
  it('runs a scheduled method as a job named Class.method', async () => {
    const { lines } = captureLogger()
    // Nest's own wrapper: catches and logs, as ScheduleExplorer does.
    const nestLog = vi.fn()
    const proto = {
      wrapFunctionInTryCatchBlocks(methodRef: any, instance: any) {
        return async (...args: unknown[]) => {
          try {
            await methodRef.call(instance, ...args)
          } catch (error) {
            nestLog(error)
          }
        }
      },
    }
    patchScheduleExplorer(proto)

    class AnnouncementCronService {
      async publishDue() {
        throw new Error('no connection')
      }
    }
    const instance = new AnnouncementCronService()
    await proto.wrapFunctionInTryCatchBlocks(instance.publishDue, instance)()

    expect(nestLog).toHaveBeenCalledTimes(1)
    expect(lines.find((l) => l['event.code'] === 'job.failed')).toMatchObject({
      'event.module': 'cron',
      'job.type': 'AnnouncementCronService.publishDue',
    })
  })
})

describe('defaultRequestUser', () => {
  it('reads the user, the active role and the school', () => {
    expect(
      defaultRequestUser({
        user: { id: 42, schoolId: 7 },
        headers: { 'current-role': 'teacher' },
      }),
    ).toEqual({ id: '42', roles: ['teacher'], organizationId: '7' })
  })

  it('is empty for an anonymous request', () => {
    expect(defaultRequestUser({ headers: {} })).toBeUndefined()
  })
})
