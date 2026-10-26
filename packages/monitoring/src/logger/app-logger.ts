import type { LoggerService } from '@nestjs/common'
import {
  DEFAULT_EVENT,
  type EventCode,
  getEventDefinition,
  isEventCode,
} from '../catalog'
import { type HintVars, lookupHint } from '../errors/hints'
import { serializeError } from '../errors/error-serializer'
import {
  type DependencyType,
  LEVEL_WEIGHT,
  type LogLevel,
  type LogOptions,
} from '../types'
import { parseArgs } from './args-parser'
import {
  contextFields,
  currentScope,
  ELAPSED_MS,
  defaultRequestUser,
  type RequestUserResolver,
} from './context'
import { serviceIdentity } from '../otel/identity'
import { canHold, holdLine } from './held-lines'
import { redactRecord, stripQuery } from './redact'
import { recordSink } from './sink'
import { createJsonWriter, createPrettyWriter, type LineWriter } from './writer'

export interface LoggerConfig {
  /** e.g. 'school-core-api'. */
  service: string
  /** APP_ROLE; appended as service.name = `${service}/${role}`. */
  role?: string
  /** service.version; default SERVICE_VERSION / npm_package_version / package.json. */
  version?: string
  /** service.environment; default OTEL_ENV, then NODE_ENV. */
  environment?: string
  level?: LogLevel
  pretty?: boolean
  hostName?: string
  /** Show warnings about unknown events and dropped fields. */
  devWarnings?: boolean
  resolveUser?: RequestUserResolver
  maxMessageLength?: number
  maxStackLength?: number
  /** Replaces stdout; for tests. */
  writer?: LineWriter
}

/** A line written by the library itself (integrations, middleware). */
export interface EventInput {
  event: EventCode
  logger: string
  level?: LogLevel
  message?: string
  fields?: Record<string, unknown>
  error?: unknown
  /** Values for dependency hint placeholders. */
  hintVars?: HintVars
}

const DEFAULT_MAX_MESSAGE = 2_000
const DEFAULT_MAX_STACK = 8_000

function truncate(value: unknown, max: number): unknown {
  return typeof value === 'string' && value.length > max
    ? `${value.slice(0, max)}…[truncated ${value.length - max} chars]`
    : value
}

/**
 * The NestJS LoggerService behind every log line. Each step of the pipeline
 * is guarded: a failure skips that step and the line is still written.
 */
export class AppLogger implements LoggerService {
  private readonly serviceName: string
  private readonly serviceVersion?: string
  private readonly serviceEnvironment?: string
  private readonly hostName?: string
  private readonly minWeight: number
  private readonly write: LineWriter
  private readonly resolveUser: RequestUserResolver
  private readonly devWarnings: boolean
  private readonly maxMessage: number
  private readonly maxStack: number
  private readonly warned = new Set<string>()

  constructor(config: LoggerConfig) {
    this.serviceName = config.role
      ? `${config.service}/${config.role}`
      : config.service
    const identity = serviceIdentity()
    this.serviceVersion = config.version ?? identity.version
    this.serviceEnvironment = config.environment ?? identity.environment
    this.hostName = config.hostName ?? process.env.HOSTNAME
    this.minWeight = LEVEL_WEIGHT[config.level ?? 'info']
    this.write =
      config.writer ??
      (config.pretty ? createPrettyWriter() : createJsonWriter())
    this.resolveUser = config.resolveUser ?? defaultRequestUser
    this.devWarnings = config.devWarnings ?? false
    this.maxMessage = config.maxMessageLength ?? DEFAULT_MAX_MESSAGE
    this.maxStack = config.maxStackLength ?? DEFAULT_MAX_STACK
  }

  // ---- LoggerService -------------------------------------------------------

  log(message: unknown, ...params: unknown[]): void {
    this.fromCall('info', message, params)
  }

  error(message: unknown, ...params: unknown[]): void {
    this.fromCall('error', message, params)
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.fromCall('warn', message, params)
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.fromCall('debug', message, params)
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.fromCall('debug', message, params)
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.fromCall('fatal', message, params)
  }

  // ---- Library events ------------------------------------------------------

  isLevelEnabled(level: LogLevel): boolean {
    return LEVEL_WEIGHT[level] >= this.minWeight
  }

  event(input: EventInput): void {
    const level = input.level ?? getEventDefinition(input.event).level
    if (!this.isLevelEnabled(level)) return
    this.emit({
      level,
      event: input.event,
      logger: input.logger,
      message: input.message,
      error: input.error,
      fields: input.fields ?? {},
      labels: {},
      options: {},
      hintVars: input.hintVars,
    })
  }

