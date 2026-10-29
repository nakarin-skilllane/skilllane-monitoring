import { callerOf } from '../errors/origin'
import type { LogLevel } from '../types'
import { getLogger } from '.'

type Write = (message: any, ...optionalParams: any[]) => void

/** The methods of Nest's `Logger`, so `new Logger()` can stand in for `log`. */
export interface Log {
  log: Write
  error: Write
  warn: Write
  debug: Write
  verbose: Write
  fatal: Write
}

const LEVEL: Record<keyof Log, LogLevel> = {
  log: 'info',
  error: 'error',
  warn: 'warn',
  debug: 'debug',
  verbose: 'debug',
  fatal: 'fatal',
}

/** LOGGING_ENGINE=legacy: Nest's own logger, as `new Logger(Class.name)` would. */
function toNest(method: keyof Log, message: unknown, params: unknown[]): void {
  const { Logger } = require('@nestjs/common')
  const context = callerOf(new Error().stack)?.logger
  const logger = context ? new Logger(context) : new Logger()
  // `fatal` came in Nest 10.2
  ;(logger[method] ?? logger.error).call(logger, message, ...params)
}

function write(method: keyof Log, message: unknown, params: unknown[]): void {
  if (process.env.LOGGING_ENGINE === 'legacy') toNest(method, message, params)
  else getLogger().fromLog(LEVEL[method], message, params)
}

/**
 * `new Logger(Class.name)` without declaring it: each line goes under the
 * class that called (`log.logger`) and says where (`log.origin.*`). Takes
 * what Nest's Logger takes, except that a trailing string is a value, never
 * the context.
 */
export const log: Log = {
  log: (message, ...params) => write('log', message, params),
  error: (message, ...params) => write('error', message, params),
  warn: (message, ...params) => write('warn', message, params),
  debug: (message, ...params) => write('debug', message, params),
  verbose: (message, ...params) => write('verbose', message, params),
  fatal: (message, ...params) => write('fatal', message, params),
}
