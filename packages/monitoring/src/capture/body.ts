import * as zlib from 'zlib'
import { REDACTED } from '../logger/redact'
import {
  isSensitiveKey,
  maskCsv,
  maskJsonText,
  maskMarkup,
  maskQuery,
  maskText,
  truncateUtf8,
} from './mask'

/**
 * Bodies: a tap that keeps the first LOG_BODY_MAX_BYTES bytes of a stream
 * and counts the rest (never more in memory, never a listener that changes
 * the stream's flow), and the rendering of what it kept into the masked text
 * of `http.*.body` / `messaging.message.body`.
 */

export type BodyKind =
  | 'json'
  | 'form'
  | 'multipart'
  | 'text'
  | 'markup'
  | 'csv'
  | 'binary'
  | 'unknown'

const STREAMING =
  /^(text\/event-stream|multipart\/x-mixed-replace|application\/grpc)/

/** What a content type holds; streaming and binary bodies are not kept. */
export function bodyKind(contentType: string | undefined): BodyKind {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase()
  if (!type) return 'unknown'
  if (STREAMING.test(type)) return 'binary'
  if (type === 'application/json' || /[/+]json$/.test(type)) return 'json'
  if (type === 'application/x-www-form-urlencoded') return 'form'
  if (type === 'multipart/form-data') return 'multipart'
  if (/[/+]xml$/.test(type) || type === 'text/html') return 'markup'
  if (/^(text|application)\/(csv|tab-separated-values)$/.test(type))
    return 'csv'
  if (
    type.startsWith('text/') ||
    /^application\/(javascript|ecmascript|graphql|x-yaml|yaml|csv|sql|x-ndjson)$/.test(
      type,
    )
  ) {
    return 'text'
  }
  return 'binary'
}

export type TapMode = 'keep' | 'count' | 'multipart'

function boundaryOf(contentType: string | undefined): string | undefined {
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType ?? '')
  return match ? (match[1] ?? match[2]) : undefined
}

/** The tap mode for a content type; `skip` (route or binary): size only. */
export function tapMode(
  contentType: string | undefined,
  skip: boolean,
): TapMode {
  if (skip) return 'count'
  const kind = bodyKind(contentType)
  if (kind === 'binary') return 'count'
  if (kind === 'multipart')
    return boundaryOf(contentType) ? 'multipart' : 'count'
  return 'keep'
}

function toBuffer(
  chunk: unknown,
  encoding?: BufferEncoding,
  limit?: number,
): Buffer | undefined {
  if (Buffer.isBuffer(chunk)) return chunk
  if (typeof chunk === 'string') {
    // Never more than the room left: a 10 MB string is not copied whole.
    const text =
      limit !== undefined && chunk.length > limit
        ? chunk.slice(0, limit)
        : chunk
    return Buffer.from(text, encoding ?? 'utf8')
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  }
  return undefined
}

function byteLength(chunk: unknown, encoding?: BufferEncoding): number {
  if (typeof chunk === 'string')
    return Buffer.byteLength(chunk, encoding ?? 'utf8')
  if (chunk instanceof Uint8Array) return chunk.byteLength
  return 0
}

interface Part {
  name?: string
  filename?: string
  type?: string
  size: number
  value?: Buffer[]
  valueBytes: number
}

const FIELD_VALUE_MAX = 1_024
const PART_HEADERS_MAX = 16_384
const PARTS_MAX = 1_000
// Per part in the summary JSON besides its name, value and file name.
const PART_OVERHEAD = 64

