import {
  type DbParameter,
  type DbParamType,
  dbParametersJson,
  sqlPlaceholders,
} from '../contract'
import type { Span } from '@opentelemetry/api'
import { CAPTURE_ATTR } from './attributes'
import { maskValue } from './mask'
import { put, recording } from './pending'
import { captureActive, captureSettings } from './settings'

/**
 * Bind values, in bind order, as `skilllane.monitoring.db.parameters` (a JSON array of
 * { key, type, value }). key: the bind name, or "1", "2" … for positional
 * binds; value: the string form (dates ISO-8601, buffers hex, objects JSON).
 * Each bind is matched to its column where the statement says (shared rules,
 * skilllane-monitoring-contract src/mask/sql.ts: `col = :2`, `col IN (…)`, `INSERT … (cols)
 * VALUES / SELECT`, a call around the value, `AS alias` …), so `"PASSWORD_HASH"
 * = :2` is masked by its column like a named `:password` is by its name; in a
 * statement that names a secret, a bind of unknown column is masked too. Then
 * the value rule. Binds are typed, masked and serialised one at a time and
 * only while the list is under LOG_BODY_MAX_BYTES: the cost does not grow
 * with a bulk statement's thousands of binds.
 */

export type { DbParameter, DbParamType }
export { sqlPlaceholders }

// node-oracledb: BIND_OUT
const ORACLE_BIND_OUT = 3003
const BUFFER_MAX = 2_048
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
// Date.prototype.toString(): what the oracledb / pg instrumentations write for a Date.
const DATE_STRING =
  /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4}/

/** One bind value with its type; `raw` is the value the driver got. */
export function typedParam(key: string, raw: unknown): DbParameter {
  let value = raw
  // node-oracledb bind definition: { val, dir, type, maxSize }.
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ('val' in value || 'dir' in value)
  ) {
    const bind = value as { val?: unknown; dir?: number }
    if (bind.dir === ORACLE_BIND_OUT)
      return { key, type: 'null', value: 'null' }
    value = bind.val
  }
  if (value === null || value === undefined)
    return { key, type: 'null', value: 'null' }
  if (typeof value === 'string') return { key, type: 'string', value }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { key, type: 'number', value: String(value) }
      : { key, type: 'string', value: String(value) }
  }
  if (typeof value === 'bigint')
    return { key, type: 'bigint', value: value.toString() }
  if (typeof value === 'boolean')
    return { key, type: 'boolean', value: String(value) }
  if (value instanceof Date) {
    return {
      key,
      type: 'date',
      value: Number.isNaN(value.getTime())
        ? 'Invalid Date'
        : value.toISOString(),
    }
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    const hex = bytes.subarray(0, BUFFER_MAX).toString('hex')
    return bytes.length > BUFFER_MAX
      ? { key, type: 'buffer', value: hex, truncated: true }
      : { key, type: 'buffer', value: hex }
  }
  if ((value as object).constructor?.name === 'Lob')
    return { key, type: 'object', value: '[Lob]' }
  try {
    return {
      key,
      type: 'object',
      value: JSON.stringify(maskValue(value)) ?? 'null',
    }
  } catch {
    return { key, type: 'object', value: String(value) }
  }
}

/** A value an instrumentation already turned into a string. */
function stringParam(key: string, value: string): DbParameter {
  if (value === 'null') return { key, type: 'null', value: 'null' }
  if (DATE_STRING.test(value)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime()))
      return { key, type: 'date', value: date.toISOString() }
  }
  return { key, type: 'string', value }
}

/** Binds made one at a time: `at(i)` types bind i only when the list gets that far. */
export interface BindList {
  count: number
  at(index: number): DbParameter
}

const NO_BINDS: BindList = {
  count: 0,
  at: () => ({ key: '', type: 'null', value: 'null' }),
}

/** `binds` an array (positional) or an object (named). */
export function bindList(binds: unknown): BindList {
  if (binds === undefined || binds === null || typeof binds !== 'object')
    return NO_BINDS
  if (Array.isArray(binds))
    return {
      count: binds.length,
      at: (index) => typedParam(String(index + 1), binds[index]),
    }
  const entries = Object.entries(binds as Record<string, unknown>)
  return {
    count: entries.length,
    at: (index) => typedParam(entries[index][0], entries[index][1]),
  }
}

/** Parameters already in the contract's shape (an app that wrote `skilllane.monitoring.db.parameters` itself). */
export function paramList(params: DbParameter[]): BindList {
  return { count: params.length, at: (index) => params[index] }
}

