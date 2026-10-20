import type { Span } from '@opentelemetry/api'
import { CAPTURE_ATTR } from './attributes'
import {
  BodyTap,
  bodyBytes,
  renderBody,
  renderBytes,
  tapMode,
  type RenderedBody,
} from './body'
import { maskHeaders, maskQuery, truncateUtf8 } from './mask'
import { drop, onSpanEnding, put, recording } from './pending'
import { captureActive, captureSettings, skippedRoute } from './settings'

/**
 * HTTP in and out, like the browser's Network tab: query string, request and
 * response headers and bodies (masked, first LOG_BODY_MAX_BYTES bytes) on the
 * span of @opentelemetry/instrumentation-http (incoming requests and
 * http/https calls: axios, gaxios, the AWS SDK …) and of
 * @opentelemetry/instrumentation-undici (fetch). Bodies are seen as they pass:
 * `emit('data')` of the readable side, `write` / `end` of the writable side,
 * whose return values (backpressure) and arguments are unchanged. Attributes
 * are written when the span ends (CaptureSpanProcessor), once.
 */

type Headers = Record<string, unknown>

function first(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.length ? String(value[0]) : undefined
  return value === undefined || value === null ? undefined : String(value)
}

function lengthOf(headers: Headers | undefined): number {
  const value = Number(first(headers?.['content-length']))
  return Number.isFinite(value) && value > 0 ? value : 0
}

function splitQuery(target: string): { path: string; query: string } {
  const index = target.indexOf('?')
  if (index === -1) return { path: target, query: '' }
  const hash = target.indexOf('#', index)
  return {
    path: target.slice(0, index),
    query:
      hash === -1 ? target.slice(index + 1) : target.slice(index + 1, hash),
  }
}

/** `name: value` lines of a raw header block (the first line is the status / request line). */
function parseHeaderBlock(block: string): Headers {
  const out: Record<string, string | string[]> = {}
  const lines = block.split('\r\n')
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const index = line.indexOf(':')
    if (index <= 0) continue
    const name = line.slice(0, index).trim().toLowerCase()
    const value = line.slice(index + 1).trim()
    const before = out[name]
    out[name] =
      before === undefined ? value : ([] as string[]).concat(before, value)
  }
  return out
}

/** The headers an OutgoingMessage really sent (`_header`), else what it holds. */
function sentHeaders(message: any): Headers {
  try {
    if (typeof message?._header === 'string' && message._header) {
      return parseHeaderBlock(message._header)
    }
    return typeof message?.getHeaders === 'function' ? message.getHeaders() : {}
  } catch {
    return {}
  }
}

function setQuery(span: Span, query: string): void {
  if (!query) return
  put(
    span,
    CAPTURE_ATTR.urlQuery,
    truncateUtf8(maskQuery(query), captureSettings().maxBytes).text,
  )
}

function setHeaders(
  span: Span,
  side: 'request' | 'response',
  headers: Headers,
): void {
  const key =
    side === 'request'
      ? CAPTURE_ATTR.requestHeaders
      : CAPTURE_ATTR.responseHeaders
  put(
    span,
    key,
    truncateUtf8(
      JSON.stringify(maskHeaders(headers)),
      captureSettings().maxBytes,
    ).text,
  )
}

function setBody(
  span: Span,
  side: 'request' | 'response',
  body: RenderedBody,
): void {
  if (body.size <= 0) return
  const request = side === 'request'
  const key = request ? CAPTURE_ATTR.requestBody : CAPTURE_ATTR.responseBody
  put(
    span,
    request ? CAPTURE_ATTR.requestBodySize : CAPTURE_ATTR.responseBodySize,
    body.size,
  )
  put(
    span,
    request
      ? CAPTURE_ATTR.requestBodyTruncated
      : CAPTURE_ATTR.responseBodyTruncated,
    body.truncated,
  )
  // Size only (binary, skipped route, undecodable): no app hook's text either.
  if (body.text) put(span, key, body.text)
  else drop(span, key)
}

/**
 * What a readable's tap saw when the span ends: read to its end; read in
 * part (an aborted upload: its bytes are all there is, flagged incomplete);
 * or never read (no parser on the route, 413: its content-length).
 */
