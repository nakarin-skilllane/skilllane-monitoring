import {
  isSensitiveHeader,
  isSensitiveKey,
  isSensitiveQueryName,
  REDACTED,
} from './keys'
import { redactValue } from './value'

/**
 * Query strings and form bodies, URLs, header maps (cookie names and
 * Set-Cookie attributes kept, their values masked), XML / HTML (a sensitive
 * tag name, or a `name=` / `key=` attribute, masks the element's text and its
 * `value=`), CSV (the columns under a sensitive header).
 */

function decodeComponent(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '))
  } catch {
    return text
  }
}

function encodeComponent(text: string): string {
  return encodeURIComponent(text).replace(/%5BREDACTED%5D/g, REDACTED)
}

/**
 * A query string or form-urlencoded body (no leading `?`): a pair whose name
 * is sensitive (the key rule, and `code`, `key`, `ticket`) gets `[REDACTED]`,
 * other values the value rule; untouched pairs keep their original encoding.
 */
export function maskQuery(query: string): string {
  if (!query) return query
  return query
    .split('&')
    .map((pair) => {
      if (!pair) return pair
      const index = pair.indexOf('=')
      const rawName = index === -1 ? pair : pair.slice(0, index)
      const name = decodeComponent(rawName)
      if (isSensitiveQueryName(name)) return `${rawName}=${REDACTED}`
      if (index === -1) {
        const masked = redactValue(name)
        return masked === name ? pair : encodeComponent(masked)
      }
      const value = decodeComponent(pair.slice(index + 1))
      const masked = redactValue(value)
      return masked === value ? pair : `${rawName}=${encodeComponent(masked)}`
    })
    .join('&')
}

/**
 * A URL or path: userinfo, the path (`;jsessionid=`, a JWT) by the value
 * rule, the query by maskQuery, a fragment with pairs (`#access_token=`) too.
 */
export function maskUrl(url: string): string {
  if (!url) return url
  const hash = url.indexOf('#')
  const queryAt = url.indexOf('?')
  const query = queryAt !== -1 && (hash === -1 || queryAt < hash) ? queryAt : -1
  const pathEnd = query !== -1 ? query : hash !== -1 ? hash : url.length
  let out = redactValue(url.slice(0, pathEnd))
  if (query !== -1)
    out += `?${maskQuery(url.slice(query + 1, hash === -1 ? url.length : hash))}`
  if (hash !== -1) {
    const fragment = url.slice(hash + 1)
    out += `#${fragment.includes('=') ? maskQuery(fragment) : redactValue(fragment)}`
  }
  return out
}

/** `a=1; sid=2` → `a=[REDACTED]; sid=[REDACTED]`: cookie names stay readable. */
export function maskCookie(value: string): string {
  return value
    .split(';')
    .map((part) => {
      const index = part.indexOf('=')
      if (index === -1)
        return part.trim()
          ? `${part.startsWith(' ') ? ' ' : ''}${REDACTED}`
          : part
      return `${part.slice(0, index)}=${REDACTED}`
    })
    .join(';')
}

/** `sid=abc; Path=/; HttpOnly` → `sid=[REDACTED]; Path=/; HttpOnly` (several cookies joined by `, ` too). */
export function maskSetCookie(value: string): string {
  return value
    .split(/,\s*(?=[^;,=\s]+=)/)
    .map((cookie) => {
      const semicolon = cookie.indexOf(';')
      const first = semicolon === -1 ? cookie : cookie.slice(0, semicolon)
      const attributes = semicolon === -1 ? '' : cookie.slice(semicolon)
      const index = first.indexOf('=')
      const name = index === -1 ? '' : first.slice(0, index)
      return `${name ? `${name}=` : ''}${REDACTED}${redactValue(attributes)}`
    })
    .join(', ')
}

const URLISH = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/)/i

/** One header value of `name` (already lower case for HTTP). */
export function maskHeaderValue(name: string, value: string): string {
  const lower = name.toLowerCase()
  if (lower === 'set-cookie') return maskSetCookie(value)
  if (lower === 'cookie') return maskCookie(value)
  if (isSensitiveHeader(name)) return REDACTED
  if (URLISH.test(value) && (value.includes('?') || value.includes('#')))
    return maskUrl(value)
  return redactValue(value)
}

export type HeaderMap = Record<string, string | string[]>

function headerText(value: unknown): string {
  if (value instanceof Uint8Array)
    return Buffer.from(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    ).toString('utf8')
  return String(value)
}

/**
 * String or string[] values, both rules. Names lower-case (HTTP); `lowerCase`
 * false keeps them (Kafka / AMQP headers and job options are case-sensitive).
 */
export function maskHeaders(
  headers: Record<string, unknown> | undefined | null,
  lowerCase = true,
): HeaderMap {
  const out: HeaderMap = {}
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (value === undefined || value === null) continue
    const key = lowerCase ? name.toLowerCase() : name
    const values = (Array.isArray(value) ? value : [value]).map(headerText)
    const masked = values.map((item) => maskHeaderValue(key, item))
    const before = out[key]
    const all =
      before === undefined
        ? masked
        : [...([] as string[]).concat(before), ...masked]
    out[key] = all.length === 1 ? all[0] : all
  }
  return out
}

