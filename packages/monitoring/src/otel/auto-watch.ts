import { join } from 'path'
import { Hook } from 'require-in-the-middle'
import { tracked } from '../jobs/run-job'
import {
  DependencyMonitor,
  parseAddress,
} from '../integrations/dependency-monitor'
import { RabbitMonitor, trackRabbitMessage } from '../integrations/rabbitmq'
import { isInternal } from '../transport/internal'

/**
 * Hooks that watch the app's clients without any code in the app: every
 * ioredis connection, every amqplib connection and consumer, and every
 * @nestjs/schedule job. Installed by registerTelemetry before the app loads
 * these modules; turn off with LOG_AUTO_WATCH=false. CommonJS only.
 */

const PATCHED = Symbol.for('skilllane-monitoring.auto-watch-patched')

function markPatched(target: any): boolean {
  if (!target || target[PATCHED]) return false
  Object.defineProperty(target, PATCHED, { value: true })
  return true
}

const hooks: Hook[] = []

// --- ioredis ------------------------------------------------------------------

const redisMonitors = new Map<string, DependencyMonitor>()
const watchedRedis = new WeakSet<object>()

/**
 * One monitor per server and db, shared by every client that talks to it:
 * BullMQ alone opens several connections, and an outage is one event.
 */
function redisMonitorFor(client: any): DependencyMonitor {
  const options = client?.options ?? {}
  const cluster = Array.isArray(client?.startupNodes)
  const db = Number(options.db ?? 0)
  const name = cluster ? 'redis-cluster' : db ? `redis-db${db}` : 'redis'
  const key = cluster ? name : `${options.host}:${options.port}/${db}`
  let monitor = redisMonitors.get(key)
  if (!monitor) {
    monitor = new DependencyMonitor({
      type: 'redis',
      name,
      host: cluster ? undefined : options.host,
      port: cluster ? undefined : options.port,
    })
    redisMonitors.set(key, monitor)
  }
  return monitor
}

export function attachRedis(client: any): void {
  if (
    !client ||
    isInternal(client) ||
    watchedRedis.has(client) ||
    typeof client.on !== 'function'
  ) {
    return
  }
  watchedRedis.add(client)
  const monitor = redisMonitorFor(client)
  // Also stops ioredis printing "[ioredis] Unhandled error event" per retry.
  client.on('error', (error: unknown) => monitor.markDown(error))
  client.on('reconnecting', () => monitor.markAttempt())
  client.on('ready', () => monitor.markUp())
}

function patchRedisConnect(proto: any): void {
  if (typeof proto?.connect !== 'function' || !markPatched(proto)) return
  const connect = proto.connect
  // The constructor calls connect() unless lazyConnect, which calls it later.
  proto.connect = function (this: any, ...args: unknown[]) {
    attachRedis(this)
    return connect.apply(this, args)
  }
}

function hookIoredis(): void {
  hooks.push(
    new Hook(['ioredis'], (exports: any) => {
      try {
        patchRedisConnect((exports?.default ?? exports)?.prototype)
        patchRedisConnect(exports?.Cluster?.prototype)
      } catch {
        // the app still runs, without Redis dependency lines
      }
      return exports
    }),
  )
}

// --- amqplib ------------------------------------------------------------------

const rabbitMonitors = new Map<string, RabbitMonitor>()

function rabbitMonitorFor(url: unknown): RabbitMonitor {
  const address =
    typeof url === 'string'
      ? parseAddress(url)
      : {
          host: (url as any)?.hostname,
          port: (url as any)?.port,
        }
  const key = `${address.host}:${address.port}`
  let monitor = rabbitMonitors.get(key)
  if (!monitor) {
    monitor = new RabbitMonitor({ name: 'rabbitmq', ...address })
    rabbitMonitors.set(key, monitor)
  }
  return monitor
}

/** Each delivery runs as a job: job lines, inflight and the sender's trace. */
export function patchConsume(channel: any): any {
  if (typeof channel?.consume !== 'function' || !markPatched(channel)) {
    return channel
  }
  const consume = channel.consume
  channel.consume = function (
    this: any,
    queue: string,
    onMessage: ((message: any) => unknown) | undefined,
    ...rest: unknown[]
  ) {
    const tracked =
      typeof onMessage === 'function'
        ? (message: any) => {
            // null: the broker cancelled the consumer.
            if (message === null) return onMessage(message)
            // job.failed is already logged; a rejection nobody handles
            // would end the process (UNHANDLED_REJECTION=exit).
            return trackRabbitMessage({ queue, message }, async () =>
              onMessage(message),
            ).catch(() => undefined)
          }
        : onMessage
    return consume.call(this, queue, tracked, ...rest)
  }
  return channel
}

function patchChannelModel(model: any): void {
  if (!model || !markPatched(model)) return
  for (const method of ['createChannel', 'createConfirmChannel']) {
    const create = model[method]
    if (typeof create !== 'function') continue
    model[method] = async function (this: any, ...args: unknown[]) {
      return patchConsume(await create.apply(this, args))
    }
  }
}

/** amqplib's promise API: connection state, and consumers on its channels. */
export function patchAmqplib(exports: any): any {
  const connect = exports?.connect
  if (typeof connect !== 'function' || !markPatched(exports)) return exports
  exports.connect = async function (
    this: unknown,
    url: unknown,
    ...rest: unknown[]
  ) {
    // The SDK's telemetry connection: not an app dependency, no consumers.
    if (isInternal(rest[0])) return connect.call(this, url, ...rest)
    const monitor = rabbitMonitorFor(url)
    try {
      const model = await connect.call(this, url, ...rest)
      monitor.attach(model)
      patchChannelModel(model)
      return model
    } catch (error) {
      monitor.connectFailed(error)
      throw error
    }
  }
  return exports
}

function hookAmqplib(): void {
  hooks.push(new Hook(['amqplib'], (exports: any) => patchAmqplib(exports)))
}

// --- @nestjs/schedule ---------------------------------------------------------

/**
 * @Cron / @Interval / @Timeout methods run as jobs named Class.method.
 * Wrapped inside Nest's own try/catch, so a failing run is job.failed.
 */
export function patchScheduleExplorer(proto: any): void {
  const wrap = proto?.wrapFunctionInTryCatchBlocks
  if (typeof wrap !== 'function' || !markPatched(proto)) return
  proto.wrapFunctionInTryCatchBlocks = function (
    this: unknown,
    methodRef: (...args: unknown[]) => unknown,
    instance: any,
  ) {
    const name = `${instance?.constructor?.name ?? 'Schedule'}.${methodRef?.name || 'run'}`
    const run = (...args: unknown[]) =>
      tracked(name, async () => methodRef.apply(instance, args), {
        source: 'cron',
      })
    return wrap.call(this, run, instance)
  }
}

function hookNestSchedule(): void {
  hooks.push(
    new Hook(['@nestjs/schedule'], (exports: any, _name, basedir) => {
      try {
        // Not re-exported from the package root.
        const explorer = basedir
          ? require(join(basedir, 'dist', 'schedule.explorer'))
          : undefined
        patchScheduleExplorer(explorer?.ScheduleExplorer?.prototype)
      } catch {
        // the app still runs, without job lines for scheduled methods
      }
      return exports
    }),
  )
}

let installed = false

export function hookAutoWatch(): void {
  if (installed) return
  installed = true
  hookIoredis()
  hookAmqplib()
  hookNestSchedule()
}
