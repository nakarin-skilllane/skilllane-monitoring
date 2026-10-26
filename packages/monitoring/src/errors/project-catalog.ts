import type { DependencyType } from '../types'
import type { ErrorCategory, ErrorPattern } from './patterns/types'

/** One code of the app's own table (src/skilllane-monitoring/errors.ts). */
export interface ProjectCatalogEntry {
  hint: string
  hintDetail?: string
  category?: ErrorCategory
  level?: 'warn' | 'error'
  dependency?: DependencyType
  /** For errors that carry no code: the key becomes their `error.code`. */
  messageMatch?: RegExp
}

/** The default export of the app's file. */
export interface MonitoringConfig {
  errors?: {
    /** Reads the app's code off an error; unset = the SDK adapters' code. */
    codeOf?: (error: any) => unknown
    catalog?: Record<string, ProjectCatalogEntry>
  }
}

export interface CatalogIssue {
  /** error = the entry or a field was cut / dropped; warning = style only. */
  severity: 'error' | 'warning'
  code: string
  message: string
}

export interface NormalizedCatalog {
  patterns: ErrorPattern[]
  codeOf?: (error: any) => unknown
  issues: CatalogIssue[]
}

const CATEGORIES: readonly ErrorCategory[] = [
  'bug',
  'input',
  'data',
  'dependency',
  'config',
]
const DEPENDENCIES: readonly DependencyType[] = [
  'redis',
  'oracle',
  'kafka',
  'rabbitmq',
  'smtp',
  'http',
  's3',
  'google',
]
const CODE_SHAPE = /^[A-Z0-9_.-]+$/
const HINT_MAX = 30
const HINT_MAX_DEPENDENCY = 40
const DETAIL_MAX = 200

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * Checks and trims the app's table. Never throws: a bad entry or field is
 * dropped or cut, and each change is reported as an issue.
 */
export function normalizeCatalog(raw: unknown): NormalizedCatalog {
  const config = ((raw as any)?.default ?? raw) as MonitoringConfig
  const catalog = config?.errors?.catalog
  if (!catalog || typeof catalog !== 'object') {
    return {
      patterns: [],
      issues: [
        {
          severity: 'error',
          code: '*',
          message: 'export default { errors: { catalog } } expected',
        },
      ],
    }
  }
  const issues: CatalogIssue[] = []
  const patterns: ErrorPattern[] = []
  for (const code of Object.keys(catalog).sort()) {
    const entry = (catalog as Record<string, any>)[code] ?? {}
    const problem = (message: string) =>
      issues.push({ severity: 'error', code, message })
    if (!CODE_SHAPE.test(code)) {
      issues.push({
        severity: 'warning',
        code,
        message: 'code should match [A-Z0-9_.-]+',
      })
    }
    if (typeof entry.hint !== 'string' || !entry.hint.trim()) {
      problem('hint is required; entry skipped')
      continue
    }
    const pattern: ErrorPattern = { key: code, hint: '', hintDetail: '' }
    if (entry.dependency !== undefined) {
      if (DEPENDENCIES.includes(entry.dependency)) {
        pattern.dependency = entry.dependency
      } else {
        problem(
          `dependency "${entry.dependency}" is not one of ${DEPENDENCIES.join('|')}; ignored`,
        )
      }
    }
    const hintMax = pattern.dependency ? HINT_MAX_DEPENDENCY : HINT_MAX
    if (entry.hint.length > hintMax) {
      problem(`hint is longer than ${hintMax} characters; cut`)
    }
    pattern.hint = cut(entry.hint, hintMax)
    if (typeof entry.hintDetail === 'string') {
      if (entry.hintDetail.length > DETAIL_MAX) {
        problem(`hintDetail is longer than ${DETAIL_MAX} characters; cut`)
      }
      pattern.hintDetail = cut(entry.hintDetail, DETAIL_MAX)
    }
    if (entry.category !== undefined) {
      if (CATEGORIES.includes(entry.category)) {
        pattern.category = entry.category
      } else {
        problem(
          `category "${entry.category}" is not one of ${CATEGORIES.join('|')}; ignored`,
        )
      }
    }
    if (entry.level !== undefined) {
      if (entry.level === 'warn' || entry.level === 'error') {
        pattern.level = entry.level
      } else {
        problem(`level "${entry.level}" is not warn|error; ignored`)
      }
    }
    if (entry.messageMatch !== undefined) {
      if (entry.messageMatch instanceof RegExp) {
        pattern.messageMatch = entry.messageMatch
      } else {
        problem('messageMatch is not a RegExp; ignored')
      }
    }
    patterns.push(pattern)
  }
  const codeOf = config.errors?.codeOf
  if (codeOf !== undefined && typeof codeOf !== 'function') {
    issues.push({
      severity: 'error',
      code: '*',
      message: 'codeOf is not a function; ignored',
    })
  }
  issues.sort(
    (a, b) =>
      a.code.localeCompare(b.code) || a.severity.localeCompare(b.severity),
  )
  return {
    patterns,
    codeOf: typeof codeOf === 'function' ? codeOf : undefined,
    issues,
  }
}

let current: NormalizedCatalog | undefined

export function setProjectCatalog(
  catalog: NormalizedCatalog | undefined,
): void {
  current = catalog
}

export function getProjectCatalog(): NormalizedCatalog | undefined {
  return current
}

/** The app's code for an error, from its `codeOf`; never throws. */
export function projectCodeOf(error: unknown): string | undefined {
  const codeOf = current?.codeOf
  if (!codeOf) return undefined
  try {
    const value = codeOf(error)
    if (typeof value === 'string' && value) return value
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
  } catch {
    // a broken codeOf must not lose the log line
  }
  return undefined
}
