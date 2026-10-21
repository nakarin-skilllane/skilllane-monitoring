import {
  context,
  propagation,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api'
import { captureMessage } from '../capture/messaging'
import { getLogger } from '../logger'
import { runJob } from '../jobs/run-job'
import { isInternal } from '../transport/internal'
import { DependencyMonitor } from './dependency-monitor'

/** Key inside job.data that carries the W3C trace headers of the producer. */
export const TRACE_DATA_KEY = '__trace'

/**
 * The app's own bullmq and @nestjs/bullmq exports. Passed in rather than
 * required here, so the library never loads a second copy (pnpm resolves
 * peers per package) and patches the classes the app really uses.
 */
export interface BullmqClasses {
  Worker: any
  Queue: any
  BullExplorer: any
}

export interface BullmqWatchOptions {
  classes: BullmqClasses
  /** Put the producer's traceparent into job.data on add. Default true. */
  propagateTrace?: boolean
  /** Env vars of the queue Redis, named in hints. */
  configKeys?: string[]
  /** Monitor of the shared queue connection, when it is watched directly. */
  monitor?: DependencyMonitor
}

let installed = false

/** host/port of a BullMQ `connection` option: options object or ioredis client. */
function addressOf(connection: any): { host?: unknown; port?: unknown } {
  const options = connection?.options ?? connection
  return { host: options?.host, port: options?.port }
}

function injectTrace(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return data
  const carrier: Record<string, string> = {}
  propagation.inject(context.active(), carrier)
  if (!carrier.traceparent) return data
  return { ...(data as object), [TRACE_DATA_KEY]: carrier }
}

/** job.data as the app gave it: without the SDK's trace headers. */
function ownData(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return data
  if (!(TRACE_DATA_KEY in data)) return data
  const { [TRACE_DATA_KEY]: _trace, ...rest } = data as Record<string, unknown>
  return rest
}

/** The job's name, id and options, as message headers. */
function jobHeaders(job: {
  name?: string
  id?: unknown
  opts?: object
  data?: unknown
}): Record<string, unknown> {
  const carrier = (job.data as Record<string, unknown> | undefined)?.[
    TRACE_DATA_KEY
  ]
  return {
    name: job.name,
    ...(job.id === undefined ? {} : { id: job.id }),
    ...(job.opts ?? {}),
    ...(carrier && typeof carrier === 'object' ? carrier : {}),
  }
}

const tracer = trace.getTracer('skilllane-monitoring')

/**
 * Queue.add / addBulk as a PRODUCER span `<queue> publish` (BullMQ has no
 * instrumentation of its own) carrying the job data and options; the job's
 * trace headers point at it.
 */
function publish<T>(
  queueName: string,
  jobs: Array<{ name?: string; data?: unknown; opts?: object }>,
  send: () => T,
): T {
  const span: Span = tracer.startSpan(`${queueName} publish`, {
    kind: SpanKind.PRODUCER,
    attributes: {
      'messaging.system': 'bullmq',
      'messaging.destination.name': queueName,
      'messaging.operation.type': 'send',
      'messaging.operation.name': 'publish',
      ...(jobs.length === 1
        ? {}
        : { 'messaging.batch.message_count': jobs.length }),
    },
  })
  try {
    captureMessage(
      span,
      jobs.length === 1
        ? { body: jobs[0].data, headers: jobHeaders(jobs[0]) }
        : {
            body: jobs.map((job) => ({ name: job.name, data: job.data })),
            headers: { count: jobs.length },
          },
    )
  } catch {
    // the job is still added
  }
  return context.with(trace.setSpan(context.active(), span), () => {
    let result: T
    try {
      result = send()
    } catch (error) {
      span.recordException(error as Error)
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error)?.message,
      })
      span.end()
      throw error
    }
    Promise.resolve(result).then(
      (added: any) => {
        if (added && !Array.isArray(added) && added.id !== undefined) {
          span.setAttribute('messaging.message.id', String(added.id))
        }
        span.end()
      },
      (error: unknown) => {
        span.recordException(error as Error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error)?.message,
        })
        span.end()
      },
    )
    return result
  })
}

function wrapProcessor(queueName: string, processor: unknown): unknown {
  if (typeof processor !== 'function') return processor
  return (job: any, token?: string) =>
    runJob(
      {
        kind: 'job',
        // Repeatable jobs are the app's cron (cron.service.ts adds them).
        source: job.repeatJobKey || job.opts?.repeat ? 'cron' : 'bullmq',
        field: `job:${queueName}:${job.id}`,
        queue: queueName,
        type: job.name,
        id: job.id === undefined ? undefined : String(job.id),
        attempt: (job.attemptsMade ?? 0) + 1,
        maxAttempts: job.opts?.attempts ?? 1,
        carrier: job.data?.[TRACE_DATA_KEY],
        logger: `Queue:${queueName}`,
        message: {
          body: ownData(job.data),
          headers: {
            ...jobHeaders(job),
            attemptsMade: job.attemptsMade,
            ...(typeof job.timestamp === 'number'
              ? { timestamp: new Date(job.timestamp).toISOString() }
              : {}),
          },
        },
      },
      () => processor(job, token),
    )
}

