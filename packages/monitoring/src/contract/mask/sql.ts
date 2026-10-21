import { isSensitiveKey, REDACTED } from './keys'
import { maskJsonText, maskNumber, redactValue, truncateUtf8 } from './value'

/**
 * SQL: the column each bind placeholder and each literal goes to, read from
 * the statement, so `"PASSWORD_HASH" = :2` is masked by its column like a
 * named `:password` is by its name. Read from `col op x`, `x op col`,
 * `col [NOT] LIKE x`, `col [NOT] BETWEEN x AND y`, `col [NOT] IN (x, …)`,
 * `(a, b) = (x, y)`, `x AS alias`, a call around the value
 * (`password = crypt($1, gen_salt('bf'))`, `SHA2(?, 256)`), and the column
 * lists of `INSERT … (cols) VALUES (…), (…)`, `INSERT … (cols) SELECT …`,
 * `INSERT ALL INTO …` and MERGE's `INSERT (cols) VALUES`. Fails closed: in a
 * statement that names a secret (a column, table or procedure the key rule
 * matches: `CALL change_password(?, ?)`), a bind whose column cannot be read
 * is masked too (`masked: 'unresolved'`).
 */

export type DbParamType =
  | 'string'
  | 'number'
  | 'bigint'
  | 'boolean'
  | 'null'
  | 'date'
  | 'buffer'
  | 'object'

/** One entry of `skilllane.monitoring.db.parameters`. */
export interface DbParameter {
  key: string
  type: DbParamType
  value: string
  /** The column the bind is compared with / inserted into, when the statement says. */
  column?: string
  /** The value was cut (LOG_BODY_MAX_BYTES / 4, a buffer at 2 KB of hex). */
  truncated?: boolean
  /** Masked because the statement names a secret and this bind's column could not be read from it. */
  masked?: 'unresolved'
}

interface Token {
  kind: 'id' | 'ph' | 'op' | 'punct' | 'string' | 'number'
  /** id: the name (unquoted, last part of a dotted name); keyword ids upper-case in `upper`. */
  text: string
  upper?: string
  start: number
  end: number
}

const OPERATORS = ['<>', '!=', '<=', '>=', '=', '<', '>']
const COMPARE_WORDS = new Set(['LIKE', 'ILIKE'])
const SCAN_MAX = 200_000
const NOT_COLUMNS =
  /^(AND|OR|NOT|WHERE|SET|ON|WHEN|THEN|ELSE|SELECT|NEXT|FIRST|LIMIT|OFFSET|CASE|END|NULL|IS|DISTINCT|VALUES|FROM|AS)$/
// Words before a value that is never a secret: LIMIT ?, OFFSET :2, FETCH FIRST :n ROWS.
const STRUCTURAL = new Set([
  'LIMIT',
  'OFFSET',
  'FETCH',
  'FIRST',
  'NEXT',
  'TOP',
  'ROWS',
  'SKIP',
  'PERCENT',
])
// Words before `(` that are not a function call around a value.
const NOT_FUNCTIONS = new Set([
  'IN',
  'VALUES',
  'AS',
  'AND',
  'OR',
  'NOT',
  'WHERE',
  'ON',
  'SET',
  'SELECT',
  'FROM',
  'JOIN',
  'EXISTS',
  'ANY',
  'ALL',
  'SOME',
  'USING',
  'INTO',
  'THEN',
  'ELSE',
  'WHEN',
  'CASE',
  'RETURNING',
  'BY',
  'OVER',
  'TABLE',
  'WITH',
  'UNION',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'IS',
  'LIKE',
  'ILIKE',
  'BETWEEN',
  'DISTINCT',
  'ESCAPE',
  'INSERT',
  'UPDATE',
  'DELETE',
  'MERGE',
  'CALL',
  'EXEC',
  'EXECUTE',
  'BEGIN',
  'END',
  'RETURN',
  'DO',
  'IF',
])
// Bind types masked when their column is unknown in a statement that names a secret.
const UNRESOLVED_MASKED = new Set<DbParamType>([
  'string',
  'number',
  'bigint',
  'object',
  'buffer',
])