/** RFC 5987 / 2231 `name*=UTF-8''pass%77ord`. */
function extendedValue(value: string): string | undefined {
  const match = /^([^']*)'[^']*'(.*)$/.exec(value)
  if (!match) return undefined
  try {
    return decodeURIComponent(match[2])
  } catch {
    return match[2]
  }
}

/** The parameters of a Content-Disposition value (name, filename and their `*` forms, any case). */
function dispositionParams(value: string): Record<string, string> {
  const out: Record<string, string> = {}
  const param = /;\s*([A-Za-z0-9_*-]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/g
  let match: RegExpExecArray | null
  while ((match = param.exec(value)) !== null) {
    const key = match[1].toLowerCase()
    let text = match[2].trim()
    if (text.startsWith('"')) text = text.slice(1, -1).replace(/\\(.)/g, '$1')
    if (key.endsWith('*')) {
      const decoded = extendedValue(text)
      if (decoded !== undefined) out[key.slice(0, -1)] = decoded
    } else out[key] ??= text
  }
  return out
}

/**
 * multipart/form-data, streamed: part names, file names, types and sizes,
 * plus the first KB of each plain field, while the summary stays under the
 * body cap and PARTS_MAX parts. Past that the rest is not parsed at all: its
 * parts are counted by their delimiters and its bytes summed, so the cost of
 * a body with 200,000 fields is that of a search. Holds no more than one
 * delimiter (and one part's headers) between chunks.
 */
class MultipartScanner {
  private readonly delimiter: Buffer
  private carry: Buffer = Buffer.from('\r\n')
  private state:
    | 'preamble'
    | 'delimiter'
    | 'headers'
    | 'body'
    | 'counting'
    | 'done' = 'preamble'
  private part?: Part
  readonly parts: Part[] = []
  private recorded = 0
  private moreParts = 0
  private moreBytes = 0

  constructor(
    boundary: string,
    private readonly budget: number,
  ) {
    this.delimiter = Buffer.from(`\r\n--${boundary}`)
  }

  private finish(part: Part | undefined): void {
    if (!part) return
    this.parts.push(part)
    this.recorded +=
      PART_OVERHEAD +
      (part.name?.length ?? 0) +
      (part.filename?.length ?? 0) +
      (part.type?.length ?? 0) +
      part.valueBytes
  }

  push(chunk: Buffer): void {
    if (this.state === 'counting') {
      this.count(chunk)
      return
    }
    let data = this.carry.length ? Buffer.concat([this.carry, chunk]) : chunk
    this.carry = Buffer.alloc(0)
    while (data.length && this.state !== 'done') {
      if (this.state === 'preamble' || this.state === 'body') {
        const index = data.indexOf(this.delimiter)
        if (index === -1) {
          const safe = Math.max(0, data.length - (this.delimiter.length - 1))
          this.account(data.subarray(0, safe))
          this.carry = Buffer.from(data.subarray(safe))
          return
        }
        this.account(data.subarray(0, index))
        this.finish(this.part)
        this.part = undefined
        data = data.subarray(index + this.delimiter.length)
        this.state = 'delimiter'
      } else if (this.state === 'delimiter') {
        if (data.length < 2) {
          this.carry = Buffer.from(data)
          return
        }
        const next = data.subarray(0, 2).toString('latin1')
        if (next === '--') {
          this.state = 'done'
          return
        }
        if (
          this.recorded + PART_OVERHEAD + FIELD_VALUE_MAX > this.budget ||
          this.parts.length >= PARTS_MAX
        ) {
          // The summary is full: this part and every later one are only counted.
          this.state = 'counting'
          this.moreParts = 1
          this.count(data)
          return
        }
        data = data.subarray(next === '\r\n' ? 2 : 0)
        this.state = 'headers'
      } else {
        const end = data.indexOf('\r\n\r\n')
        if (end === -1) {
          if (data.length > PART_HEADERS_MAX) this.state = 'done'
          else this.carry = Buffer.from(data)
          return
        }
        this.part = this.headers(data.subarray(0, end).toString('utf8'))
        data = data.subarray(end + 4)
        this.state = 'body'
      }
    }
  }

  /** Past the budget: bytes summed, parts counted by their delimiters (the closing one left out). */
  private count(chunk: Buffer): void {
    this.moreBytes += chunk.length
    const data = this.carry.length ? Buffer.concat([this.carry, chunk]) : chunk
    const length = this.delimiter.length
    let from = 0
    for (;;) {
      const index = data.indexOf(this.delimiter, from)
      if (index === -1) break
      if (!(data[index + length] === 0x2d && data[index + length + 1] === 0x2d))
        this.moreParts++
      from = index + length
    }
    const keep = Math.min(data.length - from, length - 1)
    this.carry = Buffer.from(data.subarray(data.length - keep))
  }

  private headers(text: string): Part {
    const part: Part = { size: 0, valueBytes: 0 }
    for (const line of text.split('\r\n')) {
      const index = line.indexOf(':')
      if (index === -1) continue
      const name = line.slice(0, index).trim().toLowerCase()
      const value = line.slice(index + 1).trim()
      if (name === 'content-type') part.type = value.slice(0, 256)
      if (name === 'content-disposition') {
        const params = dispositionParams(value)
        part.name = params.name?.slice(0, 256)
        part.filename = params.filename?.slice(0, 256)
      }
    }
    if (part.filename === undefined) part.value = []
    return part
  }

  private account(bytes: Buffer): void {
    const part = this.part
    if (!part || !bytes.length) return
    part.size += bytes.length
    if (part.value && part.valueBytes < FIELD_VALUE_MAX) {
      const piece = bytes.subarray(0, FIELD_VALUE_MAX - part.valueBytes)
      part.value.push(Buffer.from(piece))
      part.valueBytes += piece.length
    }
  }

  /**
   * JSON summary: { fields: { name: value }, files: [{ name, filename, type,
   * size }] }, and `more: { parts, bytes }` for what came after the budget.
   */
  summary(): string {
    const parts = this.part ? [...this.parts, this.part] : this.parts
    const fields: Record<string, string | string[]> = {}
    const files: Array<Record<string, unknown>> = []
    for (const part of parts) {
      const name = part.name ?? ''
      if (part.filename !== undefined) {
        files.push({
          name,
          filename: maskText(part.filename),
          type: part.type ?? '',
          size: part.size,
        })
        continue
      }
      const raw = Buffer.concat(part.value ?? []).toString('utf8')
      // No readable name: nothing says what it holds, so it is masked.
      const value =
        !part.name || isSensitiveKey(name)
          ? REDACTED
          : maskText(part.size > part.valueBytes ? `${raw}…` : raw)
      const before = fields[name]
      fields[name] =
        before === undefined ? value : ([] as string[]).concat(before, value)
    }
    return JSON.stringify(
      this.moreParts
        ? {
            fields,
            files,
            more: { parts: this.moreParts, bytes: this.moreBytes },
          }
        : { fields, files },
    )
  }
}

/**
 * Collects a body as it passes. `mode` may be a function, decided at the
 * first chunk (a response's content type is known only then). Never throws.
 */
// Chunks under this size are copied into one shared buffer (a body written a
// byte at a time would hold a Buffer object per byte).
const SMALL_CHUNK = 1_024
const STAGE_SIZE = 16_384

export class BodyTap {
  size = 0
  ended = false
  private kept = 0
  private readonly chunks: Buffer[] = []
  private stage?: Buffer
  private staged = 0
  private mode?: TapMode
  private scanner?: MultipartScanner

  constructor(
    private readonly limit: number,
    private readonly decide: TapMode | (() => TapMode),
    private readonly contentType?: () => string | undefined,
  ) {}

  push(chunk: unknown, encoding?: BufferEncoding): void {
    try {
      if (chunk === undefined || chunk === null) return
      if (!this.mode) {
        this.mode =
          typeof this.decide === 'function' ? this.decide() : this.decide
        if (this.mode === 'multipart') {
          const boundary = boundaryOf(this.contentType?.())
          if (boundary)
            this.scanner = new MultipartScanner(boundary, this.limit)
          else this.mode = 'count'
        }
      }
      const length = byteLength(chunk, encoding)
      this.size += length
      if (this.mode === 'count') return
      if (this.mode === 'multipart') {
        const buffer = toBuffer(chunk, encoding)
        if (buffer) this.scanner?.push(buffer)
        return
      }
      const room = this.limit - this.kept
      if (room <= 0) return
      const buffer = toBuffer(chunk, encoding, room)
      if (!buffer) return
      const take = Math.min(buffer.length, room)
      if (take < SMALL_CHUNK) {
        if (!this.stage || this.staged + take > this.stage.length) {
          this.unstage()
          this.stage = Buffer.allocUnsafe(Math.min(STAGE_SIZE, room))
          this.staged = 0
        }
        buffer.copy(this.stage, this.staged, 0, take)
        this.staged += take
      } else {
        this.unstage()
        // A copy: the producer may reuse its buffer, and a slice would keep
        // a large chunk alive until the span ends.
        this.chunks.push(Buffer.from(buffer.subarray(0, take)))
      }
      this.kept += take
    } catch {
      // the stream is never affected
    }
  }

  private unstage(): void {
    if (this.stage && this.staged)
      this.chunks.push(this.stage.subarray(0, this.staged))
    this.stage = undefined
    this.staged = 0
  }

  end(): void {
    this.ended = true
  }

  get counted(): boolean {
    return this.mode === 'count'
  }

  get multipart(): MultipartScanner | undefined {
    return this.scanner
  }

  bytes(): Buffer {
    this.unstage()
    return this.chunks.length === 1
      ? this.chunks[0]
      : Buffer.concat(this.chunks)
  }

  get complete(): boolean {
    return this.kept >= this.size
  }
}

const DECODE_FACTOR = 16

function decodeOnce(
  input: Buffer,
  encoding: string,
  maxOutputLength: number,
): Buffer {
  const flush = { finishFlush: zlib.constants.Z_SYNC_FLUSH, maxOutputLength }
  switch (encoding) {
    case 'gzip':
    case 'x-gzip':
      return zlib.gunzipSync(input, flush)
    case 'deflate':
      try {
        return zlib.inflateSync(input, flush)
      } catch (error) {
        if (error instanceof RangeError) throw error
        return zlib.inflateRawSync(input, flush)
      }
    case 'br':
      return zlib.brotliDecompressSync(input, {
        finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH,
        maxOutputLength,
      })
    case 'identity':
    case '':
      return input
    default:
      throw new Error(`unknown content-encoding ${encoding}`)
  }
}

/**
 * gzip / deflate / br, decoding at most `limit × 16` bytes (no zip bomb):
 * past that, a shorter prefix of the input is decoded. A cut input decodes
 * as far as it goes. undefined when it cannot be decoded.
 */
export function decodeBody(
  input: Buffer,
  contentEncoding: string | undefined,
  limit: number,
): { bytes: Buffer; truncated: boolean } | undefined {
  const encodings = (contentEncoding ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part && part !== 'identity')
  if (!encodings.length) return { bytes: input, truncated: false }
  let truncated = false
  let data = input
  // Applied in order, so undone in reverse.
  for (const encoding of encodings.reverse()) {
    let source = data
    let decoded: Buffer | undefined
    for (let attempt = 0; attempt < 4 && !decoded; attempt++) {
      try {
        decoded = decodeOnce(source, encoding, limit * DECODE_FACTOR)
      } catch (error) {
        if (!(error instanceof RangeError) || source.length < 16)
          return undefined
        source = source.subarray(0, Math.floor(source.length / 4))
        truncated = true
      }
    }
    if (!decoded) return undefined
    data = decoded
  }
  return { bytes: data, truncated }
}

/** No NUL and few replacement / control characters: text. */
function looksLikeText(text: string): boolean {
  const sample = text.slice(0, 2_048)
  if (!sample) return true
  let odd = 0
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i)
    if (c === 0) return false
    if (c === 0xfffd || (c < 32 && c !== 9 && c !== 10 && c !== 13)) odd++
  }
  return odd / sample.length < 0.02
}

/**
 * Bytes → text: a UTF-8 BOM dropped, UTF-16 by its BOM or charset, another
 * charset the content type names (latin1, TIS-620 …) when Node knows it.
 */
function decodeText(bytes: Buffer, contentType: string | undefined): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return bytes.subarray(3).toString('utf8')
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return bytes.subarray(2).toString('utf16le')
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return utf16be(bytes.subarray(2))
  const charset = /charset\s*=\s*"?([\w.:-]+)/i
    .exec(contentType ?? '')?.[1]
    ?.toLowerCase()
  if (
    !charset ||
    charset === 'utf-8' ||
    charset === 'utf8' ||
    charset === 'us-ascii'
  )
    return bytes.toString('utf8')
  if (charset === 'utf-16le') return bytes.toString('utf16le')
  if (charset === 'utf-16be' || charset === 'utf-16') return utf16be(bytes)
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return bytes.toString('utf8')
  }
}

