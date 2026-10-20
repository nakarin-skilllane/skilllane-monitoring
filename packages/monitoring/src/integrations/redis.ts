import type { JobSource } from '../types'
import { DependencyMonitor } from './dependency-monitor'

export interface RedisWatch {
  /** An ioredis client (Redis or Cluster). */
  client: any
  name: string
  affects?: string[]
  configKeys?: string[]
  /** `event.module` of its lines, e.g. 'bullmq' for the queue connection. */
  module?: JobSource
}

const DEAD_STATUSES = new Set(['end', 'close'])

/**
 * Turns ioredis connection events into dependency lines. Attaching an
 * `error` listener also stops ioredis printing "[ioredis] Unhandled error
 * event" for every reconnect attempt.
 */
export function watchRedis(watch: RedisWatch): DependencyMonitor {
  const { client } = watch
  const options = client?.options ?? {}
  const monitor = new DependencyMonitor({
    type: 'redis',
    name: watch.name,
    host: options.host,
    port: options.port,
    affects: watch.affects,
    configKeys: watch.configKeys,
    module: watch.module,
  })
  if (typeof client?.on !== 'function') return monitor
  client.on('error', (error: unknown) => monitor.markDown(error))
  client.on('reconnecting', () => monitor.markAttempt())
  client.on('ready', () => monitor.markUp())
  // A client still connecting at boot is normal; only a dead one is down.
  if (DEAD_STATUSES.has(client.status)) monitor.markDown()
  // Watched after it connected: no 'ready' event will come for that connect.
  else if (client.status === 'ready') monitor.markUp()
  return monitor
}