/** `a.b."C"` → one id token `C` (the column, without its table / alias). */
function pushName(
  tokens: Token[],
  name: string,
  bare: boolean,
  start: number,
  end: number,
): void {
  const last = tokens[tokens.length - 1]
  const beforeDot = tokens[tokens.length - 2]
  let from = start
  if (last?.kind === 'punct' && last.text === '.' && beforeDot?.kind === 'id') {
    from = beforeDot.start
    tokens.splice(tokens.length - 2, 2)
  }
  tokens.push({
    kind: 'id',
    text: name,
    upper: bare ? name.toUpperCase() : undefined,
    start: from,
    end,
  })
}

/**
 * SQL tokens (string literals and comments skipped as values), at most
 * SCAN_MAX characters; `maxPlaceholders`: stops a few tokens after that many
 * placeholders (the bind list is cut there anyway).
 */
function tokenize(
  sql: string,
  maxPlaceholders = Number.POSITIVE_INFINITY,
): Token[] {
  const tokens: Token[] = []
  const n = Math.min(sql.length, SCAN_MAX)
  let placeholders = 0
  let stopAt = Number.POSITIVE_INFINITY
  let i = 0
  while (i < n && tokens.length < stopAt) {
    const c = sql[i]
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') {
      i++
    } else if (c === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i)
      i = end === -1 ? n : end + 1
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2)
      i = end === -1 ? n : end + 2
    } else if (c === "'") {
      let j = i + 1
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") j += 2
          else break
        } else j++
      }
      tokens.push({
        kind: 'string',
        text: '',
        start: i,
        end: Math.min(j + 1, n),
      })
      i = j + 1
    } else if (c === '"' || c === '`') {
      const end = sql.indexOf(c, i + 1)
      const name = sql.slice(i + 1, end === -1 ? n : end)
      const next = end === -1 ? n : end + 1
      pushName(tokens, name, false, i, next)
      i = next
    } else if (c === ':') {
      if (sql[i + 1] === ':' || sql[i + 1] === '=') {
        tokens.push({
          kind: 'op',
          text: sql.slice(i, i + 2),
          start: i,
          end: i + 2,
        })
        i += 2
        continue
      }
      const match = /^:(\.\.\.)?([A-Za-z0-9_$#]+)/.exec(sql.slice(i, i + 130))
      if (match) {
        tokens.push({
          kind: 'ph',
          text: `:${match[2]}`,
          start: i,
          end: i + match[0].length,
        })
        i += match[0].length
        if (++placeholders >= maxPlaceholders)
          stopAt = Math.min(stopAt, tokens.length + 16)
      } else {
        tokens.push({ kind: 'punct', text: ':', start: i, end: i + 1 })
        i++
      }
    } else if (c === '?') {
      tokens.push({ kind: 'ph', text: '?', start: i, end: i + 1 })
      i++
      if (++placeholders >= maxPlaceholders)
        stopAt = Math.min(stopAt, tokens.length + 16)
    } else if (c === '$' && /\d/.test(sql[i + 1] ?? '')) {
      const match = /^\$(\d+)/.exec(sql.slice(i, i + 12)) as RegExpExecArray
      tokens.push({
        kind: 'ph',
        text: match[0],
        start: i,
        end: i + match[0].length,
      })
      i += match[0].length
      if (++placeholders >= maxPlaceholders)
        stopAt = Math.min(stopAt, tokens.length + 16)
    } else if (c === '@' && /[A-Za-z_]/.test(sql[i + 1] ?? '')) {
      const match = /^@[A-Za-z0-9_]+/.exec(
        sql.slice(i, i + 130),
      ) as RegExpExecArray
      tokens.push({
        kind: 'ph',
        text: match[0],
        start: i,
        end: i + match[0].length,
      })
      i += match[0].length
      if (++placeholders >= maxPlaceholders)
        stopAt = Math.min(stopAt, tokens.length + 16)
    } else if (/[A-Za-z_]/.test(c)) {
      const match = /^[A-Za-z_][A-Za-z0-9_$#]*/.exec(
        sql.slice(i, i + 130),
      ) as RegExpExecArray
      pushName(tokens, match[0], true, i, i + match[0].length)
      i += match[0].length
    } else if (/\d/.test(c)) {
      const match = /^\d+(\.\d+)?/.exec(sql.slice(i, i + 40)) as RegExpExecArray
      tokens.push({
        kind: 'number',
        text: match[0],
        start: i,
        end: i + match[0].length,
      })
      i += match[0].length
    } else {
      const op = OPERATORS.find((candidate) => sql.startsWith(candidate, i))
      if (op) {
        tokens.push({ kind: 'op', text: op, start: i, end: i + op.length })
        i += op.length
      } else {
        tokens.push({ kind: 'punct', text: c, start: i, end: i + 1 })
        i++
      }
    }
  }
  return tokens
}

