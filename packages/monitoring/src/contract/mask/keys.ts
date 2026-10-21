/**
 * The key rule: which object keys, form / query / bind parameter names,
 * columns, header names, hash fields and Redis key segments hold a secret.
 * One copy for the SDK (skilllane-monitoring masks before anything leaves the app),
 * the engine (fallback for other senders). SPEC.md §3 of the engine repository.
 */

export const REDACTED = '[REDACTED]'

/**
 * Version of these rules. The SDK writes it into every envelope's resource
 * (`skilllane.monitoring.mask`); the engine masks items of a sender without it (another SDK,
 * an older skilllane-monitoring) itself, and trusts items of this version or later.
 */
export const MASK_VERSION = 2
export const MASK_RESOURCE_KEY = 'skilllane.monitoring.mask'

/** A key whose lower case contains one of these is sensitive (school-core-api's list, and more). */
export const SENSITIVE_KEYS = [
  'password',
  'confirmpassword',
  'token',
  'secret',
  'authorization',
  'cookie',
  'session',
  'passwd',
  'pwd',
  'apikey',
  'api_key',
  'api-key',
  'credential',
  'privatekey',
  'private_key',
]

/** A key with one of these as a whole word is sensitive (PASS_WORD, pin, x-otp, authCode, x-signature). */
export const SENSITIVE_WORDS = [
  'pass',
  'pw',
  'pwd',
  'pin',
  'otp',
  'totp',
  'cvv',
  'cvc',
  'passcode',
  'passphrase',
  'sid',
  'sess',
  'sig',
  'signature',
  'auth',
  'authentication',
  'oauth',
  'jwt',
  'refresh',
  'creds',
]

/** A last word `key` with one of these before it: apiKey, x-access-key, private-key, clientKey. */
const KEY_QUALIFIERS = new Set([
  'api',
  'access',
  'secret',
  'private',
  'client',
  'signing',
  'encryption',
  'master',
  'ssh',
  'hmac',
  'jwt',
  'license',
])

/**
 * A last word that makes a key of two or more words metadata about a secret,
 * not the secret: tokenType, passwordChangedAt, PASSWORD_CHANGED_AT,
 * sessionTimeout, cookieConsent. The value rule still applies to its value.
 * (`header` is not one: `authHeader` usually holds the credential itself.)
 */
export const METADATA_WORDS = [
  'type',
  'at',
  'date',
  'time',
  'ts',
  'changed',
  'updated',
  'created',
  'expires',
  'expiry',
  'expired',
  'exp',
  'ttl',
  'timeout',
  'interval',
  'period',
  'length',
  'min',
  'max',
  'policy',
  'required',
  'enabled',
  'count',
  'strength',
  'hint',
  'name',
  'consent',
  'format',
  'version',
]

/** Header names whose values are always masked. */
export const SENSITIVE_HEADERS = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
]

/** Names that are credentials in a query string or form only: an OAuth `code`, an API `key`, a CAS `ticket`. */
export const SENSITIVE_QUERY_NAMES = ['code', 'key', 'ticket']

const WORDS = new Set(SENSITIVE_WORDS)
const METADATA = new Set(METADATA_WORDS)
const QUERY_NAMES = new Set(SENSITIVE_QUERY_NAMES)
const HEADERS = new Set(SENSITIVE_HEADERS)
const QUALIFIED_KEY = new RegExp(`^(${[...KEY_QUALIFIERS].join('|')})key$`)

/** camelCase, `_`, `-`, `.`, `:` and any other separator split a key into lower-case words. */
export function keyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function judge(key: string): boolean {
  const words = keyWords(key)
  const last = words[words.length - 1]
  if (words.length > 1 && METADATA.has(last)) return false
  const lower = key.toLowerCase()
  if (SENSITIVE_KEYS.some((word) => lower.includes(word))) return true
  if (words.some((word) => WORDS.has(word))) return true
  if (last === 'key') return words.some((word) => KEY_QUALIFIERS.has(word))
  return words.length === 1 && QUALIFIED_KEY.test(last)
}

// Keys repeat across the rows of a body: verdicts of short keys are kept.
// Only short keys, and a flat copy of each: a key sliced from a body would
// keep the whole body text alive.
const verdicts = new Map<string, boolean>()
const CACHE_MAX = 10_000
const CACHE_KEY_MAX = 64

function flat(text: string): string {
  return text.length < 13 ? text : (JSON.parse(JSON.stringify(text)) as string)
}

export function isSensitiveKey(key: string | undefined | null): boolean {
  if (!key) return false
  const known = verdicts.get(key)
  if (known !== undefined) return known
  const verdict = judge(key)
  if (key.length <= CACHE_KEY_MAX) {
    if (verdicts.size >= CACHE_MAX) verdicts.clear()
    verdicts.set(flat(key), verdict)
  }
  return verdict
}

/** A query-string or form-field name: the key rule, and `code`, `key`, `ticket`. */
export function isSensitiveQueryName(name: string | undefined | null): boolean {
  if (!name) return false
  return QUERY_NAMES.has(name.toLowerCase()) || isSensitiveKey(name)
}

/** A header name: authorization, proxy-authorization, cookie, set-cookie, or the key rule. */
export function isSensitiveHeader(name: string | undefined | null): boolean {
  if (!name) return false
  return HEADERS.has(name.toLowerCase()) || isSensitiveKey(name)
}