function utf16be(bytes: Buffer): string {
  const copy = Buffer.from(bytes.subarray(0, bytes.length - (bytes.length % 2)))
  return copy.swap16().toString('utf16le')
}

export interface RenderedBody {
  /** Masked text; '' for binary, skipped or undecodable bodies. */
  text: string
  /** Bytes as sent (before decoding). */
  size: number
  truncated: boolean
}

/** The masked text of what a tap kept. */
export function renderBody(
  tap: BodyTap,
  info: {
    contentType?: string
    contentEncoding?: string
    /** Bytes the body has when the stream was not read to its end. */
    size?: number
    /** The stream stopped before its end (aborted upload): the bytes seen are all there is. */
    incomplete?: boolean
    limit: number
  },
): RenderedBody {
  const size = Math.max(tap.size, info.size ?? 0)
  // Binary, skipped, or never seen (not read by the app, a stream undici
  // does not show): the size only.
  if (tap.counted || size === 0 || tap.size === 0) {
    return { text: '', size, truncated: info.incomplete === true }
  }
  if (tap.multipart) {
    const summary = truncateUtf8(tap.multipart.summary(), info.limit)
    return {
      text: summary.text,
      size,
      truncated: summary.truncated || info.incomplete === true,
    }
  }
  return renderBytes(tap.bytes(), {
    ...info,
    size,
    complete: tap.complete && size <= tap.size && info.incomplete !== true,
  })
}