function readSize(
  tap: BodyTap,
  headers: Headers,
): { size?: number; incomplete?: boolean } {
  if (tap.ended) return {}
  if (tap.size > 0) return { incomplete: true }
  return { size: lengthOf(headers) }
}

/** Sees every chunk a readable emits, whoever reads it; adds no listener. */
function tapReadable(stream: any, tap: BodyTap): void {
  const emit = stream?.emit
  if (typeof emit !== 'function') return
  stream.emit = function (
    this: unknown,
    event: string | symbol,
    ...args: unknown[]
  ) {
    if (event === 'data') tap.push(args[0])
    else if (event === 'end') tap.end()
    return emit.apply(this, [event, ...args])
  }
}

/** Sees every chunk written to a ServerResponse / ClientRequest. */
function tapWritable(stream: any, tap: BodyTap): void {
  const write = stream?.write
  const end = stream?.end
  if (typeof write !== 'function' || typeof end !== 'function') return
  stream.write = function (this: unknown, chunk: unknown, encoding?: unknown) {
    tap.push(
      chunk,
      typeof encoding === 'string' ? (encoding as BufferEncoding) : undefined,
    )
    return write.apply(this, arguments as unknown as unknown[])
  }
  stream.end = function (this: unknown, chunk?: unknown, encoding?: unknown) {
    if (typeof chunk !== 'function') {
      tap.push(
        chunk,
        typeof encoding === 'string' ? (encoding as BufferEncoding) : undefined,
      )
    }
    tap.end()
    return end.apply(this, arguments as unknown as unknown[])
  }
}

// Client spans: the request's skip decision, for its response.
const skippedSpans = new WeakSet<object>()

function serverRequest(span: Span, req: any): void {
  const { path, query } = splitQuery(String(req.url ?? ''))
  const headers: Headers = req.headers ?? {}
  const contentType = first(headers['content-type'])
  const { maxBytes } = captureSettings()
  const tap = new BodyTap(
    maxBytes,
    tapMode(contentType, skippedRoute(path)),
    () => contentType,
  )
  tapReadable(req, tap)
  onSpanEnding(span, (ended) => {
    setQuery(ended, query)
    setHeaders(ended, 'request', headers)
    setBody(
      ended,
      'request',
      renderBody(tap, {
        contentType,
        contentEncoding: first(headers['content-encoding']),
        ...readSize(tap, headers),
        limit: maxBytes,
      }),
    )
  })
}

/**
 * A header of an outgoing message (ServerResponse / ClientRequest): what the
 * app set, or what was sent — headers given to `writeHead(status, headers)`
 * alone are only in the sent block.
 */
function outgoingHeader(res: any, name: string): string | undefined {
  try {
    return first(res.getHeader?.(name)) ?? first(sentHeaders(res)[name])
  } catch {
    return undefined
  }
}

function serverResponse(span: Span, res: any): void {
  const { maxBytes } = captureSettings()
  const path = splitQuery(String(res.req?.url ?? '')).path
  const contentType = () => outgoingHeader(res, 'content-type')
  const tap = new BodyTap(
    maxBytes,
    () => tapMode(contentType(), skippedRoute(path)),
    contentType,
  )
  tapWritable(res, tap)
  onSpanEnding(span, (ended) => {
    setHeaders(ended, 'response', sentHeaders(res))
    setBody(
      ended,
      'response',
      renderBody(tap, {
        contentType: contentType(),
        contentEncoding: outgoingHeader(res, 'content-encoding'),
        limit: maxBytes,
      }),
    )
  })
}

function clientRequest(span: Span, req: any): void {
  const { maxBytes } = captureSettings()
  const target = String(req.path ?? '')
  const { path, query } = splitQuery(target)
  const host = first(req.getHeader?.('host')) ?? req.host ?? ''
  const protocol = req.protocol ?? req.agent?.protocol ?? 'http:'
  const skip = skippedRoute(path, `${protocol}//${host}${path}`)
  if (skip) skippedSpans.add(span)
  const contentType = () => outgoingHeader(req, 'content-type')
  const tap = new BodyTap(
    maxBytes,
    () => tapMode(contentType(), skip),
    contentType,
  )
  tapWritable(req, tap)
  onSpanEnding(span, (ended) => {
    setQuery(ended, query)
    setHeaders(ended, 'request', sentHeaders(req))
    setBody(
      ended,
      'request',
      renderBody(tap, {
        contentType: contentType(),
        contentEncoding: outgoingHeader(req, 'content-encoding'),
        limit: maxBytes,
      }),
    )
  })
}

