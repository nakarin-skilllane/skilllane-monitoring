export type InflightKind = 'http' | 'job' | 'msg' | 'task'

/** What is stored per unit of work. Never personal data. */
export interface InflightEntry {
  kind: InflightKind
  /** bullmq / kafka / rabbitmq / cron / task; `msg` alone cannot tell. */
  source?: string
  /** Route, queue or task name. */
  type: string
  started_at: string
  trace_id?: string
  user_id?: string
  method?: string
  path?: string
  queue?: string
  job_id?: string
}

export function describeEntry(entry: InflightEntry): string {
  if (entry.kind === 'http')
    return `http:${entry.method ?? ''} ${entry.path ?? entry.type}`.trim()
  if (entry.job_id) return `${entry.kind}:${entry.type}#${entry.job_id}`
  return `${entry.kind}:${entry.type}`
}
