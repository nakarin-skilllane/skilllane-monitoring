import { isSensitiveKey, isSensitiveQueryName, REDACTED } from './keys'

/**
 * The value rule, on every string the telemetry stores: JWT, Bearer / Basic
 * credentials, the credential after `Authorization:` whatever its scheme, URL
 * userinfo (`scheme://user:[REDACTED]@`), a `name = value` / `"name": "value"`
 * pair whose name is sensitive (the key rule), a string that is itself JSON
 * (masked as JSON), Thai national ID (mod-11 checksum). Plus the JSON
 * masking of bodies and payloads: key rule and value rule, strict for whole
 * JSON, a tolerant scan for cut or invalid JSON that fails closed.
 */

const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi
const BEARER_HINT = /bearer|basic/i
// scheme://user:password@ or scheme://user@ (a token as the user name).
const USERINFO =
  /\b([a-z][a-z0-9+.-]*:\/\/)([^\s:@/?#[\]]*)(?::([^\s@/?#]*))?@/gi
// 13 digits, optionally written 1-2345-67890-12-3.
const THAI_ID = /(?<!\d)(\d)-?(\d{4})-?(\d{5})-?(\d{2})-?(\d)(?!\d)/g
const DIGITS5 = /\d{5}/
const URL_QUERY = /((?:https?:\/\/[^\s?#"']+)|(?:\/[\w\-./%~]*))\?[^\s#"']*/g
// A quoted name ("name", 'name', \"name\" inside a JSON string) or a bare one starting a word, then = : == => := ===
const PAIR =
  /(?:(\\?["'])([A-Za-z0-9_.-]{1,64})\1|(?<![A-Za-z0-9_.\-\\])([A-Za-z0-9_.-]{1,64}))[ \t]*(===|=>|:=|==|[:=])[ \t]*/g
// A bind placeholder (:1, :name, ?, $1, @p1): not a secret value.
const PLACEHOLDER = /^(?::(?:\.\.\.)?[A-Za-z0-9_$#]+|\?|\$\d+|@[A-Za-z0-9_]+)$/
const SCHEME = /^([A-Za-z][\w.+-]*)[ \t]+\S/
const MAX_DEPTH = 32
const QUOTED_REDACTED = `"${REDACTED}"`

/** Thai national ID checksum (mod 11), so timestamps and ids are kept. */
export function isThaiNationalId(digits: string): boolean {
  if (!/^\d{13}$/.test(digits) || digits[0] === '0') return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (13 - i)
  return (11 - (sum % 11)) % 10 === Number(digits[12])
}

export function stripQuery(path: string): string {
  const index = path.indexOf('?')
  return index === -1 ? path : path.slice(0, index)
}

function lineEnd(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c === 10 || c === 13) return i
  }
  return text.length
}

/** Index of the quote closing the one at `start` (backslash escapes), or -1 when cut. */
function quoteEnd(text: string, start: number, quote: string): number {
  const q = quote.charCodeAt(0)
  for (let i = start + 1; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c === 92) i++
    else if (c === q) return i
  }
  return -1
}

/** Index after the object / array starting at `start`, or text.length when cut. */
function containerEnd(text: string, start: number): number {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      const end = quoteEnd(text, i, '"')
      if (end === -1) return text.length
      i = end
    } else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return text.length
}

// Where an unquoted value ends: whitespace , " ' & ; (and } ] in JSON).
function bareStop(c: number, json: boolean): boolean {
  return (
    c === 32 ||
    c === 9 ||
    c === 10 ||
    c === 13 ||
    c === 44 ||
    c === 34 ||
    c === 39 ||
    c === 38 ||
    c === 59 ||
    (json && (c === 125 || c === 93))
  )
}

interface PairMode {
  sql: boolean
  json: boolean
}

/** The masked form of the value at `p` and where it ends; undefined: keep it. */
function maskedValue(
  text: string,
  p: number,
  name: string,
  mode: PairMode,
): [number, string | undefined] {
  if (p >= text.length) return [p, undefined]
  const c = text[p]
  if (c === '"' || c === "'") {
    const close = quoteEnd(text, p, c)
    if (close === -1)
      return [mode.json ? text.length : lineEnd(text, p), `${c}${REDACTED}`]
    return [
      close + 1,
      text.slice(p + 1, close) === REDACTED ? undefined : `${c}${REDACTED}${c}`,
    ]
  }
  if (c === '\\' && (text[p + 1] === '"' || text[p + 1] === "'")) {
    const quote = text.slice(p, p + 2)
    const close = text.indexOf(quote, p + 2)
    if (close === -1) return [lineEnd(text, p), `${quote}${REDACTED}`]
    return [close + 2, `${quote}${REDACTED}${quote}`]
  }
  const lower = name.toLowerCase()
  if (
    !mode.json &&
    !mode.sql &&
    (lower.endsWith('authorization') ||
      lower === 'cookie' ||
      lower === 'set-cookie')
  ) {
    // A credential header written as text: the rest of the line, its scheme kept.
    const end = lineEnd(text, p)
    const rest = text.slice(p, end)
    const scheme = SCHEME.exec(rest)
    const masked = scheme ? `${scheme[1]} ${REDACTED}` : REDACTED
    return [end, masked === rest ? undefined : masked]
  }
  if (mode.json && (c === '{' || c === '['))
    return [containerEnd(text, p), QUOTED_REDACTED]
  let end = p
  while (end < text.length && !bareStop(text.charCodeAt(end), mode.json)) end++
  if (end === p) return [p, undefined]
  const value = text.slice(p, end)
  if (value === REDACTED) return [end, undefined]
  // SQL: only literals are values (identifiers, calls and placeholders stay).
  if (mode.sql && (PLACEHOLDER.test(value) || !/^[-+]?\.?\d/.test(value)))
    return [end, undefined]
  return [end, REDACTED]
}

/** Every `name = value` / `"name": "value"` pair whose name is sensitive; a quoted value whole. */
function redactPairs(text: string, mode: PairMode): string {
  PAIR.lastIndex = 0
  let out = ''
  let last = 0
  let changed = false
  let match: RegExpExecArray | null
  while ((match = PAIR.exec(text)) !== null) {
    const name = match[2] ?? match[3]
    const before = text[match.index - 1]
    const sensitive =
      before === '?' || before === '&' || before === '#'
        ? isSensitiveQueryName(name)
        : isSensitiveKey(name)
    if (!sensitive) continue // lastIndex is after the separator: a pair inside the value is still seen
    const valueStart = match.index + match[0].length
    const [end, masked] = maskedValue(text, valueStart, name, mode)
    if (masked === undefined) continue
    out += text.slice(last, valueStart) + masked
    last = end
    changed = true
    if (PAIR.lastIndex < end) PAIR.lastIndex = end
  }
  return changed ? out + text.slice(last) : text
}

function redactUserinfo(text: string): string {
  return text.replace(
    USERINFO,
    (match, scheme: string, user: string, password: string | undefined) => {
      if (password !== undefined)
        return password ? `${scheme}${user}:${REDACTED}@` : match
      return user && user !== REDACTED ? `${scheme}${REDACTED}@` : match
    },
  )
}

/** A string that is a JSON object or array: masked as JSON, undefined otherwise. */
function maskJsonInText(text: string): string | undefined {
  let first = 0
  while (first < text.length && text.charCodeAt(first) <= 32) first++
  const open = text[first]
  if (open !== '{' && open !== '[') return undefined
  let last = text.length - 1
  while (last > first && text.charCodeAt(last) <= 32) last--
  if (text[last] !== (open === '{' ? '}' : ']')) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  const state = { changed: false }
  const masked = maskParsed(parsed, 0, state)
  return state.changed ? JSON.stringify(masked) : text
}

export interface RedactOptions {
  /** A SQL statement: a pair keeps its placeholder or column (`password = :1` stays runnable). */
  sql?: boolean
}

/**
 * The value rule on one captured string (bodies, header, query and bind
 * values, payloads, statements, attributes), query strings kept.
 */
export function redactValue(text: string, options: RedactOptions = {}): string {
  if (!text) return text
  const sql = options.sql === true
  if (!sql) {
    const json = maskJsonInText(text)
    if (json !== undefined) return json
  }
  let out = text
  if (out.includes('eyJ')) out = out.replace(JWT, REDACTED)
  if (BEARER_HINT.test(out)) out = out.replace(BEARER, `$1 ${REDACTED}`)
  if (out.includes('@')) {
    if (out.includes('://')) out = redactUserinfo(out)
  }
  if (out.includes('=') || out.includes(':'))
    out = redactPairs(out, { sql, json: false })
  if (DIGITS5.test(out)) {
    out = out.replace(THAI_ID, (match, ...groups: string[]) =>
      isThaiNationalId(groups.slice(0, 5).join('')) ? REDACTED : match,
    )
  }
  return out
}

/** Free text of log lines: the value rule, and query strings of URLs and paths removed. */
export function redactText(text: string): string {
  return redactValue(text.includes('?') ? text.replace(URL_QUERY, '$1') : text)
}

/** A 13-digit integer is masked when it is a valid Thai national ID. */
export function maskNumber(value: number): number | string {
  return Number.isInteger(value) &&
    value >= 1e12 &&
    value < 1e13 &&
    isThaiNationalId(String(value))
    ? REDACTED
    : value
}

/** An object key holding a national ID (a map keyed by citizen id) gets the value rule too. */
function maskKey(key: string): string {
  return DIGITS5.test(key) ? redactValue(key) : key
}

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function renameKeys(
  record: Record<string, unknown>,
  renamed: Map<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(record)) {
    let name = renamed.get(key) ?? key
    for (let n = 2; renamed.has(key) && hasOwn(out, name); n++)
      name = `${renamed.get(key)}#${n}`
    out[name] = record[key]
  }
  return out
}

/** Both rules on what JSON.parse returned (no cycles, Dates or buffers), in place. */
function maskParsed(
  value: unknown,
  depth: number,
  state: { changed: boolean },
): unknown {
  if (typeof value === 'string') {
    const masked = redactValue(value)
    if (masked !== value) state.changed = true
    return masked
  }
  if (typeof value === 'number') {
    const masked = maskNumber(value)
    if (masked !== value) state.changed = true
    return masked
  }
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) {
    state.changed = true
    return '[…]'
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++)
      value[i] = maskParsed(value[i], depth + 1, state)
    return value
  }
  const record = value as Record<string, unknown>
  let renamed: Map<string, string> | undefined
  for (const key of Object.keys(record)) {
    if (isSensitiveKey(key)) {
      if (record[key] !== REDACTED) {
        record[key] = REDACTED
        state.changed = true
      }
    } else record[key] = maskParsed(record[key], depth + 1, state)
    const name = maskKey(key)
    if (name !== key) (renamed ??= new Map()).set(key, name)
  }
  if (!renamed) return record
  state.changed = true
  return renameKeys(record, renamed)
}

/** Both rules on a parsed JSON value; returns the masked value (the input is changed in place). */
export function maskJsonValue(value: unknown): unknown {
  return maskParsed(value, 0, { changed: false })
}

/**
 * A JSON text, re-serialised compact. `complete` false (cut at the body cap)
 * or not valid JSON (a BOM, single quotes, comments, NDJSON): a tolerant scan
 * that masks values by their key and the value rule all the same, then every
 * `"name": value` pair with a sensitive name once more (it fails closed
 * where the scan could not follow the structure).
 */
export function maskJsonText(text: string, complete = true): string {
  let start = 0
  while (
    start < text.length &&
    (text.charCodeAt(start) <= 32 || text.charCodeAt(start) === 0xfeff)
  )
    start++
  const body = start ? text.slice(start) : text
  if (complete) {
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      return maskJsonLoose(body)
    }
    return JSON.stringify(maskParsed(parsed, 0, { changed: false }))
  }
  return maskJsonLoose(body)
}

interface Frame {
  object: boolean
  /** What may come next: a key (objects), the `:` after it, a value, or the `,` / closer after one. */
  phase: 'key' | 'colon' | 'value' | 'after'
  sensitive: boolean
}

function bareEnd(text: string, start: number): number {
  let end = start
  while (end < text.length) {
    const c = text[end]
    if (
      c === ',' ||
      c === '}' ||
      c === ']' ||
      c === ':' ||
      c === '{' ||
      c === '[' ||
      c === '"' ||
      c === "'" ||
      c === ' ' ||
      c === '\n' ||
      c === '\r' ||
      c === '\t' ||
      c === '﻿' ||
      (c === '/' && (text[end + 1] === '*' || text[end + 1] === '/'))
    ) {
      break
    }
    end++
  }
  return end === start ? start + 1 : end
}

function nextChar(text: string, from: number): string | undefined {
  for (let i = from; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c > 32 && c !== 0xfeff) return text[i]
  }
  return undefined
}

/** The text of a string token: JSON escapes decoded for double quotes when it is whole. */
function tokenText(
  token: string,
  quote: string,
  whole: boolean,
): string | undefined {
  const inner = whole ? token.slice(1, -1) : token.slice(1)
  if (quote !== '"' || !whole || !inner.includes('\\')) return inner
  try {
    return JSON.parse(token) as string
  } catch {
    return undefined
  }
}

function maskStringToken(token: string, quote: string, whole: boolean): string {
  const value = tokenText(token, quote, whole)
  if (value === undefined) return redactValue(token)
  const masked = redactValue(value)
  if (masked === value) return token
  if (!whole) return `${quote}${masked}`
  return quote === '"'
    ? JSON.stringify(masked)
    : `'${masked.replace(/'/g, "\\'")}'`
}

function maskJsonLoose(text: string): string {
  const out: string[] = []
  const stack: Frame[] = []
  const n = text.length
  // Set when the text stops following JSON's structure (stray closers, a value where a key belongs …):
  // then every sensitive "name": value pair is masked once more at the end.
  let lost = false
  const valueDone = (frame: Frame | undefined) => {
    if (frame) frame.phase = 'after'
  }
  let i = 0
  while (i < n) {
    const c = text[i]
    const frame = stack[stack.length - 1]
    const phase = frame?.phase ?? 'value'
    // A value right after a key whose `:` is missing is still that key's value.
    const sensitive =
      !!frame &&
      frame.object &&
      frame.sensitive &&
      (phase === 'value' || phase === 'colon')
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\uFEFF') {
      i++
    } else if (c === '/' && (text[i + 1] === '*' || text[i + 1] === '/')) {
      // A comment (JSON5 / JSONC): left out.
      const end =
        text[i + 1] === '*' ? text.indexOf('*/', i + 2) : lineEnd(text, i)
      i = end === -1 ? n : text[i + 1] === '*' ? end + 2 : end
    } else if (c === '{' || c === '[') {
      if (phase !== 'value') lost = true
      if (sensitive) {
        out.push(QUOTED_REDACTED)
        valueDone(frame)
        i = containerEnd(text, i)
      } else {
        out.push(c)
        stack.push({
          object: c === '{',
          phase: c === '{' ? 'key' : 'value',
          sensitive: false,
        })
        i++
      }
    } else if (c === '}' || c === ']') {
      out.push(c)
      if (
        !frame ||
        frame.object !== (c === '}') ||
        (frame.object && phase !== 'after' && phase !== 'key')
      )
        lost = true
      stack.pop()
      valueDone(stack[stack.length - 1])
      i++
    } else if (c === ',') {
      out.push(c)
      if (frame) {
        if (phase !== 'after') lost = true
        frame.phase = frame.object ? 'key' : 'value'
        frame.sensitive = false
      }
      i++
    } else if (c === ':') {
      out.push(c)
      if (frame?.phase === 'colon') frame.phase = 'value'
      else lost = true
      i++
    } else if (c === '"' || c === "'") {
      const end = quoteEnd(text, i, c)
      const whole = end !== -1
      const token = whole ? text.slice(i, end + 1) : text.slice(i)
      // A key, also one after a value whose `,` is missing.
      const keyAfterValue =
        phase === 'after' && whole && nextChar(text, end + 1) === ':'
      if (frame?.object && (phase === 'key' || keyAfterValue)) {
        if (keyAfterValue) lost = true
        const key = tokenText(token, c, whole) ?? token
        frame.sensitive = isSensitiveKey(key)
        frame.phase = 'colon'
        const name = maskKey(key)
        out.push(name === key ? token : JSON.stringify(name))
      } else {
        if (phase !== 'value') lost = true
        out.push(sensitive ? QUOTED_REDACTED : maskStringToken(token, c, whole))
        valueDone(frame)
      }
      i = whole ? end + 1 : n
    } else {
      // A number, true / false / null, or an unquoted key (JSON5).
      const end = bareEnd(text, i)
      const token = text.slice(i, end)
      if (frame?.object && phase === 'key' && nextChar(text, end) === ':') {
        frame.sensitive = isSensitiveKey(token)
        frame.phase = 'colon'
        out.push(token)
      } else {
        if (phase !== 'value') lost = true
        out.push(
          sensitive ||
            (/^\d{13}$/.test(token) && maskNumber(Number(token)) === REDACTED)
            ? QUOTED_REDACTED
            : token,
        )
        valueDone(frame)
      }
      i = end
    }
  }
  const masked = out.join('')
  return lost ? redactPairs(masked, { sql: false, json: true }) : masked
}