function clientResponse(span: Span, res: any): void {
  const { maxBytes } = captureSettings()
  // A copy now: axios deletes content-encoding once it decides to decompress.
  const headers: Headers = { ...(res.headers ?? {}) }
  const contentType = first(headers['content-type'])
  const tap = new BodyTap(
    maxBytes,
    tapMode(contentType, skippedSpans.has(span)),
    () => contentType,
  )
  tapReadable(res, tap)
  onSpanEnding(span, (ended) => {
    setHeaders(ended, 'response', headers)
    setBody(
      ended,
      'response',
      renderBody(tap, {
        contentType,
        contentEncoding: first(headers['content-encoding']),
        ...readSize(tap, headers),
        limit: maxBytes,
      }),
    )
  })
}

/**
 * `requestHook` of @opentelemetry/instrumentation-http: an IncomingMessage
 * on the server side, a ClientRequest for an outgoing call.
 */
export function httpRequestHook(span: Span, request: unknown): void {
  if (!recording(span) || !captureActive() || !request) return
  try {
    if (typeof (request as any).getHeader === 'function')
      clientRequest(span, request)
    else serverRequest(span, request)
  } catch {
    // never affect the request
  }
}

/** `responseHook`: a ServerResponse on the server side, an IncomingMessage for a call. */
export function httpResponseHook(span: Span, response: unknown): void {
  if (!recording(span) || !captureActive() || !response) return
  try {
    if (typeof (response as any).writeHead === 'function')
      serverResponse(span, response)
    else clientResponse(span, response)
  } catch {
    // never affect the response
  }
}

// --- undici / fetch ------------------------------------------------------------

interface UndiciState {
  request: any
  requestTap: BodyTap
  responseTap?: BodyTap
  responseHeaders?: Headers
}

const undiciStates = new WeakMap<object, UndiciState>()

/** undici v6 `[name, value, …]` (value string | string[]) or v5 `name: value\r\n`. */
function undiciRequestHeaders(headers: unknown): Headers {
  if (typeof headers === 'string') return parseHeaderBlock(`\r\n${headers}`)
  const out: Record<string, string | string[]> = {}
  if (!Array.isArray(headers)) return out
  for (let i = 0; i + 1 < headers.length; i += 2) {
    const name = String(headers[i]).toLowerCase()
    const value = headers[i + 1] as string | string[]
    const before = out[name]
    out[name] =
      before === undefined ? value : ([] as string[]).concat(before, value)
  }
  return out
}

function undiciResponseHeaders(headers: unknown): Headers {
  const out: Record<string, string | string[]> = {}
  if (!Array.isArray(headers)) return out
  for (let i = 0; i + 1 < headers.length; i += 2) {
    const name = String(headers[i]).toLowerCase()
    const value = String(headers[i + 1])
    const before = out[name]
    out[name] =
      before === undefined ? value : ([] as string[]).concat(before, value)
  }
  return out
}