/**
 * Hooks every BullMQ worker that @nestjs/bullmq creates, by replacing its
 * worker class before the explorer registers processors (onModuleInit). The
 * class wraps the processor (job lines, inflight, trace) and listens for
 * connection errors and stalls. Queue.add/addBulk carry the trace. Call it
 * from a provider factory.
 */
export function installBullmqWatch(options: BullmqWatchOptions): boolean {
  if (installed) return true
  const { Worker, Queue, BullExplorer } = options.classes
  if (!Worker || !Queue || !BullExplorer) return false

  // All queues usually share one Redis connection: one monitor, so an outage
  // is one dependency.down line listing every affected queue.
  const monitor =
    options.monitor ??
    new DependencyMonitor({
      type: 'redis',
      name: 'queue',
      affects: [],
      configKeys: options.configKeys,
      module: 'bullmq',
    })
  const track = (queueName: string) => monitor.addAffected(`queue:${queueName}`)

  const BaseWorker = Worker
  class WatchedWorker extends BaseWorker {
    constructor(
      name: string,
      processor: unknown,
      opts?: any,
      connection?: any,
    ) {
      super(name, wrapProcessor(name, processor), opts, connection)
      track(name)
      const self = this as any
      const address = addressOf(self.opts?.connection)
      monitor.setAddress(address.host, address.port)
      self.on('error', (error: unknown) => monitor.markDown(error))
      self.on('ready', () => monitor.markUp())
      self.on('stalled', (jobId: string) => {
        getLogger().event({
          event: 'job.stalled',
          logger: `Queue:${name}`,
          fields: {
            'event.module': 'bullmq',
            'job.queue': name,
            'job.id': jobId,
          },
        })
      })
    }
  }
  BullExplorer.workerClass = WatchedWorker

  const watchedQueues = new WeakSet<object>()
  const watchQueue = (queue: any, ready?: unknown) => {
    if (watchedQueues.has(queue)) return
    watchedQueues.add(queue)
    track(queue.name)
    const address = addressOf(queue.opts?.connection)
    monitor.setAddress(address.host, address.port)
    queue.on('error', (error: unknown) => monitor.markDown(error))
    // A producer-only process has no Worker 'ready' event; the queue's own
    // connection (bullmq RedisConnection) emits 'ready' after each reconnect.
    queue.connection?.on?.('ready', () => monitor.markUp())
    // The first connect: the connection may be ready before we listen.
    if (ready && typeof (ready as Promise<unknown>).then === 'function') {
      ;(ready as Promise<unknown>).then(
        () => monitor.markUp(),
        () => undefined,
      )
    }
  }
  const propagate = options.propagateTrace ?? true
  const proto = Queue.prototype
  // The Queue constructor calls waitUntilReady(): every queue the app creates
  // is watched from the start, not only from its first add().
  const originalReady = proto.waitUntilReady
  if (typeof originalReady === 'function') {
    proto.waitUntilReady = function (this: any, ...args: unknown[]) {
      const ready = originalReady.apply(this, args)
      try {
        if (!isInternal(this)) watchQueue(this, ready)
      } catch {
        // the queue still works, without dependency lines
      }
      return ready
    }
  }
  const originalAdd = proto.add
  proto.add = function (name: string, data: unknown, opts?: unknown) {
    // The SDK's own telemetry queues are not the app's queues.
    if (isInternal(this)) return originalAdd.call(this, name, data, opts)
    watchQueue(this)
    return publish(this.name, [{ name, data, opts: opts as object }], () =>
      originalAdd.call(this, name, propagate ? injectTrace(data) : data, opts),
    )
  }
  const originalAddBulk = proto.addBulk
  proto.addBulk = function (
    jobs: Array<{ name?: string; data?: unknown; opts?: object }>,
  ) {
    if (isInternal(this)) return originalAddBulk.call(this, jobs)
    watchQueue(this)
    return publish(this.name, jobs, () =>
      originalAddBulk.call(
        this,
        propagate
          ? jobs.map((job) => ({ ...job, data: injectTrace(job.data) }))
          : jobs,
      ),
    )
  }

  installed = true
  return true
}