interface Ctx {
  tokens: Token[]
  /** The innermost `(` around each token (-1 at top level). */
  parent: Int32Array
  /** `(` ↔ its `)` (the last token when the statement is cut). */
  match: Int32Array
}

function context(tokens: Token[]): Ctx {
  const n = tokens.length
  const parent = new Int32Array(n).fill(-1)
  const match = new Int32Array(n).fill(-1)
  const stack: number[] = []
  for (let i = 0; i < n; i++) {
    const token = tokens[i]
    parent[i] = stack.length ? stack[stack.length - 1] : -1
    if (token.kind !== 'punct') continue
    if (token.text === '(') stack.push(i)
    else if (token.text === ')') {
      const open = stack.pop()
      if (open !== undefined) {
        match[open] = i
        match[i] = open
      }
    }
  }
  for (const open of stack) match[open] = n - 1
  return { tokens, parent, match }
}

function isWord(token: Token | undefined, word: string): boolean {
  return token?.kind === 'id' && token.upper === word
}

function isPunct(token: Token | undefined, text: string): boolean {
  return token?.kind === 'punct' && token.text === text
}

function isCompareOp(token: Token | undefined): boolean {
  return token?.kind === 'op' && token.text !== '::' && token.text !== ':='
}

/** The column on the left of a comparison whose operator is at `index`. */
function columnBefore(c: Ctx, index: number): string | undefined {
  const left = c.tokens[index - 1]
  if (left?.kind === 'id')
    return NOT_COLUMNS.test(left.upper ?? '') ? undefined : left.text
  // SQL Server [COL] = @p1
  if (
    isPunct(left, ']') &&
    c.tokens[index - 2]?.kind === 'id' &&
    isPunct(c.tokens[index - 3], '[')
  ) {
    return c.tokens[index - 2].text
  }
  // UPPER("CODE") LIKE :1, TRUNC(t.created_at) >= :2, LOWER(TRIM(email)) = …: the first name inside.
  if (!isPunct(left, ')')) return undefined
  const open = c.match[index - 1]
  if (open < 0) return undefined
  for (let j = open + 1; j < index - 1 && j < open + 64; j++) {
    const token = c.tokens[j]
    if (
      token.kind === 'id' &&
      !NOT_COLUMNS.test(token.upper ?? '') &&
      !isPunct(c.tokens[j + 1], '(')
    )
      return token.text
  }
  return undefined
}

/** The BETWEEN of `… BETWEEN x AND <here>`, `and` the index of the AND; -1 when none. */
function betweenFor(c: Ctx, and: number): number {
  let j = and - 1
  for (let steps = 0; j >= 0 && steps < 16; steps++) {
    const token = c.tokens[j]
    if (isPunct(token, ')')) j = c.match[j] - 1
    else if (isWord(token, 'BETWEEN')) return j
    else if (
      token.kind === 'id' &&
      /^(AND|OR|WHERE|ON|WHEN|SET)$/.test(token.upper ?? '')
    )
      return -1
    else if (isPunct(token, ',') || isPunct(token, '(')) return -1
    else j--
  }
  return -1
}

/** `(a, b) = (x, y)`: the left name at the position of the value starting at `start` in the right tuple. */
function tupleColumn(
  c: Ctx,
  rightOpen: number,
  start: number,
): string | undefined {
  let item = 0
  for (let j = rightOpen + 1; j < start; j++)
    if (isPunct(c.tokens[j], ',') && c.parent[j] === rightOpen) item++
  const leftOpen = c.match[rightOpen - 2]
  if (leftOpen < 0) return undefined
  const names: string[] = []
  for (let j = leftOpen + 1; j < rightOpen - 2; j++) {
    if (c.parent[j] === leftOpen && c.tokens[j].kind === 'id')
      names.push(c.tokens[j].text)
  }
  return names[item]
}

