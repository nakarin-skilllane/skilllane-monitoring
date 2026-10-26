import type { DependencyType } from '../types'
import {
  ALL_PATTERNS,
  type ErrorCategory,
  type ErrorPattern,
  type Explanation,
} from './patterns'
import { getProjectCatalog, type NormalizedCatalog } from './project-catalog'
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

interface PatternIndex {
  byKey: Map<string, ErrorPattern>
  byMessage: ErrorPattern[]
}

interface Match {
  pattern: ErrorPattern
  /** Matched by messageMatch, not by code. */
  byMessage: boolean
  /** From the app's own table. */
  project: boolean
}

/** A code an adapter made up from the HTTP status: an app's message pattern may name it better. */
const GENERIC_CODE = /^HTTP_\d{3}$/

/** Built-in patterns are scoped by dependency; an app's code matches whatever the dependency. */
function indexPatterns(
  patterns: readonly ErrorPattern[],
  scoped: boolean,
): PatternIndex {
  const index: PatternIndex = { byKey: new Map(), byMessage: [] }
  for (const pattern of patterns) {
    index.byKey.set(
      scopedKey(scoped ? pattern.dependency : undefined, pattern.key),
      pattern,
    )
    if (pattern.messageMatch) index.byMessage.push(pattern)
  }
  return index
}

const BUILTIN = indexPatterns(ALL_PATTERNS, true)
/** First built-in pattern per key, whatever its dependency: what an app entry with the same key inherits from. */
const BUILTIN_BY_KEY = new Map<string, ErrorPattern>()
for (const pattern of ALL_PATTERNS) {
  if (!BUILTIN_BY_KEY.has(pattern.key)) BUILTIN_BY_KEY.set(pattern.key, pattern)
}

/**
 * An app entry that overrides a built-in code replaces the words (hint, detail,
 * category, level) but keeps what the built-in pattern knows about the error:
 * its explain / target (error.fix, error_target) and retryable.
 */
function inherit(pattern: ErrorPattern): ErrorPattern {
  const base = BUILTIN_BY_KEY.get(pattern.key)
  if (!base) return pattern
  return {
    ...pattern,
    hintDetail: pattern.hintDetail || base.hintDetail,
    category: pattern.category ?? base.category,
    level: pattern.level ?? base.level,
    retryable: pattern.retryable ?? base.retryable,
    target: pattern.target ?? base.target,
    explain: pattern.explain ?? base.explain,
  }
}

let projectIndex: { source: NormalizedCatalog; index: PatternIndex } | undefined

function projectPatterns(): PatternIndex | undefined {
  const catalog = getProjectCatalog()
  if (!catalog) return undefined
  if (projectIndex?.source !== catalog) {
    projectIndex = {
      source: catalog,
      index: indexPatterns(catalog.patterns.map(inherit), false),
    }
  }
  return projectIndex.index
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
  const match = findPattern(query)
  if (!match) return undefined
  const { pattern } = match
  const dependency = pattern.dependency ?? query.dependency
  const explained = explain(pattern, query)
  // The key names the error when it had no code, or when the app's message
  // pattern knows it better than the status-made HTTP_4xx code.
  const names =
    !query.code ||
    (match.project && match.byMessage && GENERIC_CODE.test(query.code))
  return {
    hint: fill(pattern.hint, dependency, vars),
    hintDetail: fill(pattern.hintDetail, dependency, vars),
    code: names ? pattern.key : undefined,
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

function findIn(
  index: PatternIndex,
  query: HintQuery,
): Omit<Match, 'project'> | undefined {
  const { code, dependency, message } = query
  if (code) {
    const scoped = dependency
      ? index.byKey.get(scopedKey(dependency, code))
      : undefined
    const found = scoped ?? index.byKey.get(scopedKey(undefined, code))
    if (found) return { pattern: found, byMessage: false }
  }
  if (!message) return undefined
  const found = index.byMessage.find(
    (pattern) =>
      (!pattern.dependency || pattern.dependency === dependency) &&
      pattern.messageMatch!.test(message),
  )
  return found ? { pattern: found, byMessage: true } : undefined
}

/** The app's table first, then the built-in one. */
function findPattern(query: HintQuery): Match | undefined {
  const project = projectPatterns()
  const own = project && findIn(project, query)
  if (own) return { ...own, project: true }
  const builtin = findIn(BUILTIN, query)
  return builtin ? { ...builtin, project: false } : undefined
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
