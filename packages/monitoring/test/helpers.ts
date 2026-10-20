import { AppLogger, type LoggerConfig } from '../src/logger/app-logger'
import { configureLogger } from '../src/logger'

export type Line = Record<string, any>

/** A logger that collects records instead of writing to stdout. */
export function captureLogger(config: Partial<LoggerConfig> = {}): {
  logger: AppLogger
  lines: Line[]
} {
  const lines: Line[] = []
  const logger = configureLogger({
    service: 'test-api',
    level: 'debug',
    writer: (record) => lines.push({ ...record }),
    ...config,
  })
  return { logger, lines }
}

export function lastLine(lines: Line[]): Line {
  return lines[lines.length - 1]
}