/** The column of the value spanning tokens [start, end]; '' = known not to be a column value; undefined = unknown. */
function columnAround(c: Ctx, start: number, end: number): string | undefined {
  const t = c.tokens
  const prev = t[start - 1]
  const next = t[end + 1]
  if (isCompareOp(prev)) {
    const column = columnBefore(c, start - 1)
    if (column) return column
  } else if (prev && COMPARE_WORDS.has(prev.upper ?? '')) {
    return columnBefore(c, isWord(t[start - 2], 'NOT') ? start - 2 : start - 1)
  } else if (isWord(prev, 'BETWEEN')) {
    return columnBefore(c, isWord(t[start - 2], 'NOT') ? start - 2 : start - 1)
  } else if (isWord(prev, 'AND')) {
    const between = betweenFor(c, start - 1)
    if (between !== -1)
      return columnBefore(
        c,
        isWord(t[between - 1], 'NOT') ? between - 1 : between,
      )
  } else if (prev?.kind === 'id' && STRUCTURAL.has(prev.upper ?? '')) {
    return ''
  }
  if (isCompareOp(next)) {
    // :1 = "ID", :1 = UPPER(col)
    const after = t[end + 2]
    if (after?.kind === 'id' && !NOT_COLUMNS.test(after.upper ?? '')) {
      if (!isPunct(t[end + 3], '(')) return after.text
      const close = c.match[end + 3]
      for (let j = end + 4; j < close && j < end + 64; j++) {
        if (t[j].kind === 'id' && !isPunct(t[j + 1], '(')) return t[j].text
      }
    }
  }
  if (isWord(next, 'AS') && t[end + 2]?.kind === 'id') return t[end + 2].text
  if (isPunct(prev, '(') || isPunct(prev, ',')) {
    const open = c.parent[start]
    if (open >= 0) {
      const before = t[open - 1]
      if (isWord(before, 'IN'))
        return columnBefore(c, isWord(t[open - 2], 'NOT') ? open - 2 : open - 1)
      if (isCompareOp(before) && isPunct(t[open - 2], ')'))
        return tupleColumn(c, open, start)
    }
  }
  return undefined
}

/** The value at `index`, then the calls around it, outward. */
function slotColumn(
  c: Ctx,
  index: number,
  walkOut: boolean,
): string | undefined {
  let start = index
  let end = index
  for (let hop = 0; hop < 8; hop++) {
    const column = columnAround(c, start, end)
    if (column !== undefined || !walkOut) return column
    const open = c.parent[start]
    if (open < 1) return undefined
    const fn = c.tokens[open - 1]
    if (fn.kind !== 'id' || NOT_FUNCTIONS.has(fn.upper ?? '')) return undefined
    start = open - 1
    end = c.match[open]
  }
  return undefined
}

interface Slot {
  column?: string
  /** LIMIT / OFFSET … : not a column value at all. */
  structural?: boolean
}

function isValueToken(token: Token): boolean {
  return (
    token.kind === 'ph' || token.kind === 'string' || token.kind === 'number'
  )
}

/** The column list `(a, b, …)` whose `(` is at `open`. */
function columnList(c: Ctx, open: number): string[] {
  const columns: string[] = []
  const close = c.match[open]
  for (let j = open + 1; j < close; j++)
    if (c.parent[j] === open && c.tokens[j].kind === 'id')
      columns.push(c.tokens[j].text)
  return columns
}

/** Every value token in [from, to) at item k (commas at `level`) without a column gets columns[k]. */
function assignItems(
  c: Ctx,
  slots: Map<number, Slot>,
  from: number,
  to: number,
  level: number,
  columns: string[],
): void {
  let item = 0
  for (let j = from; j < to; j++) {
    const token = c.tokens[j]
    if (isPunct(token, ',') && c.parent[j] === level) {
      item++
      continue
    }
    const slot = slots.get(j)
    if (slot && slot.column === undefined && !slot.structural && columns[item])
      slot.column = columns[item]
  }
}

const SELECT_END = /^(FROM|WHERE|UNION|GROUP|ORDER|HAVING|RETURNING|ON|LIMIT)$/

