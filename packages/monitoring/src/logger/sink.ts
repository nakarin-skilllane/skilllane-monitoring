import type { LogLevel } from '../types'

/**
 * Receives every record after redaction, next to stdout. registerTelemetry
 * sets it to the OTel log bridge; without OTel nothing is set.
 */
export type RecordSink = (
  record: Record<string, unknown>,
  level: LogLevel,
) => void

let sink: RecordSink | undefined

export function setRecordSink(next: RecordSink | undefined): void {
  sink = next
}

export function recordSink(): RecordSink | undefined {
  return sink
}
