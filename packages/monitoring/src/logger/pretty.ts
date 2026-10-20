import { getEventDefinition, isEventCode, renderTemplate } from '../catalog'
import { originOf, sourcePath } from '../errors/origin'
import type { LogLevel } from '../types'
import { ELAPSED_MS } from './context'

export type PrettyStack = 'off' | 'app' | 'full'
export type PrettyTrace = 'all' | 'warn'

export interface PrettyOptions {
  color?: boolean
  /** LOG_STACK: off (default), app = our frames only, full. */
  stack?: PrettyStack
  /** LOG_PRETTY_TRACE: all (default) or warn = trace line from WRN up. */
  trace?: PrettyTrace
}

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
  fatal: 'FTL',
}

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  fatal: '\x1b[31m',
}
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

/** The longest role name; every service/role column gets this width. */
const LONGEST_ROLE = 'persister'
const TITLE_WIDTH = 28
const INDENT = '    '
const LABEL_WIDTH = 14
const MAX_APP_FRAMES = 5

type Record_ = Record<string, unknown>

function time(timestamp: string): string {
  const date = new Date(timestamp)
  const pad = (n: number, size = 2) => String(n).padStart(size, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

/** < 1000 ms → "84ms", otherwise "1.2s". */
export function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

/** Lower-cases the first letter, but not an acronym ("ORDER BY …"). */
function lowerFirst(text: string): string {
  if (/^[A-Z][A-Z]/.test(text)) return text
  return text.charAt(0).toLowerCase() + text.slice(1)
}

function title(record: Record_): string {
  if (record['error.hint']) return lowerFirst(String(record['error.hint']))
  const code = record['event.code']
  if (isEventCode(code)) {
    if (code === 'http.request' && record.reason === 'client_closed') {
      return 'request aborted'
    }
    if (code === 'dependency.up' && record.reason === 'connected') {
      return lowerFirst(
        renderTemplate(
          '{dependency.type} "{dependency.name}" connected',
          record,
        ),
      )
    }
    const text = renderTemplate(getEventDefinition(code).title, record)
    if (text && text !== '?') return lowerFirst(text.split('\n')[0])
  }
  return lowerFirst(String(record.message ?? '').split('\n')[0])
}

function labelsOf(record: Record_): Record<string, string> {
  return (record.labels as Record<string, string> | undefined) ?? {}
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ''
}

function target(record: Record_): string | undefined {
  const labels = labelsOf(record)
  if (labels.error_target) return labels.error_target
  const host = record['dependency.host']
  if (present(host)) {
    const port = record['dependency.port']
    return present(port) ? `${host}:${port}` : String(host)
  }
  return present(record['url.domain'])
    ? String(record['url.domain'])
    : undefined
}

/** Kafka and RabbitMQ name the topic/queue; BullMQ and tasks name the job. */
function jobName(record: Record_): unknown {
  const source = record['event.module']
  if (source === 'kafka' || source === 'rabbitmq') return record['job.queue']
  return record['job.type'] ?? record['job.queue']
}

function duration(record: Record_): string | undefined {
  const ms = record.duration_ms ?? (record as any)[ELAPSED_MS]
  return typeof ms === 'number' && Number.isFinite(ms)
    ? formatDuration(ms)
    : undefined
}

/**
 * method path status │ source job id attempt │ file │ target │ others │
 * duration — only those with a value.
 */
function keyValues(record: Record_): string {
  const attempt = present(record['job.attempt'])
    ? present(record['job.max_attempts'])
      ? `${record['job.attempt']}/${record['job.max_attempts']}`
      : String(record['job.attempt'])
    : undefined
  const affects = Array.isArray(record['dependency.affects'])
    ? (record['dependency.affects'] as string[]).join(',')
    : undefined
  const pairs: [string, unknown][] = [
    ['method', record['http.request.method']],
    // The route has no ids in it; the raw path only when nothing matched.
    ['path', record['http.route'] ?? record['url.path']],
    ['status', record['http.response.status_code']],
    ['source', record['event.module']],
    ['job', jobName(record)],
    ['id', record['job.id']],
    ['attempt', attempt],
    ['file', record['log.origin.file.name']],
    ['target', target(record)],
    ['reason', record.reason],
    ['dlq', record.dlq],
    ['affects', affects || undefined],
    ['retry', record['dependency.attempt']],
    ['port', record['server.port']],
    ['duration', duration(record)],
  ]
  return pairs
    .filter(([, value]) => present(value))
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
}

function actualError(record: Record_): string | undefined {
  if (!present(record['error.message'])) return undefined
  const type = record['error.type'] ?? 'Error'
  const message = String(record['error.message']).replace(/\s*\n\s*/g, ' ')
  return present(record['error.code'])
    ? `${type} [${record['error.code']}] ${message}`
    : `${type}: ${message}`
}

/** `at Class.method (src/…/file.ts)`: our frames, no line numbers. */
function appFrames(stack: string): string[] {
  const frames: string[] = []
  for (const line of stack.split('\n').slice(1)) {
    const origin = originOf(`x\n${line}`)
    if (!origin?.file) continue
    frames.push(
      origin.function
        ? `at ${origin.function} (${origin.file})`
        : `at ${origin.file}`,
    )
    if (frames.length === MAX_APP_FRAMES) break
  }
  return frames
}

function stackLines(record: Record_, mode: PrettyStack): string[] {
  const stack = record['error.stack_trace']
  if (mode === 'off' || typeof stack !== 'string') return []
  const frames =
    mode === 'app'
      ? appFrames(stack)
      : stack
          .split('\n')
          .slice(1)
          .map((line) =>
            line
              .trim()
              .replace(/\((\/[^)]*)\)$/, (_, file) => `(${sourcePath(file)})`),
          )
          .filter(Boolean)
  return frames
}

/**
 * The LOG_PRETTY=true format:
 *
 *   <time> <LVL> <service/role>  <title>  <key=value …> duration=…
 *       error detail: <what to do>
 *       actual error: <the error>
 *       trace id:     <trace id>  user id: <user id>
 */
export function formatPretty(
  record: Record_,
  options: PrettyOptions = {},
): string {
  const level = (record['log.level'] as LogLevel) ?? 'info'
  const color = options.color ?? false
  const paint = (text: string, code: string) =>
    color ? `${code}${text}${RESET}` : text
  const label = (text: string) => paint(text.padEnd(LABEL_WIDTH), DIM)

  const service = String(record['service.name'] ?? '')
  const serviceWidth = service.split('/')[0].length + 1 + LONGEST_ROLE.length
  const head = title(record)
  const kv = keyValues(record)
  const first = [
    time(String(record['@timestamp'])),
    paint(LEVEL_LABEL[level] ?? level.toUpperCase(), COLORS[level] ?? ''),
    `${service.padEnd(serviceWidth)}  ${kv ? head.padEnd(TITLE_WIDTH - 1) : head}${kv ? ` ${kv}` : ''}`,
  ].join(' ')

  const lines = [first.trimEnd()]
  const detail = record['error.fix'] ?? record['error.hint_detail']
  if (present(detail)) {
    lines.push(`${INDENT}${label('error detail:')}${detail}`)
  }
  const actual = actualError(record)
  if (actual) lines.push(`${INDENT}${label('actual error:')}${actual}`)

  const frames = stackLines(record, options.stack ?? 'off')
  frames.forEach((frame, index) => {
    lines.push(
      `${INDENT}${index === 0 ? label('stack:') : ' '.repeat(LABEL_WIDTH)}${frame}`,
    )
  })

  const traceFromWarn = options.trace === 'warn'
  const showTrace = !traceFromWarn || !(level === 'info' || level === 'debug')
  const traceId = record['trace.id']
  const userId = record['user.id']
  if (showTrace && (present(traceId) || present(userId))) {
    const parts = [
      present(traceId)
        ? `${label('trace id:')}${paint(String(traceId), DIM)}`
        : '',
      present(userId)
        ? present(traceId)
          ? `  user id: ${userId}`
          : `${label('user id:')}${userId}`
        : '',
    ]
    lines.push(`${INDENT}${parts.join('')}`)
  }
  return lines.join('\n')
}
