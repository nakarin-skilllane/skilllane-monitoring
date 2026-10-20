import type { DependencyType } from '../types'
import {
  ALL_PATTERNS,
  type ErrorCategory,
  type ErrorPattern,
  type Explanation,
} from './patterns'
import { getSchema } from './schema'

export interface HintQuery {
  code?: string
  dependency?: DependencyType
  message?: string
  /** The raw error, for patterns that `explain` the specific case. */
  error?: unknown
}

/** Values for the dependency placeholders, taken from the log record. */
export interface HintVars {
  name?: string
  host?: string
  port?: number | string
  /** Env var names that configure the dependency, e.g. ['REDIS_HOST']. */
  configKeys?: string[]
}

export interface ResolvedHint {
  hint: string
  hintDetail: string
  /** Set when the pattern matched by message and the error had no code. */
  code?: string
  level?: 'warn' | 'error'
  retryable?: boolean
  /** The pattern that matched; replaces a code that only repeats error.type. */
  key: string
  category?: ErrorCategory
  /** What to fix, taken from the message: property, constraint, column. */
  target?: string
  /** One sentence about this specific case (`error.fix`). */
  fix?: string
}

const DEPENDENCY_LABEL: Record<DependencyType, string> = {
  redis: 'Redis',
  oracle: 'Oracle',
  kafka: 'Kafka',
  rabbitmq: 'RabbitMQ',
  smtp: 'SMTP',
  http: 'HTTP',
  s3: 'S3',
  google: 'Google',
}

function scopedKey(dependency: string | undefined, key: string): string {
  return `${dependency ?? '*'}|${key}`
}

const byKey = new Map<string, ErrorPattern>()
const byMessage: ErrorPattern[] = []
for (const pattern of ALL_PATTERNS) {
  byKey.set(scopedKey(pattern.dependency, pattern.key), pattern)
  if (pattern.messageMatch) byMessage.push(pattern)
}

/**
 * Finds the hint for an error: (dependency, code) first, then code alone,
 * then a message pattern. Returns undefined when nothing matches — a missing
 * hint is better than a wrong one.
 */
export function lookupHint(
  query: HintQuery,
  vars: HintVars = {},
): ResolvedHint | undefined {
  const pattern = findPattern(query)
  if (!pattern) return undefined
  const dependency = pattern.dependency ?? query.dependency
  const explained = explain(pattern, query)
  return {
    hint: fill(pattern.hint, dependency, vars),
    hintDetail: fill(pattern.hintDetail, dependency, vars),
    code: query.code ? undefined : pattern.key,
    level: pattern.level,
    retryable: pattern.retryable,
    key: pattern.key,
    category: categoryOf(pattern),
    target: explained?.target ?? targetOf(pattern, query.message),
    fix: explained?.fix,
  }
}

function explain(
  pattern: ErrorPattern,
  query: HintQuery,
): Explanation | undefined {
  if (!pattern.explain) return undefined
  try {
    return pattern.explain({
      message: query.message ?? '',
      error: query.error,
      schema: getSchema(),
    })
  } catch {
    // a broken explainer must not lose the hint
    return undefined
  }
}

function categoryOf(pattern: ErrorPattern): ErrorCategory | undefined {
  if (pattern.category) return pattern.category
  if (pattern.dependency) return 'dependency'
  return pattern.level === 'warn' ? 'input' : undefined
}

function targetOf(
  pattern: ErrorPattern,
  message: string | undefined,
): string | undefined {
  if (!pattern.target || !message) return undefined
  // First group that matched: a target regex may list alternative shapes.
  const value = message
    .match(pattern.target)
    ?.slice(1)
    .find((group) => group)
    ?.trim()
  return value ? value.slice(0, 120) : undefined
}

function findPattern(query: HintQuery): ErrorPattern | undefined {
  const { code, dependency, message } = query
  if (code) {
    const scoped = dependency
      ? byKey.get(scopedKey(dependency, code))
      : undefined
    const found = scoped ?? byKey.get(scopedKey(undefined, code))
    if (found) return found
  }
  if (!message) return undefined
  return byMessage.find(
    (pattern) =>
      (!pattern.dependency || pattern.dependency === dependency) &&
      pattern.messageMatch!.test(message),
  )
}

function fill(
  text: string,
  dependency: DependencyType | undefined,
  vars: HintVars,
): string {
  const address =
    vars.host !== undefined
      ? vars.port !== undefined
        ? `${vars.host}:${vars.port}`
        : vars.host
      : 'the configured address'
  return text
    .replace(/\{host\}:\{port\}/g, address)
    .replace(/\{host\}/g, vars.host ?? 'the configured host')
    .replace(/\{port\}/g, vars.port !== undefined ? String(vars.port) : '?')
    .replace(/\{Type\}/g, dependency ? DEPENDENCY_LABEL[dependency] : 'Service')
    .replace(/\{name\}/g, vars.name ?? dependency ?? 'service')
    .replace(
      /\{env\}/g,
      vars.configKeys?.length
        ? vars.configKeys.join('/')
        : 'its connection env vars',
    )
}