/** Plain JSON-able copy of any value with both rules applied (cycles → "[Circular]"). */
export function maskObject(value: unknown): unknown {
  return maskInner(value, 0, new WeakSet())
}

function maskInner(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (typeof value === 'string') return redactValue(value)
  if (typeof value === 'number') return maskNumber(value)
  if (typeof value === 'bigint') return redactValue(value.toString())
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (value instanceof Uint8Array) return `[${value.byteLength} bytes]`
  if (depth >= MAX_DEPTH) return '[…]'
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  try {
    if (Array.isArray(value))
      return value.map((item) => maskInner(item, depth + 1, seen))
    const source =
      value instanceof Map
        ? Object.fromEntries(value)
        : typeof (value as { toJSON?: unknown }).toJSON === 'function'
          ? (value as { toJSON: () => unknown }).toJSON()
          : value
    if (source !== value) return maskInner(source, depth + 1, seen)
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (item === undefined || typeof item === 'function') continue
      let name = maskKey(key)
      for (let n = 2; name !== key && hasOwn(out, name); n++)
        name = `${maskKey(key)}#${n}`
      out[name] = isSensitiveKey(key)
        ? REDACTED
        : maskInner(item, depth + 1, seen)
    }
    return out
  } finally {
    seen.delete(value)
  }
}

/** At most `maxBytes` UTF-8 bytes, cut on a character boundary. */
export function truncateUtf8(
  text: string,
  maxBytes: number,
): { text: string; truncated: boolean } {
  if (text.length * 3 <= maxBytes || Buffer.byteLength(text) <= maxBytes)
    return { text, truncated: false }
  const cut = Buffer.from(text.slice(0, maxBytes), 'utf8')
    .subarray(0, maxBytes)
    .toString('utf8')
  return { text: cut.replace(/�+$/, ''), truncated: true }
}
