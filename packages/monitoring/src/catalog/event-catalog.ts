import type { LogLevel } from '../types'

export interface EventDefinition {
  /** Default level; `http.request` derives its level from the status code. */
  level: LogLevel
  /** Constant English message used when the caller gives none. */
  message: string
  /** Long headline with values; kept for callers that render it. */
  template: string
  /**
   * Short lower-case title of the pretty format (values go in key=value).
   * `{field}` is replaced by the value.
   */
  title: string
}

/**
 * Every `event.code` a log line may carry. Add a code only when an alert,
 * dashboard or cross-service search needs it.
 */
export const EVENT_CATALOG = {
  'app.started': {
    level: 'info',
    message: 'Application started',
    template: 'Started in {duration_ms}ms',
    title: 'app started',
  },
  'app.boot_failed': {
    level: 'fatal',
    message: 'Application failed to boot',
    template: 'Boot failed: {error.message}',
    title: 'boot failed',
  },
  'app.shutdown': {
    level: 'info',
    message: 'Application shutting down',
    template: 'Shutting down on {signal}',
    title: 'shutting down',
  },
  'app.uncaught_exception': {
    level: 'fatal',
    message: 'Uncaught exception',
    template: 'Uncaught exception: {error.message}',
    title: 'uncaught exception',
  },
  'app.unhandled_rejection': {
    level: 'fatal',
    message: 'Unhandled promise rejection',
    template: 'Unhandled rejection: {error.message}',
    title: 'unhandled rejection',
  },
  'otel.not_started': {
    level: 'warn',
    message: 'OpenTelemetry is not started',
    template: 'OpenTelemetry provider is a no-op; trace.id will be empty',
    title: 'opentelemetry not started',
  },
  'http.request': {
    level: 'info',
    message: 'HTTP request',
    template:
      '{http.request.method} {url.path} → {http.response.status_code} in {duration_ms}ms',
    title: 'request completed',
  },
  'http.outbound_failed': {
    level: 'warn',
    message: 'Outbound HTTP request failed',
    template: '{dependency.name} {url.domain} failed: {error.message}',
    title: 'outbound request failed',
  },
  'dependency.down': {
    level: 'error',
    message: 'Dependency is down',
    template: '{dependency.type} "{dependency.name}" is down',
    title: '{dependency.type} "{dependency.name}" is down',
  },
  'dependency.still_down': {
    level: 'warn',
    message: 'Dependency is still down',
    template:
      '{dependency.type} "{dependency.name}" still down (attempt {dependency.attempt})',
    title: '{dependency.type} "{dependency.name}" still down',
  },
  // `reason`: `connected` (first connect of the process, title
  // '<type> "<name>" connected') or `recovered` (after dependency.down).
  'dependency.up': {
    level: 'info',
    message: 'Dependency is back up',
    template: '{dependency.type} "{dependency.name}" is back up',
    title: '{dependency.type} "{dependency.name}" is back',
  },
  'job.started': {
    level: 'info',
    message: 'Job started',
    template: '{job.queue} {job.type} #{job.id} started',
    title: 'job started',
  },
  'job.finished': {
    level: 'info',
    message: 'Job finished',
    template: '{job.queue} {job.type} #{job.id} finished in {duration_ms}ms',
    title: 'job finished',
  },
  'job.retry': {
    level: 'warn',
    message: 'Job failed and will be retried',
    template:
      '{job.queue} {job.type} #{job.id} failed, retry {job.attempt}/{job.max_attempts}',
    title: 'job will retry',
  },
  'job.failed': {
    level: 'error',
    message: 'Job failed',
    template: '{job.queue} {job.type} #{job.id} failed',
    title: 'job failed',
  },
  'job.stalled': {
    level: 'error',
    message: 'Job stalled',
    template: '{job.queue} #{job.id} stalled; its worker stopped responding',
    title: 'job stalled',
  },
  'job.redelivered': {
    level: 'warn',
    message: 'Message redelivered',
    template: '{job.queue} message redelivered',
    title: 'message redelivered',
  },
  'consumer.rebalancing': {
    level: 'warn',
    message: 'Kafka consumer group is rebalancing',
    template: 'Consumer group rebalancing',
    title: 'consumer group rebalancing',
  },
  'consumer.joined': {
    level: 'info',
    message: 'Kafka consumer joined group',
    template: 'Consumer joined group',
    title: 'consumer joined group',
  },
  'consumer.crashed': {
    level: 'error',
    message: 'Kafka consumer crashed',
    template: 'Consumer crashed: {error.message}',
    title: 'consumer crashed',
  },
  'message.dead_lettered': {
    level: 'error',
    message: 'Message moved to dead-letter queue',
    template: '{job.queue} message moved to {dlq}',
    title: 'message moved to dlq',
  },
  'auth.rejected': {
    level: 'warn',
    message: 'Authentication rejected',
    template: '{url.path} rejected: {reason}',
    title: 'authentication rejected',
  },
  'app.log': {
    level: 'info',
    message: '',
    template: '{message}',
    title: '{message}',
  },
} as const satisfies Record<string, EventDefinition>

export type EventCode = keyof typeof EVENT_CATALOG

export const DEFAULT_EVENT: EventCode = 'app.log'

export function isEventCode(value: unknown): value is EventCode {
  return typeof value === 'string' && value in EVENT_CATALOG
}

export function getEventDefinition(code: EventCode): EventDefinition {
  return EVENT_CATALOG[code]
}
