import { inflight } from '../inflight/tracker'
import { markShuttingDown } from '../integrations/dependency-monitor'
import { getLogger } from '../logger'
import { releaseAllHeld } from '../logger/held-lines'
import { flushAndExit, shutdownTelemetry } from '../otel/lifecycle'
import { isBootFailureLogged } from './boot-failure'

export type UnhandledRejectionMode = 'exit' | 'log'

let installed = false

/**
 * - uncaughtException → `app.uncaught_exception` (fatal), then exit(1) as
 *   Node would — after the exporters flush (LOG_EXPORT_SHUTDOWN_MS). When
 *   the app has its own uncaughtException listener, Node would not exit, so
 *   neither does this: the line is written and the app's handler decides.
 * - unhandledRejection → `app.unhandled_rejection`; mode `exit` (default)
 *   keeps Node 20's crash, mode `log` keeps the process alive.
 * - SIGTERM/SIGINT → `app.shutdown` with the work in progress. Registered
 *   with `once` so Nest's shutdown hook can re-send the signal and exit.
 */
export function installProcessHandlers(mode: UnhandledRejectionMode): void {
  if (installed) return
  installed = true

  process.on('uncaughtException', (error) => {
    // Error lines still waiting for a response status come first.
    releaseAllHeld()
    getLogger().event({
      event: 'app.uncaught_exception',
      logger: 'process',
      error,
      fields: { 'job.inflight': inflight.list() },
    })
    // Ours alone: Node's default (exit 1) is gone because we listen, so keep it.
    if (process.listenerCount('uncaughtException') <= 1) flushAndExit(1)
  })

  process.on('unhandledRejection', (reason) => {
    // A failed NestFactory.create the app did not catch: already logged, and
    // a process without an app must not stay up even in `log` mode.
    if (isBootFailureLogged(reason)) {
      flushAndExit(1)
      return
    }
    releaseAllHeld()
    getLogger().event({
      event: 'app.unhandled_rejection',
      level: mode === 'exit' ? 'fatal' : 'error',
      logger: 'process',
      error: reason,
      fields: { 'job.inflight': inflight.list() },
    })
    if (mode === 'exit') flushAndExit(1)
  })

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      markShuttingDown()
      releaseAllHeld()
      getLogger().event({
        event: 'app.shutdown',
        logger: 'process',
        fields: { signal, 'job.inflight': inflight.list() },
      })
      // Our listener alone would stop Node's default exit; if nothing else
      // (Nest shutdown hooks) handles the signal, flush and re-raise it. With
      // Nest, LoggingModule flushes in onApplicationShutdown instead.
      if (process.listenerCount(signal) === 0) {
        shutdownTelemetry().finally(() => process.kill(process.pid, signal))
      }
    })
  }
}
