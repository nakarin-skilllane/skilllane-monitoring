export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

export const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
}

/** Which system a unit of work or dependency line belongs to (`event.module`). */
export type JobSource = 'bullmq' | 'kafka' | 'rabbitmq' | 'cron' | 'task'

export type DependencyType =
  | 'redis'
  | 'oracle'
  | 'kafka'
  | 'rabbitmq'
  | 'smtp'
  | 'http'
  | 's3'
  | 'google'

/** Options a developer may pass as the second argument of a log call. */
export interface LogOptions {
  event?: string
  code?: string
  hint?: string
  hintDetail?: string
  reason?: string
}

/**
 * One log line before formatting. Keys are the ECS field names from the spec,
 * written flat with dots; a key that has no value is left out entirely.
 */
export type LogRecord = Record<string, unknown> & {
  '@timestamp': string
  'log.level': LogLevel
  'log.logger': string
  'service.name': string
  'event.code': string
  message: string
}

/** Every field a record may carry. Anything else is dropped by redact. */
export const ALLOWED_FIELDS = new Set<string>([
  '@timestamp',
  'log.level',
  'log.logger',
  'service.name',
  'service.version',
  'service.environment',
  'event.code',
  'event.module',
  'message',
  'trace.id',
  'span.id',
  'user.id',
  'user.roles',
  'organization.id',
  'host.name',
  'server.port',
  'duration_ms',
  'error.type',
  'error.message',
  'error.code',
  'error.hint',
  'error.hint_detail',
  'error.fix',
  'log.origin.function',
  'log.origin.file.name',
  'error.stack_trace',
  'error.cause',
  'http.request.method',
  'url.path',
  'url.domain',
  'http.response.status_code',
  'http.request.id',
  'http.route',
  'db.statement',
  'dependency.type',
  'dependency.name',
  'dependency.host',
  'dependency.port',
  'dependency.attempt',
  'dependency.affects',
  'job.queue',
  'job.type',
  'job.id',
  'job.attempt',
  'job.max_attempts',
  'job.final',
  'job.inflight',
  'job.started_at',
  'reason',
  'dlq',
  'signal',
  'partitions',
  'labels',
])

export const MAX_LABELS = 10