  // ---- Pipeline ------------------------------------------------------------

  private fromCall(level: LogLevel, message: unknown, params: unknown[]) {
    if (!this.isLevelEnabled(level)) return
    let parsed: ReturnType<typeof parseArgs>
    try {
      parsed = parseArgs(message, params)
    } catch {
      parsed = { message: String(message), options: {}, fields: {}, labels: {} }
    }
    let event: EventCode = DEFAULT_EVENT
    if (parsed.options.event !== undefined) {
      if (isEventCode(parsed.options.event)) event = parsed.options.event
      else
        this.devWarn(
          `unknown-event:${parsed.options.event}`,
          'Unknown event code; logged as app.log',
          {
            reason: String(parsed.options.event),
          },
        )
    }
    this.emit({
      level,
      event,
      logger: parsed.context ?? 'App',
      message: parsed.message,
      error: parsed.error,
      fields: parsed.fields,
      labels: parsed.labels,
      options: parsed.options,
    })
  }

  private emit(input: {
    level: LogLevel
    event: EventCode
    logger: string
    message?: string
    error?: unknown
    fields: Record<string, unknown>
    labels: Record<string, string>
    options: LogOptions
    hintVars?: HintVars
  }) {
    let level = input.level
    const record: Record<string, unknown> = {
      '@timestamp': new Date().toISOString(),
      'log.level': level,
      'service.name': this.serviceName,
      'service.version': this.serviceVersion,
      'service.environment': this.serviceEnvironment,
      'log.logger': input.logger,
      'event.code': input.event,
      message: input.message || getEventDefinition(input.event).message,
    }

    try {
      const context = contextFields(this.resolveUser)
      const contextLabels = context.labels as Record<string, string> | undefined
      delete context.labels
      Object.assign(record, context)
      const labels = { ...contextLabels, ...input.labels }
      if (Object.keys(labels).length) record.labels = labels
    } catch {
      // context is optional
    }
    if (this.hostName) record['host.name'] = this.hostName
    Object.assign(record, input.fields)

    // A pattern's warn inside an HTTP request waits for the response status.
    let waitForStatus = false
    try {
      const decided = this.applyError(record, input, level)
      level = decided.level
      waitForStatus = decided.downgraded
    } catch {
      // keep the line without error details
    }
    record['log.level'] = level
    let scope: ReturnType<typeof currentScope>
    try {
      scope = currentScope()
    } catch {
      scope = undefined
    }
    const hold = waitForStatus && canHold(scope)
    // A held line may still become error, so its level is checked on release.
    if (!hold && !this.isLevelEnabled(level)) return
    // No context given (e.g. the exception filter): name the class that failed.
    const originFunction = record['log.origin.function']
    if (record['log.logger'] === 'App' && typeof originFunction === 'string') {
      record['log.logger'] = originFunction.split('.')[0]
    }
    if (!record.message && record['error.message']) {
      record.message = record['error.message']
    }

    try {
      const dropped = redactRecord(record)
      if (dropped.length) {
        this.devWarn(
          `dropped:${dropped.join(',')}`,
          'Fields outside the log spec were dropped',
          {
            reason: dropped.join(', '),
          },
        )
      }
    } catch {
      record.message = '[redaction failed]'
      delete record['error.message']
      delete record['error.stack_trace']
    }

    record.message = truncate(record.message, this.maxMessage)
    record['error.stack_trace'] = truncate(
      record['error.stack_trace'],
      this.maxStack,
    )
    for (const key of Object.keys(record)) {
      if (record[key] === undefined) delete record[key]
    }
    try {
      if (scope && record.duration_ms === undefined) {
        ;(record as Record<symbol, unknown>)[ELAPSED_MS] =
          Date.now() - scope.startedAt
      }
    } catch {
      // elapsed time is optional
    }

    if (hold && canHold(scope)) {
      holdLine(scope, {
        record,
        level,
        write: (held, final) => this.output(held, final),
      })
      return
    }
    this.output(record, level)
  }

  /** stdout, then the exporter; `level` may differ from the one first decided. */
  private output(record: Record<string, unknown>, level: LogLevel): void {
    if (!this.isLevelEnabled(level)) return
    record['log.level'] = level
    try {
      this.write(record, level)
    } catch {
      try {
        process.stdout.write(`${JSON.stringify(record)}\n`)
      } catch {
        // nothing left to try
      }
    }
    // The exporter gets the same redacted record stdout got. It only
    // enqueues; a failure here never reaches the caller.
    try {
      recordSink()?.(record, level)
    } catch {
      // stdout already has the line
    }
  }

