import type { INestApplicationContext, LoggerService } from '@nestjs/common'
import { getLogger } from '../logger'
import { flushAndExit } from '../otel/lifecycle'
import { isBootFailureLogged, markBootFailureLogged } from './boot-failure'
import { logStartedAfterListen } from './app-started'
import {
  installProcessHandlers,
  type UnhandledRejectionMode,
} from './process-handlers'
import { createRequestLogger } from './request-logger.middleware'

export type LoggingEngine = 'new' | 'legacy'

export function loggingEngine(): LoggingEngine {
  return process.env.LOGGING_ENGINE === 'legacy' ? 'legacy' : 'new'
}

export interface SetupLoggingOptions {
  /** Returns the old logger; used when LOGGING_ENGINE=legacy. */
  legacyLogger?: () => LoggerService
  /** Paths without an http.request line, e.g. ['/health']. */
  ignorePaths?: string[]
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && process.env[name] !== '' ? value : fallback
}

/**
 * Call right after NestFactory.create / createApplicationContext, before any
 * other middleware. Pass the logger to create() as well (`logger:
 * getLogger()`) so boot lines use it. With LOGGING_ENGINE=legacy this only
 * installs the old logger and adds nothing else.
 */
// Apps already set up. A WeakSet, not a flag on the app: Nest's application
// proxy swallows property writes.
const setUp = new WeakSet<object>()

export function setupLogging(
  app: INestApplicationContext,
  options: SetupLoggingOptions = {},
): LoggerService {
  // The automatic wiring (NODE_OPTIONS) ran first; the app's own call is a no-op.
  if (setUp.has(app)) return getLogger()
  setUp.add(app)
  if (loggingEngine() === 'legacy' && options.legacyLogger) {
    const legacy = options.legacyLogger()
    app.useLogger(legacy)
    return legacy
  }

  const logger = getLogger()
  app.useLogger(logger)
  // Boot lines held by bufferLogs, now in order before `app.started`.
  ;(app as { flushLogs?: () => void }).flushLogs?.()

  const http = app as INestApplicationContext & {
    use?: (...args: any[]) => unknown
  }
  logStartedAfterListen(app as { getHttpServer?: () => unknown })
  if (typeof http.use === 'function') {
    http.use(
      createRequestLogger({
        inflightAfterMs: envNumber('INFLIGHT_HTTP_AFTER_MS', 1_000),
        ignorePaths: options.ignorePaths,
      }),
    )
  }

  if (process.env.NODE_ENV !== 'test') {
    const mode: UnhandledRejectionMode =
      process.env.UNHANDLED_REJECTION === 'log' ? 'log' : 'exit'
    installProcessHandlers(mode)
  }
  app.enableShutdownHooks()
  return logger
}

/**
 * `bootstrap().catch(logBootFailure)`: one fatal line, flushed to the
 * exporters (bounded by LOG_EXPORT_SHUTDOWN_MS), then exit(1).
 */
export function logBootFailure(error: unknown): void {
  try {
    // NestFactory, wrapped by the automatic wiring, may have logged it already.
    if (!isBootFailureLogged(error)) {
      getLogger().event({
        event: 'app.boot_failed',
        logger: 'bootstrap',
        error,
      })
      markBootFailureLogged(error)
    }
  } finally {
    flushAndExit(1)
  }
}
