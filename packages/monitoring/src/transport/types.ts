import type {
  EnvelopeTransport,
  TelemetryStream,
} from '@skilllane/monitoring-contract'

/** One queue message: one encoded Envelope. */
export interface OutgoingMessage {
  /** UTF-8 JSON of the Envelope. */
  body: Buffer
  /** Kafka key / AMQP appId: `<service>/<role>`. */
  key: string
  /** Items in the envelope. */
  count: number
}

/**
 * One customer queue, or the engine over HTTP. Connections are opened lazily
 * on the first send and shared by the logs and spans publishers.
 */
export interface Transport {
  readonly name: EnvelopeTransport
  /** Where it publishes, without credentials, e.g. `localhost:29092`. */
  readonly target: string
  /** Idempotent; concurrent callers share one attempt. */
  connect(): Promise<void>
  publish(stream: TelemetryStream, message: OutgoingMessage): Promise<void>
  /** Drops the connection (a later connect() opens a new one). Never rejects. */
  close(): Promise<void>
}

/**
 * The receiver will never take this message (too large, malformed): the
 * publisher drops it instead of retrying it, so it does not block the items
 * behind it.
 */
export class RejectedMessageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RejectedMessageError'
  }
}

export const noop = (): void => {}

/** Rejects after `ms` (the timer never keeps the process alive). */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(message)),
      Math.max(1, Math.min(ms, 2_147_483_647)),
    )
    timer.unref?.()
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** Resolves when `promise` settles or at `deadline` (epoch ms); never rejects. */
export function untilDeadline(
  promise: Promise<unknown>,
  deadline: number,
): Promise<void> {
  if (!Number.isFinite(deadline)) return promise.then(noop, noop)
  return withTimeout(promise, deadline - Date.now(), 'deadline').then(
    noop,
    noop,
  )
}

/**
 * Holds the event loop open (a referenced timer) while `promise` runs, at
 * most `ms`. The SDK's sockets and timers are unreferenced so that they never
 * keep an app alive; a flush on shutdown must still get to finish.
 */
export function keepAlive<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timer = setTimeout(noop, Math.max(1, Math.min(ms, 2_147_483_647)))
  return promise.finally(() => clearTimeout(timer))
}