/** Rendering of a body already in memory (job payloads, manual spans). */
export function renderBytes(
  raw: Buffer,
  info: {
    contentType?: string
    contentEncoding?: string
    size: number
    complete: boolean
    limit: number
  },
): RenderedBody {
  const { size, limit } = info
  const decoded = decodeBody(raw, info.contentEncoding, limit)
  if (!decoded) return { text: '', size, truncated: false }
  let complete = info.complete && !decoded.truncated
  let bytes = decoded.bytes
  if (bytes.length > limit) {
    bytes = bytes.subarray(0, limit)
    complete = false
  }
  const utf8 = decodeText(bytes, info.contentType)
  // Whatever the content type says: bytes that are not text stay out.
  if (!looksLikeText(utf8)) return { text: '', size, truncated: false }
  let kind = bodyKind(info.contentType)
  if (kind === 'unknown') {
    const first = utf8.trimStart()[0]
    kind =
      first === '{' || first === '['
        ? 'json'
        : first === '<'
          ? 'markup'
          : 'text'
  }
  if (kind === 'binary' || kind === 'multipart')
    return { text: '', size, truncated: false }
  // text/plain holding JSON (fetch's default for a string body): masked as
  // JSON by maskText when whole, by its pairs when cut.
  const masked =
    kind === 'json'
      ? maskJsonText(utf8, complete)
      : kind === 'form'
        ? maskQuery(utf8)
        : kind === 'markup'
          ? maskText(maskMarkup(utf8))
          : kind === 'csv'
            ? maskText(maskCsv(utf8))
            : maskText(utf8)
  const capped = truncateUtf8(masked, limit)
  return { text: capped.text, size, truncated: !complete || capped.truncated }
}

/** A value of any shape as body bytes: Buffer, string, or JSON for objects. */
export function bodyBytes(
  body: unknown,
): { bytes: Buffer; json: boolean } | undefined {
  if (body === undefined || body === null) return undefined
  if (Buffer.isBuffer(body)) return { bytes: body, json: false }
  if (body instanceof Uint8Array) {
    return {
      bytes: Buffer.from(body.buffer, body.byteOffset, body.byteLength),
      json: false,
    }
  }
  if (typeof body === 'string')
    return { bytes: Buffer.from(body, 'utf8'), json: false }
  try {
    const json = JSON.stringify(body)
    return json === undefined
      ? undefined
      : { bytes: Buffer.from(json, 'utf8'), json: true }
  } catch {
    return undefined
  }
}