/** INSERT [ALL] INTO t (cols) VALUES (…), (…) | SELECT …, and MERGE's INSERT (cols) VALUES (…). */
function insertColumns(c: Ctx, slots: Map<number, Slot>): void {
  const t = c.tokens
  for (let i = 0; i < t.length; i++) {
    let open = -1
    if (isWord(t[i], 'INSERT') && isPunct(t[i + 1], '(')) open = i + 1
    else if (
      isWord(t[i], 'INTO') &&
      t[i + 1]?.kind === 'id' &&
      isPunct(t[i + 2], '(')
    )
      open = i + 2
    if (open === -1) continue
    const columns = columnList(c, open)
    if (!columns.length) continue
    let k = c.match[open] + 1
    if (isWord(t[k], 'VALUES')) {
      k++
      while (isPunct(t[k], '(')) {
        const close = c.match[k]
        assignItems(c, slots, k + 1, close, k, columns)
        if (isPunct(t[close + 1], ',') && isPunct(t[close + 2], '('))
          k = close + 2
        else break
      }
    } else if (isWord(t[k], 'SELECT')) {
      const level = c.parent[k]
      let end = k + 1
      while (end < t.length) {
        const token = t[end]
        if (
          c.parent[end] === level &&
          (SELECT_END.test(token.upper ?? '') || isPunct(token, ';'))
        )
          break
        if (level !== -1 && end >= c.match[level]) break
        end++
      }
      assignItems(c, slots, k + 1, end, level, columns)
    }
  }
}

interface Analysis {
  ctx: Ctx
  slots: Map<number, Slot>
  /** The statement names a secret: an identifier the key rule matches. */
  sensitive: boolean
}

function analyse(sql: string, maxPlaceholders?: number): Analysis {
  const ctx = context(tokenize(sql, maxPlaceholders))
  const slots = new Map<number, Slot>()
  let sensitive = false
  ctx.tokens.forEach((token, index) => {
    if (token.kind === 'id' && !sensitive && isSensitiveKey(token.text))
      sensitive = true
    if (!isValueToken(token)) return
    // A number literal only by itself: `SHA2(?, 256)` does not make 256 a password.
    const column = slotColumn(ctx, index, token.kind !== 'number')
    slots.set(
      index,
      column === '' ? { structural: true } : column ? { column } : {},
    )
  })
  insertColumns(ctx, slots)
  return { ctx, slots, sensitive }
}

export interface Placeholder {
  name: string
  column?: string
  structural?: boolean
}

/** Placeholders in statement order, with the column each one binds to. */
export function sqlPlaceholders(
  sql: string,
  maxPlaceholders?: number,
): Placeholder[] {
  return placeholdersOf(analyse(sql, maxPlaceholders))
}

function placeholdersOf({ ctx, slots }: Analysis): Placeholder[] {
  const out: Placeholder[] = []
  ctx.tokens.forEach((token, index) => {
    if (token.kind !== 'ph') return
    const slot = slots.get(index) ?? {}
    const placeholder: Placeholder = { name: token.text }
    if (slot.column) placeholder.column = slot.column
    if (slot.structural) placeholder.structural = true
    out.push(placeholder)
  })
  return out
}

/**
 * A SQL statement: literals whose column is sensitive (`VALUES ('a@b.c',
 * 'secret')` under `(email, password)`, `password_hash = 'x'`) and, in a
 * statement that names a secret, string literals of unknown column become
 * `'[REDACTED]'`; then the value rule with placeholders kept.
 */
export function maskSql(sql: string): string {
  if (!sql) return sql
  const analysis = analyse(sql)
  const { tokens } = analysis.ctx
  let out = ''
  let last = 0
  analysis.slots.forEach((slot, index) => {
    const token = tokens[index]
    if (token.kind === 'ph') return
    const secret = slot.column
      ? isSensitiveKey(slot.column)
      : token.kind === 'string' && analysis.sensitive && !slot.structural
    if (!secret || sql.slice(token.start, token.end) === `'${REDACTED}'`) return
    out += `${sql.slice(last, token.start)}'${REDACTED}'`
    last = token.end
  })
  return redactValue(last ? out + sql.slice(last) : sql, { sql: true })
}