/** `requestHook` of @opentelemetry/instrumentation-undici. */
export function undiciRequestHook(span: Span, request: any): void {
  if (!recording(span) || !captureActive() || !request) return
  try {
    const { maxBytes } = captureSettings()
    const { path, query } = splitQuery(String(request.path ?? ''))
    const skip = skippedRoute(path, `${request.origin ?? ''}${path}`)
    const contentType = () =>
      first(undiciRequestHeaders(request.headers)['content-type']) ??
      request.contentType
    const state: UndiciState = {
      request,
      requestTap: new BodyTap(
        maxBytes,
        () => tapMode(contentType(), skip),
        contentType,
      ),
    }
    undiciStates.set(request, state)
    tapUndiciRequest(state)
    onSpanEnding(span, (ended) => {
      setQuery(ended, query)
      setHeaders(ended, 'request', undiciRequestHeaders(request.headers))
      setBody(
        ended,
        'request',
        renderBody(state.requestTap, {
          contentType: contentType(),
          size: request.contentLength ?? undefined,
          limit: maxBytes,
        }),
      )
      if (state.responseHeaders) {
        const headers = state.responseHeaders
        setHeaders(ended, 'response', headers)
        if (state.responseTap) {
          setBody(
            ended,
            'response',
            renderBody(state.responseTap, {
              contentType: first(headers['content-type']),
              contentEncoding: first(headers['content-encoding']),
              size: lengthOf(headers),
              limit: maxBytes,
            }),
          )
        }
      }
    })
  } catch {
    // never affect the request
  }
}

/** `responseHook` of @opentelemetry/instrumentation-undici. */
export function undiciResponseHook(
  span: Span,
  info: { request: any; response: { headers?: unknown } },
): void {
  if (!recording(span) || !captureActive()) return
  try {
    const state = undiciStates.get(info?.request)
    if (!state) return
    const headers = undiciResponseHeaders(info.response?.headers)
    state.responseHeaders = headers
    const contentType = first(headers['content-type'])
    state.responseTap = new BodyTap(
      captureSettings().maxBytes,
      tapMode(contentType, skippedSpans.has(span)),
      () => contentType,
    )
  } catch {
    // never affect the response
  }
}

/**
 * undici calls `onBodySent(chunk)` / `onData(chunk)` on its request object
 * for every chunk sent / received (v5–v7; fetch hands it the body as a
 * stream, so the create message has no bytes). Both are wrapped on this one
 * request, return value (backpressure) unchanged.
 */
function tapUndiciRequest(state: UndiciState): void {
  const { request } = state
  const body = request.body
  const sent = request.onBodySent
  if (typeof sent === 'function') {
    request.onBodySent = function (this: unknown, chunk: unknown) {
      state.requestTap.push(chunk)
      return sent.apply(this, arguments as unknown as unknown[])
    }
  } else if (typeof body === 'string' || body instanceof Uint8Array) {
    state.requestTap.push(body)
  }
  const data = request.onData
  if (typeof data === 'function') {
    request.onData = function (this: unknown, chunk: unknown) {
      state.responseTap?.push(chunk)
      return data.apply(this, arguments as unknown as unknown[])
    }
  }
}

// --- manual spans -----------------------------------------------------------------

export interface HttpExchangeSide {
  headers?: Record<string, unknown>
  /** string, Buffer, or an object (sent as JSON). */
  body?: unknown
  contentType?: string
}

export interface HttpExchange {
  /** Full URL or path; its query string is captured. */
  url?: string
  request?: HttpExchangeSide
  response?: HttpExchangeSide
}

function sideBody(side: HttpExchangeSide): RenderedBody | undefined {
  const body = bodyBytes(side.body)
  if (!body) return undefined
  const headers = side.headers ?? {}
  const { maxBytes } = captureSettings()
  const contentType =
    side.contentType ??
    first(headers['content-type'] ?? headers['Content-Type']) ??
    (body.json ? 'application/json' : undefined)
  const size = body.bytes.length
  return renderBytes(body.bytes.subarray(0, maxBytes), {
    contentType,
    contentEncoding: first(headers['content-encoding']),
    size,
    complete: size <= maxBytes,
    limit: maxBytes,
  })
}

/**
 * The same attributes for a span the app makes itself (a client library
 * that does not go through http / undici, a stand-in): masked and capped
 * exactly like the hooks.
 */
export function captureHttp(span: Span, exchange: HttpExchange): void {
  if (!recording(span) || !captureActive()) return
  try {
    if (exchange.url) setQuery(span, splitQuery(exchange.url).query)
    for (const side of ['request', 'response'] as const) {
      const value = exchange[side]
      if (!value) continue
      setHeaders(span, side, value.headers ?? {})
      const body = sideBody(value)
      if (body) setBody(span, side, body)
    }
  } catch {
    // never affect the caller
  }
}
