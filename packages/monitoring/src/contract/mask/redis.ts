import { isSensitiveKey, REDACTED } from './keys'
import { maskJsonText, redactValue, truncateUtf8 } from './value'

/**
 * A Redis command as `db.query.text`: every argument, masked, quoted the way
 * redis-cli reads it (an argument with spaces or quotes in '…' or "…"), so
 * the stored command shows where each argument ends and can be pasted.
 * Masked: AUTH / HELLO AUTH / MIGRATE AUTH / AUTH2 / CONFIG SET credentials,
 * ACL passwords; a key whose prefix segment is a secret keeps the prefix
 * (`session:[REDACTED]`, `password_reset:[REDACTED]`); every value stored under
 * a sensitive key or hash / stream field (`SET refresh:u1 …`, `HSET user:1 pin
 * …`, `XADD events * password …`), EVAL arguments when one of its keys is
 * sensitive; every other argument by the value rule (JSON by key). At most
 * `maxBytes` of the command is ever looked at: arguments are cut to the room
 * left before they are masked, the rest only counted.
 */

const KEY_VALUE =
  /^(set|setnx|setex|psetex|getset|append|setrange|lpush|rpush|lpushx|rpushx|lset|linsert|lrem|sadd|srem|sismember|smismember|zadd|zrem|publish|spublish|pfadd)$/i
const FIELD_VALUE = /^(hset|hsetnx|hmset)$/i
const PAIRS = /^(mset|msetnx)$/i
const EVAL = /^(eval|evalsha|eval_ro|evalsha_ro|fcall|fcall_ro)$/i
const SET_OPTIONS = /^(EX|PX|EXAT|PXAT|NX|XX|KEEPTTL|GET)$/i
// Key prefixes that hold a token after them: reset:<token>, verify:<token>, magic:<token>.
const SECRET_PREFIXES = new Set([
  'pwreset',
  'reset',
  'verify',
  'verification',
  'magic',
  'invite',
  'confirm',
  'csrf',
  'nonce',
])
const KEYLIKE = /^[^\s"'{}[\]]+$/
const CONTROL = /[\u0000-\u001f\u007f]/
const CONTROL_ALL = /[\u0000-\u001f\u007f]/g
const BINARY = /[\u0000-\u0008\u000e-\u001f\uFFFD]/

interface Piece {
  text: string
  /** Cut to the room left. */
  cut: boolean
  /** `<N bytes>`: not text. */
  binary: boolean
}

function piece(arg: unknown, room: number): Piece {
  if (arg instanceof Uint8Array) {
    const bytes = Buffer.from(arg.buffer, arg.byteOffset, arg.byteLength)
    const head = bytes.length > room ? bytes.subarray(0, room) : bytes
    const text = head.toString('utf8')
    // A cut may split the last character: only the start decides.
    if (BINARY.test(text.slice(0, Math.max(0, text.length - 1))))
      return { text: `<${bytes.length} bytes>`, cut: false, binary: true }
    return {
      text: bytes.length > room ? text.replace(/\uFFFD+$/, '') : text,
      cut: bytes.length > room,
      binary: false,
    }
  }
  const text =
    typeof arg === 'string'
      ? arg
      : arg === undefined || arg === null
        ? ''
        : String(arg)
  return text.length > room
    ? { text: text.slice(0, room), cut: true, binary: false }
    : { text, cut: false, binary: false }
}

/** ioredis passes nested arrays and objects (HMSET k {…}) as they were given. */
function* flatten(args: unknown[]): Generator<unknown> {
  for (const arg of args) {
    if (Array.isArray(arg)) yield* flatten(arg)
    else if (arg instanceof Map)
      for (const [key, value] of arg) yield* [key, value]
    else if (arg && typeof arg === 'object' && !(arg instanceof Uint8Array)) {
      for (const [key, value] of Object.entries(arg)) yield* [key, value]
    } else yield arg
  }
}

/** `session:abc` → `session:[REDACTED]`: a key segment that is a secret masks the rest. */
export function maskRedisKey(key: string): string {
  if (!key.includes(':') || !KEYLIKE.test(key)) return key
  const segments = key.split(':')
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]
    if (
      segment &&
      (isSensitiveKey(segment) || SECRET_PREFIXES.has(segment.toLowerCase()))
    ) {
      const rest = segments.slice(i + 1).join(':')
      return rest === REDACTED
        ? key
        : `${segments.slice(0, i + 1).join(':')}:${REDACTED}`
    }
  }
  return key
}