// <tag attrs>text</tag>, the text possibly CDATA (one character or one CDATA section at a time: linear).
const XML_ELEMENT =
  /<([A-Za-z_][\w:.-]*)(\s[^<>]*)?>((?:[^<]|<!\[CDATA\[[\s\S]*?\]\]>)*)<\/\1>/g
const START_TAG = /<([A-Za-z_][\w:.-]*)(\s[^<>]*?)(\/?)>/g
const NAME_ATTRIBUTE =
  /(?:^|\s)(?:name|key|id|field|param|property)\s*=\s*(["'])([^"']*)\1/i
const VALUE_ATTRIBUTE = /(\s(?:value|content)\s*=\s*)(["'])[^"']*\2/gi

function namedSecret(attrs: string | undefined): boolean {
  if (!attrs) return false
  const name = NAME_ATTRIBUTE.exec(attrs)
  return !!name && isSensitiveKey(name[2])
}

/**
 * XML / HTML: an element whose tag name is sensitive, or whose `name=` /
 * `key=` attribute is (`<Field name="password">`, `<entry key="token">`), loses
 * its text; such a tag's `value=` / `content=` attribute too (`<input
 * name="password" value="…">`). Attribute pairs get the value rule later.
 */
export function maskMarkup(text: string): string {
  if (!text.includes('<')) return text
  return text
    .replace(XML_ELEMENT, (match, tag: string, attrs: string | undefined) =>
      isSensitiveKey(tag) || namedSecret(attrs)
        ? `<${tag}${attrs ?? ''}>${REDACTED}</${tag}>`
        : match,
    )
    .replace(START_TAG, (match, tag: string, attrs: string, close: string) =>
      namedSecret(attrs)
        ? `<${tag}${attrs.replace(VALUE_ATTRIBUTE, `$1$2${REDACTED}$2`)}${close}>`
        : match,
    )
}

/** Cells of one CSV line, as written (quotes kept), so a join gives the line back. */
function csvCells(line: string, separator: string): string[] {
  const cells: string[] = []
  let start = 0
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') quoted = !quoted
    else if (c === separator && !quoted) {
      cells.push(line.slice(start, i))
      start = i + 1
    }
  }
  cells.push(line.slice(start))
  return cells
}

function unquote(cell: string): string {
  const trimmed = cell.trim()
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).replace(/""/g, '"')
    : trimmed
}

/** CSV / TSV: the cells under a header whose name is sensitive. */
export function maskCsv(text: string): string {
  const parts = text.split(/(\r?\n)/)
  const header = parts[0] ?? ''
  const separator = [',', ';', '\t', '|'].reduce((best, candidate) =>
    header.split(candidate).length > header.split(best).length
      ? candidate
      : best,
  )
  const secret = csvCells(header, separator).map((cell) =>
    isSensitiveKey(unquote(cell)),
  )
  if (!secret.some(Boolean)) return text
  for (let i = 2; i < parts.length; i += 2) {
    if (!parts[i]) continue
    const cells = csvCells(parts[i], separator)
    parts[i] = cells
      .map((cell, index) => (secret[index] ? REDACTED : cell))
      .join(separator)
  }
  return parts.join('')
}

// A route parameter: Express `:token` / `:token?`, OpenAPI / Fastify `{token}`.
const ROUTE_PARAM = /^(?::([A-Za-z0-9_$]+)\??|\{([A-Za-z0-9_$]+)\})$/

/**
 * A path under its route template: a segment whose route parameter name is
 * sensitive becomes [REDACTED] (`/reset-password/abc` under
 * `/reset-password/:token`). The query, if any, is left to the caller.
 */
export function maskPathByRoute(
  path: string,
  route: string | undefined | null,
): string {
  if (!route || !path || !route.includes('/')) return path
  const routeParts = route.split('/')
  if (!routeParts.some((part) => ROUTE_PARAM.test(part))) return path
  const query = path.search(/[?#]/)
  const pathname = query === -1 ? path : path.slice(0, query)
  const rest = query === -1 ? '' : path.slice(query)
  const parts = pathname.split('/')
  let changed = false
  for (let i = 0; i < Math.min(parts.length, routeParts.length); i++) {
    const param = ROUTE_PARAM.exec(routeParts[i])
    const name = param?.[1] ?? param?.[2]
    if (name && parts[i] && parts[i] !== REDACTED && isSensitiveKey(name)) {
      parts[i] = REDACTED
      changed = true
    }
  }
  return changed ? `${parts.join('/')}${rest}` : path
}

/** `user:password@host` without a scheme (a dependency host, a DSN): the password. */
export function maskEndpoint(text: string): string {
  return redactValue(text).replace(
    /^([^\s:@/]*):([^\s@/]+)@/,
    (match, user: string, password: string) =>
      password === REDACTED ? match : `${user}:${REDACTED}@`,
  )
}
