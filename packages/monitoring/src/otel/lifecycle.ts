import { releaseAllHeld } from '../logger/held-lines'
import { envNumber } from './identity'

/** What the running SDK exposes to process handlers and the Nest module. */
export interface TelemetryControl {
  /** `timeoutMs`: the caller's bound, so the exporters can plan within it. */
  forceFlush(timeoutMs?: number): Promise<void>
  shutdown(timeoutMs?: number): Promise<void>
}

let active: TelemetryControl | undefined
let shutdownPromise: Promise<void> | undefined

export function setActiveTelemetry(
  control: TelemetryControl | undefined,
): void {
  active = control
  shutdownPromise = undefined
}

function shutdownMs(): number {
  return envNumber('LOG_EXPORT_SHUTDOWN_MS', 3_000)
}

/** Resolves after `promise` or `ms`, whichever comes first; never rejects. */
function bounded(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
    promise.then(
      () => {
        clearTimeout(timer)
        resolve()
      },
      () => {
        clearTimeout(timer)
        resolve()
      },
    )
  })
}

/** Sends what is buffered; bounded by LOG_EXPORT_SHUTDOWN_MS. */
export function flushTelemetry(timeoutMs = shutdownMs()): Promise<void> {
  // Error lines still waiting for a response status are written first.
  releaseAllHeld()
  if (!active) return Promise.resolve()
  return bounded(active.forceFlush(timeoutMs), timeoutMs)
}

/** Flush and close the exporters once; later calls share the first. */
export function shutdownTelemetry(timeoutMs = shutdownMs()): Promise<void> {
  releaseAllHeld()
  if (!active) return Promise.resolve()
  shutdownPromise ??= bounded(active.shutdown(timeoutMs), timeoutMs)
  return shutdownPromise
}

/**
 * Last lines first, then exit: uncaughtException, a fatal rejection and a
 * boot failure must not lose the line that explains them.
 */
export function flushAndExit(code: number): void {
  shutdownTelemetry().finally(() => process.exit(code))
}