/** The `skilllane.monitoring.db.parameters` JSON ('' without binds): columns, both masking rules, the caps. */
export function paramsJson(
  statement: string | undefined,
  list: BindList,
): string {
  const { maxBytes } = captureSettings()
  return dbParametersJson(statement, list.count, list.at, {
    maxBytes,
    valueMax: Math.max(256, Math.floor(maxBytes / 4)),
  })
}

/** Sets skilllane.monitoring.db.parameters from a statement and its binds. */
export function captureDbParameters(
  span: Span,
  statement: string | undefined,
  binds: unknown,
): void {
  if (!recording(span) || !captureActive()) return
  try {
    const json = paramsJson(statement, bindList(binds))
    if (json) put(span, CAPTURE_ATTR.dbParameters, json)
  } catch {
    // never affect the query
  }
}

/** `requestHook` of @opentelemetry/instrumentation-oracledb: the execute's real, typed binds. */
export function oracledbRequestHook(
  span: Span,
  info: { inputArgs?: unknown },
): void {
  const args = info?.inputArgs as any
  const [statement, binds] = Array.isArray(args)
    ? args
    : [args?.statement ?? args?.sql, args?.binds ?? args?.values]
  captureDbParameters(
    span,
    typeof statement === 'string' ? statement : undefined,
    binds,
  )
}

/** `requestHook` of @opentelemetry/instrumentation-pg. */
export function pgRequestHook(
  span: Span,
  info: { query?: { text?: string; values?: unknown[] } },
): void {
  captureDbParameters(span, info?.query?.text, info?.query?.values)
}

// --- what other instrumentations wrote --------------------------------------------

const PARAMETER_PREFIXES = ['db.query.parameter.', 'db.operation.parameter.']
// TypeORM (opentelemetry-instrumentation-typeorm collectParameters): JSON of getParameters().
const TYPEORM_PARAMETERS = 'db.statement.parameters'
const PG_VALUES = 'db.postgresql.values'

/**
 * Bind values other instrumentations put on a span (oracledb's
 * enhancedDatabaseReporting `db.operation.parameter.<i>`, semconv
 * `db.query.parameter.<key>`, TypeORM `db.statement.parameters`, pg
 * `db.postgresql.values`): the raw keys, and the parameters they hold (made
 * one at a time, as far as the list gets).
 */
export function foreignParams(attributes: Record<string, unknown>): {
  keys: string[]
  list: BindList
} {
  const keys: string[] = []
  const entries: Array<[string, unknown]> = []
  for (const [key, value] of Object.entries(attributes)) {
    const prefix = PARAMETER_PREFIXES.find((candidate) =>
      key.startsWith(candidate),
    )
    if (!prefix) continue
    keys.push(key)
    entries.push([key.slice(prefix.length), value])
  }
  let list = NO_BINDS
  if (entries.length) {
    // oracledb numbers positions from 0; the contract from 1.
    const numeric = entries.every(([key]) => /^\d+$/.test(key))
    const shift = numeric && entries.some(([key]) => key === '0') ? 1 : 0
    if (numeric) entries.sort((a, b) => Number(a[0]) - Number(b[0]))
    list = {
      count: entries.length,
      at: (index) => {
        const [key, value] = entries[index]
        const name = numeric ? String(Number(key) + shift) : key
        return typeof value === 'string'
          ? stringParam(name, value)
          : typedParam(name, value)
      },
    }
  }
  const typeorm = attributes[TYPEORM_PARAMETERS]
  if (typeorm !== undefined) {
    keys.push(TYPEORM_PARAMETERS)
    if (!list.count && typeof typeorm === 'string') {
      try {
        const parsed: unknown = JSON.parse(typeorm)
        if (Array.isArray(parsed)) {
          list = {
            count: parsed.length,
            at: (index) => jsonParam(String(index + 1), parsed[index]),
          }
        } else {
          const named = Object.entries(
            (parsed ?? {}) as Record<string, unknown>,
          )
          list = {
            count: named.length,
            at: (index) => jsonParam(named[index][0], named[index][1]),
          }
        }
      } catch {
        list = { count: 1, at: () => stringParam('1', typeorm) }
      }
    }
  }
  const pg = attributes[PG_VALUES]
  if (pg !== undefined) {
    keys.push(PG_VALUES)
    if (!list.count && Array.isArray(pg)) {
      list = {
        count: pg.length,
        at: (index) => {
          const value = pg[index]
          return typeof value === 'string'
            ? stringParam(String(index + 1), value)
            : typedParam(String(index + 1), value)
        },
      }
    }
  }
  return { keys, list }
}

/** A value parsed from JSON: an ISO string is a date. */
function jsonParam(key: string, value: unknown): DbParameter {
  if (typeof value === 'string' && ISO_DATE.test(value))
    return { key, type: 'date', value }
  return typedParam(key, value)
}
