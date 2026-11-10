import type { LogLevel } from '../types'

/**
 * Receives every record after redaction, next to stdout. registerTelemetry
 * sets it to the OTel log bridge; without OTel nothing is set. `json` is the
 * line stdout got, when stdout got JSON: the sink can send it instead of
 * serializing the record again.
 */
export type RecordSink = (
  record: Record<string, unknown>,
  level: LogLevel,
  json?: string,
) => void

let sink: RecordSink | undefined

export function setRecordSink(next: RecordSink | undefined): void {
  sink = next
}

export function recordSink(): RecordSink | undefined {
  return sink
}
