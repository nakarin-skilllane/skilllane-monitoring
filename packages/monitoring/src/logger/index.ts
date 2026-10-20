import { serviceIdentity } from '../otel/identity'
import { AppLogger, type LoggerConfig } from './app-logger'

export * from './app-logger'
export * from './args-parser'
export * from './context'
export * from './pretty'
export * from './redact'
export * from './sink'
export * from './writer'

let current: AppLogger | undefined
let currentConfig: LoggerConfig | undefined

/** Creates the process-wide logger that integrations write through. */
export function configureLogger(config: LoggerConfig): AppLogger {
  current = new AppLogger(config)
  currentConfig = config
  return current
}

function envConfig(): LoggerConfig {
  return {
    service: process.env.OTEL_SERVICE_NAME || serviceIdentity().name,
    role: process.env.APP_ROLE,
    level: (process.env.LOG_LEVEL as LoggerConfig['level']) ?? 'info',
    pretty: process.env.LOG_PRETTY === 'true',
  }
}

/**
 * The configured logger. Before configuration (very early boot) a default
 * logger is created from the environment so that nothing is lost.
 */
export function getLogger(): AppLogger {
  current ??= configureLogger(envConfig())
  return current
}

/** Changes some settings of the current logger and keeps the rest. */
export function reconfigureLogger(changes: Partial<LoggerConfig>): AppLogger {
  return configureLogger({ ...(currentConfig ?? envConfig()), ...changes })
}
export * from './usecase'
