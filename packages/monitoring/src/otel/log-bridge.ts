import { context } from '@opentelemetry/api'
import {
  type AnyValue,
  type LogAttributes,
  type Logger,
  type LogRecord,
  SeverityNumber,
} from '@opentelemetry/api-logs'
import type { RecordSink } from '../logger/sink'
import type { LogLevel } from '../types'

const SEVERITY: Record<LogLevel, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
}

/**
 * Carried by the LogRecord itself (body, time, severity, trace context) or
 * by the resource (service.name without the role): not repeated as
 * attributes.
 */
const NOT_ATTRIBUTES = new Set([
  '@timestamp',
  'log.level',
  'message',
  'trace.id',
  'span.id',
  'service.name',
  'service.version',
  'service.environment',
])

function attributeValue(value: unknown): AnyValue | undefined {
  if (value === undefined || value === null) return undefined
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' || typeof item === 'number')
  ) {
    return value as AnyValue
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * One stdout record → one OTel LogRecord. The record is already redacted,
 * so what leaves the process is exactly what stdout shows. `labels` become
 * `labels.<key>` attributes; field names are otherwise the ECS names of the
 * JSON line, so a Loki query reads like the JSON.
 */
export function toLogRecord(
  record: Record<string, unknown>,
  level: LogLevel,
): LogRecord {
  const attributes: LogAttributes = {}
  for (const [key, value] of Object.entries(record)) {
    if (NOT_ATTRIBUTES.has(key)) continue
    if (key === 'labels' && value && typeof value === 'object') {
      for (const [label, labelValue] of Object.entries(value)) {
        const converted = attributeValue(labelValue)
        if (converted !== undefined) attributes[`labels.${label}`] = converted
      }
      continue
    }
    const converted = attributeValue(value)
    if (converted !== undefined) attributes[key] = converted
  }
  const time = Date.parse(String(record['@timestamp']))
  return {
    timestamp: Number.isFinite(time) ? time : Date.now(),
    severityNumber: SEVERITY[level],
    severityText: level.toUpperCase(),
    body: String(record.message ?? ''),
    attributes,
    // The active span at the time of the log call: trace_id / span_id.
    context: context.active(),
  }
}

export function createLogBridge(otelLogger: Logger): RecordSink {
  return (record, level) => {
    otelLogger.emit(toLogRecord(record, level))
  }
}
