import type { DependencyType } from '../../types'
import type { SchemaIndex } from '../schema'

/**
 * Who has to act: `bug` = fix our code, `input` = the caller sent bad data,
 * `data` = stored data conflicts with the change, `dependency` = a service we
 * call is failing, `config` = env or credentials are wrong.
 */
export type ErrorCategory = 'bug' | 'input' | 'data' | 'dependency' | 'config'

/**
 * One entry of the hint table. Lookup order: (dependency, key) → key →
 * messageMatch. `hint`, `detail` and `howToFix` are constant English
 * sentences; values that change go in fields, never in the text. Dependency
 * texts may use the placeholders {Type}, {name}, {host}, {port} and {env} only.
 */
export interface ErrorPattern {
  /** The `error.code` produced by an adapter, e.g. `ORA-00001`, `ECONNREFUSED`. */
  key: string
  /** Narrows the match to errors raised while talking to this dependency. */
  dependency?: DependencyType
  /** For errors that carry no code (a wrapped message). Checked last. */
  messageMatch?: RegExp
  /** 2–4 words, ≤30 characters (≤40 when `dependency` is set). */
  hint: string
  /** ≤200 characters: what probably happened (`error.detail`). */
  detail: string
  /** ≤200 characters: what to do about it (`error.how_to_fix`). */
  howToFix: string
  /**
   * Overrides the level of a plain `app.log` error line, e.g. 4xx → warn.
   * Inside an HTTP request a 5xx response turns it back to error (held-lines.ts).
   */
  level?: 'warn' | 'error'
  retryable?: boolean
  /** Default: `dependency` when `dependency` is set, `input` when level is warn. */
  category?: ErrorCategory
  /**
   * Pulls the thing to fix out of the error message (group 1): the property
   * read, the constraint or column name. Logged as `labels.error_target`; the
   * hint text itself stays constant.
   */
  target?: RegExp
  /**
   * The specific case: reads names (never data values) from the message or
   * the error object and says what happened and what to fix. Each field it
   * returns overrides the pattern's own.
   */
  explain?: (input: ExplainInput) => Explanation | undefined
}

export interface ExplainInput {
  message: string
  /** The raw error; read only names and counts from it, never row data. */
  error: any
  schema: SchemaIndex
}

export interface Explanation {
  /** `labels.error_target`: Entity.property, constraint, key, field list. */
  target?: string
  /** `error.detail` for this case, e.g. what exceeded which limit. */
  detail?: string
  /** `error.how_to_fix` for this case, e.g. which field to validate. */
  howToFix?: string
}

export const HINT_MAX = 30
export const DEPENDENCY_HINT_MAX = 40
export const DETAIL_MAX = 200
export const HOW_TO_FIX_MAX = 200
export const ALLOWED_PLACEHOLDERS = ['Type', 'name', 'host', 'port', 'env']