export interface DbParametersOptions {
  /** The whole JSON stays under this many UTF-8 bytes (LOG_BODY_MAX_BYTES). */
  maxBytes: number
  /** Each value is cut at this many bytes (LOG_BODY_MAX_BYTES / 4). */
  valueMax: number
}

/** The key rule, the fail-closed rule, the value cap, then the value rule on one bind. */
function finishParam(
  param: DbParameter,
  placeholder: Placeholder | undefined,
  sensitiveStatement: boolean,
  valueMax: number,
): DbParameter {
  const out: DbParameter = {
    key: param.key,
    type: param.type,
    value: param.value,
  }
  const column = placeholder?.column ?? param.column
  if (column) out.column = column
  if (param.truncated) out.truncated = true
  if (isSensitiveKey(param.key) || isSensitiveKey(column)) {
    out.value = REDACTED
    delete out.truncated
    return out
  }
  if (
    out.value !== REDACTED &&
    UNRESOLVED_MASKED.has(param.type) &&
    sensitiveStatement &&
    !column &&
    !placeholder?.structural
  ) {
    out.value = REDACTED
    out.masked = 'unresolved'
    delete out.truncated
    return out
  }
  if (param.masked) out.masked = param.masked
  // Cut first: only the kept head is looked at.
  const capped = truncateUtf8(out.value, valueMax)
  if (capped.truncated) {
    out.value = capped.text
    out.truncated = true
  }
  if (param.type === 'string') out.value = redactValue(out.value)
  else if (param.type === 'number' || param.type === 'bigint') {
    if (
      /^\d{13}$/.test(out.value) &&
      maskNumber(Number(out.value)) === REDACTED
    )
      out.value = REDACTED
  } else if (param.type === 'object' && out.value !== '[Lob]') {
    out.value = maskJsonText(out.value, !out.truncated)
  }
  return out
}

const MORE_RESERVE = 96

/**
 * The JSON of `skilllane.monitoring.db.parameters` in one pass: bind `index` is made
 * (`paramAt`), matched to its column, masked and serialised only while the
 * list stays under `maxBytes`; then a last `{ key: '…', type: 'null', value:
 * '<n> more', truncated: true }`. Cost is bounded by maxBytes, whatever the
 * number of binds. `count` 0 → ''.
 */
export function dbParametersJson(
  statement: string | undefined,
  count: number,
  paramAt: (index: number) => DbParameter,
  options: DbParametersOptions,
): string {
  if (count <= 0) return ''
  // No entry is shorter than {"key":"1","type":"null","value":"null"}: never more placeholders than this are needed.
  const maxKept = Math.max(1, Math.floor(options.maxBytes / 40))
  const analysis = statement
    ? analyse(statement, Math.min(count, maxKept) + 1)
    : undefined
  const placeholders = analysis ? placeholdersOf(analysis) : []
  const sensitive = analysis?.sensitive ?? false
  const dollar = placeholders.some((placeholder) =>
    placeholder.name.startsWith('$'),
  )
  const named = new Map<string, Placeholder>()
  for (const placeholder of placeholders) {
    const name = placeholder.name.replace(/^[:@$]/, '')
    const known = named.get(name)
    if (!known || (!known.column && placeholder.column))
      named.set(name, placeholder)
  }
  const parts: string[] = []
  let bytes = 2
  let kept = 0
  for (let index = 0; index < count; index++) {
    const param = paramAt(index)
    // Positional: by occurrence ("?", ":1", ":x"), or by number for $n.
    const positional = /^\d+$/.test(param.key)
    const placeholder =
      positional && !dollar ? placeholders[index] : named.get(param.key)
    const json = JSON.stringify(
      finishParam(param, placeholder, sensitive, options.valueMax),
    )
    const size = Buffer.byteLength(json) + (kept ? 1 : 0)
    const room = options.maxBytes - (index + 1 < count ? MORE_RESERVE : 0)
    if (bytes + size > room) break
    parts.push(json)
    bytes += size
    kept++
  }
  if (kept < count) {
    parts.push(
      JSON.stringify({
        key: '…',
        type: 'null',
        value: `${count - kept} more`,
        truncated: true,
      }),
    )
  }
  return `[${parts.join(',')}]`
}