/**
 * An id built like a key (a BullMQ job id, a Kafka message key, a message id:
 * `reset:<email>:<token>`, `session:<id>`): the key-segment rule, then the
 * value rule.
 */
export function maskIdentifier(text: string): string {
  return redactValue(maskRedisKey(text))
}

/** A key that holds a secret: the key rule on it, or a secret prefix segment. */
export function isSensitiveRedisKey(key: string | undefined): boolean {
  if (!key) return false
  return isSensitiveKey(key) || maskRedisKey(key) !== key
}

function maskArg(text: string, cut: boolean): string {
  const key = maskRedisKey(text)
  if (key !== text) return key
  if (cut) {
    const first = text.trimStart()[0]
    if (first === '{' || first === '[') return maskJsonText(text, false)
  }
  return redactValue(text)
}

/** How redis-cli reads it back: bare, '…' (nothing escaped), or "…" with \" \\ \n \xHH. */
export function quoteRedisArg(text: string): string {
  if (text === '') return '""'
  const control = CONTROL.test(text)
  if (!control && !/[\s"'\\]/.test(text)) return text
  if (!control && !text.includes("'") && !text.endsWith('\\'))
    return `'${text}'`
  const escaped = text
    .replace(/[\\"]/g, '\\$&')
    .replace(CONTROL_ALL, (c) =>
      c === '\n'
        ? '\\n'
        : c === '\r'
          ? '\\r'
          : c === '\t'
            ? '\\t'
            : `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`,
    )
  return `"${escaped}"`
}

/** Under a sensitive key: the key, SETEX's seconds and SET's options stay. */
function keepsArg(command: string, args: string[], index: number): boolean {
  if (index === 0) return true
  if ((command === 'setex' || command === 'psetex') && index === 1) return true
  return (
    command === 'set' &&
    index >= 2 &&
    (SET_OPTIONS.test(args[index]) ||
      /^(EX|PX|EXAT|PXAT)$/i.test(args[index - 1]))
  )
}

function maskArgs(command: string, args: string[], cut: boolean[]): string[] {
  const value = (i: number) => maskArg(args[i], cut[i])
  if (command === 'auth') return args.map(() => REDACTED)
  if (command === 'hello') {
    const auth = args.findIndex((arg) => arg.toLowerCase() === 'auth')
    return args.map((arg, i) =>
      auth !== -1 && i > auth && i <= auth + 2 ? REDACTED : arg,
    )
  }
  if (command === 'config' && args[0]?.toLowerCase() === 'set') {
    // CONFIG SET requirepass x masterauth y
    return args.map((arg, i) =>
      i >= 2 &&
      i % 2 === 0 &&
      (isSensitiveKey(args[i - 1]) || /pass|auth/i.test(args[i - 1]))
        ? REDACTED
        : arg,
    )
  }
  // ACL SETUSER name on >password #hash
  if (command === 'acl')
    return args.map((arg) => (/^[>#<!]/.test(arg) ? REDACTED : arg))
  if (command === 'migrate') {
    // MIGRATE host port key db timeout [COPY] [REPLACE] [AUTH password | AUTH2 user password] [KEYS …]
    return args.map((arg, i) => {
      const before = args[i - 1]?.toUpperCase()
      if (before === 'AUTH' || args[i - 2]?.toUpperCase() === 'AUTH2')
        return REDACTED
      return before === 'AUTH2' ? arg : maskRedisKey(arg)
    })
  }
  if (EVAL.test(command)) {
    // EVAL script numkeys key … arg …: the arguments of a script that touches a secret key are masked.
    const numkeys = Number(args[1])
    const keyCount = Number.isInteger(numkeys) && numkeys >= 0 ? numkeys : 0
    const secret = args.slice(2, 2 + keyCount).some(isSensitiveRedisKey)
    return args.map((arg, i) => {
      if (i < 2) return arg
      if (i < 2 + keyCount) return maskRedisKey(arg)
      return secret ? REDACTED : value(i)
    })
  }
  if (KEY_VALUE.test(command) && isSensitiveRedisKey(args[0])) {
    return args.map((arg, i) =>
      keepsArg(command, args, i)
        ? i === 0
          ? maskRedisKey(arg)
          : arg
        : REDACTED,
    )
  }
  if (FIELD_VALUE.test(command)) {
    const secretKey = isSensitiveRedisKey(args[0])
    return args.map((arg, i) => {
      if (i === 0) return maskRedisKey(arg)
      if (i % 2 === 1) return arg
      return secretKey || isSensitiveKey(args[i - 1]) ? REDACTED : value(i)
    })
  }
  if (command === 'xadd') {
    // XADD key [NOMKSTREAM] [MAXLEN|MINID [=|~] threshold [LIMIT count]] id field value …
    let i = 1
    if (args[i]?.toUpperCase() === 'NOMKSTREAM') i++
    if (/^(MAXLEN|MINID)$/i.test(args[i] ?? '')) {
      i++
      if (args[i] === '=' || args[i] === '~') i++
      i++
      if (args[i]?.toUpperCase() === 'LIMIT') i += 2
    }
    const id = i
    const secretKey = isSensitiveRedisKey(args[0])
    return args.map((arg, k) => {
      if (k === 0) return maskRedisKey(arg)
      if (k <= id || (k - id) % 2 === 1) return arg
      return secretKey || isSensitiveKey(args[k - 1]) ? REDACTED : value(k)
    })
  }
  if (PAIRS.test(command)) {
    return args.map((arg, i) =>
      i % 2 === 0
        ? maskRedisKey(arg)
        : isSensitiveRedisKey(args[i - 1])
          ? REDACTED
          : value(i),
    )
  }
  return args.map((_, i) => value(i))
}

export function redisCommand(
  name: string,
  rawArgs: unknown,
  maxBytes: number,
): string {
  const command = String(name)
  const lower = command.toLowerCase()
  let room = maxBytes - Buffer.byteLength(command)
  const args: string[] = []
  const cut: boolean[] = []
  const binary: boolean[] = []
  let omitted = 0
  for (const arg of flatten(Array.isArray(rawArgs) ? rawArgs : [])) {
    if (room <= 0) {
      omitted++
      continue
    }
    const part = piece(arg, room)
    args.push(part.text)
    cut.push(part.cut)
    binary.push(part.binary)
    room -= Buffer.byteLength(part.text) + 1
  }
  const masked = maskArgs(lower, args, cut)
  // Whole quoted arguments only: one that does not fit is cut inside its quotes and marked.
  const limit = maxBytes - MARK_RESERVE
  let out = command
  let bytes = Buffer.byteLength(out)
  for (let i = 0; i < masked.length; i++) {
    const text = binary[i] ? masked[i] : quoteRedisArg(masked[i])
    const more = cut[i]
    const size = Buffer.byteLength(text) + 1
    if (bytes + size > limit) {
      const kept = binary[i]
        ? ''
        : truncateUtf8(masked[i], Math.max(0, limit - bytes - 8)).text
      omitted += masked.length - i - (kept ? 1 : 0)
      out += kept ? ` ${quoteRedisArg(kept)} …` : ' …'
      break
    }
    out += ` ${text}${more ? ' …' : ''}`
    bytes += size + (more ? 2 : 0)
  }
  if (omitted) out += ` (${omitted} more)`
  return truncateUtf8(out, maxBytes).text
}

const MARK_RESERVE = 32
