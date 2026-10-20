import pino from 'pino'
import type { LogLevel } from '../types'
import { formatPretty, type PrettyOptions, type PrettyStack } from './pretty'

export type LineWriter = (
  record: Record<string, unknown>,
  level: LogLevel,
) => void

/** JSON that never throws: circular references and BigInt become strings. */
export function safeJson(record: Record<string, unknown>): string {
  try {
    return JSON.stringify(record)
  } catch {
    const seen = new WeakSet<object>()
    return JSON.stringify(record, (_key, value) => {
      if (typeof value === 'bigint') return value.toString()
      if (value && typeof value === 'object') {
        if (seen.has(value)) return '[Circular]'
        seen.add(value)
      }
      return value
    })
  }
}

/**
 * Production writer: one JSON object per line on stdout. The record is
 * already complete, so it is serialized as is; pino's synchronous
 * destination writes it, so the last lines survive a crash. (pino's own
 * serializer with an empty level formatter wrote `{,"@timestamp"…`.)
 */
export function createJsonWriter(dest: number | string = 1): LineWriter {
  const destination = pino.destination({ dest, sync: true })
  return (record) => {
    destination.write(`${safeJson(record)}\n`)
  }
}

export interface PrettyWriterOptions extends PrettyOptions {
  stream?: NodeJS.WriteStream
}

function envStack(): PrettyStack {
  const value = process.env.LOG_STACK
  return value === 'app' || value === 'full' ? value : 'off'
}

/**
 * LOG_PRETTY=true. Colours only on a TTY without NO_COLOR. A multi-line entry
 * is separated from its neighbours by one blank line.
 */
export function createPrettyWriter(
  options: PrettyWriterOptions = {},
): LineWriter {
  const stream = options.stream ?? process.stdout
  const format: PrettyOptions = {
    color: options.color ?? (Boolean(stream.isTTY) && !process.env.NO_COLOR),
    stack: options.stack ?? envStack(),
    trace:
      options.trace ??
      (process.env.LOG_PRETTY_TRACE === 'warn' ? 'warn' : 'all'),
  }
  let wrote = false
  let previousMultiLine = false
  return (record) => {
    const text = formatPretty(record, format)
    const multiLine = text.includes('\n')
    const gap = wrote && (multiLine || previousMultiLine) ? '\n' : ''
    stream.write(`${gap}${text}\n`)
    wrote = true
    previousMultiLine = multiLine
  }
}
