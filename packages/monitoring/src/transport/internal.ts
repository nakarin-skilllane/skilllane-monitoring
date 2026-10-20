/**
 * The SDK's own queue clients (Kafka producer, AMQP connection, Redis
 * connection, BullMQ queues) are marked so that the auto-watch hooks, which
 * patch these libraries globally for the app, leave them alone: no
 * dependency lines, no affected queues, no job tracking for telemetry
 * traffic.
 */
export const INTERNAL = Symbol.for('@skilllane/monitoring.internal-client')

/** Connection name the SDK gives its clients (visible to the broker too). */
export const INTERNAL_NAME = 'skilllane-monitoring-sdk-telemetry'

/** Set by the kafkajs hook on its subclass: the original Kafka class. */
export const KAFKAJS_UNPATCHED = Symbol.for(
  '@skilllane/monitoring.kafkajs-unpatched',
)

export function markInternal<T extends object>(target: T): T {
  try {
    Object.defineProperty(target, INTERNAL, { value: true })
  } catch {
    // a frozen object is only recognised by its connection name
  }
  return target
}

/**
 * True for an object the SDK marked, for a client whose options carry the
 * SDK's connection name (ioredis `duplicate()` copies options, not marks),
 * and for a BullMQ queue built on such a client (its constructor already
 * runs before the SDK can mark the queue itself).
 */
export function isInternal(target: unknown, depth = 0): boolean {
  if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
    return false
  }
  const value = target as any
  if (value[INTERNAL]) return true
  const name =
    value.options?.connectionName ?? value.clientProperties?.connection_name
  if (typeof name === 'string' && name.startsWith(INTERNAL_NAME)) return true
  const connection = value.opts?.connection
  return depth === 0 && !!connection && isInternal(connection, 1)
}