  private applyError(
    record: Record<string, unknown>,
    input: {
      event: EventCode
      error?: unknown
      options: LogOptions
      hintVars?: HintVars
    },
    level: LogLevel,
  ): { level: LogLevel; downgraded: boolean } {
    const kept = { level, downgraded: false }
    const { options } = input
    const error =
      input.error !== undefined ? serializeError(input.error) : undefined

    if (error) {
      record['error.type'] = error.type
      record['error.message'] = error.message
      record['error.code'] = options.code ?? error.code
      record['error.stack_trace'] = error.stack
      record['log.origin.function'] = error.origin?.function
      record['log.origin.file.name'] = error.origin?.file
      record['error.cause'] = error.cause
      this.applyWhere(record, input.event, error.usecase)
      if (error.dependency && record['dependency.type'] === undefined) {
        record['dependency.type'] = error.dependency
      }
      if (error.domain && record['url.domain'] === undefined) {
        record['url.domain'] = error.domain
      }
      if (error.status && record['http.response.status_code'] === undefined) {
        record['http.response.status_code'] = error.status
      }
    } else if (options.code) {
      record['error.code'] = options.code
    }
    if (options.reason) record.reason = options.reason

    const devHint = options.hint ?? error?.hint
    if (devHint) {
      record['error.hint'] = devHint
      record['error.hint_detail'] = options.hintDetail ?? error?.hintDetail
      dropTypeAsCode(record)
      return kept
    }
    if (!error && !options.code) return kept

    const resolved = lookupHint(
      {
        code: record['error.code'] as string | undefined,
        dependency: record['dependency.type'] as DependencyType | undefined,
        message: error?.message,
        error: input.error,
      },
      {
        name: record['dependency.name'] as string | undefined,
        host: record['dependency.host'] as string | undefined,
        port: record['dependency.port'] as number | undefined,
        ...input.hintVars,
      },
    )
    if (!resolved) {
      dropTypeAsCode(record)
      return kept
    }
    record['error.hint'] = resolved.hint
    record['error.hint_detail'] = resolved.hintDetail
    record['error.fix'] = resolved.fix
    // lookupHint names the error only when its key should replace what is there.
    if (resolved.code) record['error.code'] = resolved.code
    // `TypeError [TypeError]` says nothing; the matched pattern names it.
    if (record['error.code'] === record['error.type']) {
      record['error.code'] =
        resolved.key !== record['error.type'] ? resolved.key : undefined
    }
    addLabels(record, {
      error_category: resolved.category,
      error_target: resolved.target,
    })
    // A plain error line about a caller mistake (4xx, duplicate) is a
    // warning, unless it made the request answer 5xx: inside a request the
    // line waits for the status (see held-lines.ts).
    if (
      input.event === 'app.log' &&
      level === 'error' &&
      resolved.level === 'warn'
    ) {
      return { level: 'warn', downgraded: true }
    }
    return kept
  }

  /**
   * Where the error happened, beyond the stack: the use case it escaped from,
   * the request it served, and the outgoing call that failed before it.
   */
  private applyWhere(
    record: Record<string, unknown>,
    event: EventCode,
    usecase: string | undefined,
  ): void {
    const scope = currentScope()
    addLabels(record, {
      // The filter runs after the use case ended; the error carries its name.
      usecase,
      failed_step: scope?.failedStep?.name,
    })
    const req = scope?.req
    if (!req || event === 'http.request') return
    record['http.request.method'] ??= req.method
    record['http.route'] ??= req.route?.path
    record['url.path'] ??= stripQuery(req.originalUrl ?? req.url ?? '')
  }

  private devWarn(
    key: string,
    message: string,
    fields: Record<string, unknown>,
  ) {
    if (!this.devWarnings || this.warned.has(key)) return
    this.warned.add(key)
    this.emit({
      level: 'warn',
      event: 'app.log',
      logger: 'skilllane-monitoring',
      message,
      fields,
      labels: {},
      options: {},
    })
  }
}

function addLabels(
  record: Record<string, unknown>,
  values: Record<string, string | undefined>,
): void {
  const entries = Object.entries(values).filter(([, value]) => value)
  if (!entries.length) return
  record.labels = {
    ...(record.labels as Record<string, string> | undefined),
    ...Object.fromEntries(entries),
  }
}

/** A code equal to the class name (generic adapter) repeats error.type. */
function dropTypeAsCode(record: Record<string, unknown>): void {
  if (record['error.code'] === record['error.type']) {
    record['error.code'] = undefined
  }
}
