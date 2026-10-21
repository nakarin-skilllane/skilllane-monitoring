import { promisify } from 'util'
import { gzip as gzipCallback } from 'zlib'
import {
  ENV,
  HEADER_STREAM,
  HEADER_VERSION,
  CONTRACT_VERSION,
  INGEST_PATH,
  type TelemetryStream,
} from '../contract'
import { env } from '../otel/identity'
import {
  type OutgoingMessage,
  RejectedMessageError,
  type Transport,
} from './types'

const gzip = promisify(gzipCallback)

/** Bodies under this many bytes go out as they are: gzip would not pay. */
const GZIP_FROM_BYTES = 1_024

/** Same bound as the publisher's connect + publish (transport/index.ts). */
const SEND_TIMEOUT_MS = 10_000

export interface HttpTarget {
  /** Origin + base path, no trailing slash and no credentials. */
  base: string
  token?: string
}

/**
 * LOG_HTTP_URL, e.g. `https://monitoring.company.local`; the token is LOG_HTTP_TOKEN,
 * or the user part of the URL (`https://<token>@host`) so one value carries
 * both. undefined when the URL is missing or not http(s).
 */
export function httpTarget(): HttpTarget | undefined {
  const raw = env(ENV.httpUrl)
  if (!raw) return undefined
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return undefined
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  const token =
    env(ENV.httpToken) ??
    (url.username ? decodeURIComponent(url.username) : undefined)
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  return { base: url.toString().replace(/\/+$/, ''), token }
}

/**
 * No queue: each message is one POST of the envelope to the engine
 * (`<LOG_HTTP_URL>/api/ingest/<stream>`), gzip when worth it. The engine
 * answers 2xx once the rows are in ClickHouse, so a failure here keeps the
 * items in the publisher's memory and retries them like a queue outage.
 * 400 / 413 can never succeed: the message is dropped instead. Runs inside
 * the publisher's untraced context, so fetch makes no span of its own.
 */
export class HttpTransport implements Transport {
  readonly name = 'http' as const
  readonly target: string
  private readonly base: string
  private readonly token?: string

  constructor(target: HttpTarget) {
    this.base = target.base
    this.token = target.token
    this.target = new URL(target.base).host
  }

  /** Nothing to open: every publish is its own request. */
  connect(): Promise<void> {
    return Promise.resolve()
  }

  async publish(
    stream: TelemetryStream,
    message: OutgoingMessage,
  ): Promise<void> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      [HEADER_STREAM]: stream,
      [HEADER_VERSION]: String(CONTRACT_VERSION),
    }
    if (this.token) headers.authorization = `Bearer ${this.token}`
    let body: Buffer = message.body
    if (body.length >= GZIP_FROM_BYTES) {
      body = await gzip(body)
      headers['content-encoding'] = 'gzip'
    }
    const response = await fetch(`${this.base}${INGEST_PATH}/${stream}`, {
      method: 'POST',
      headers,
      body,
      // The publisher gives up at its send timeout; do not leave the request behind.
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    // Free the socket; the answer is only a status.
    await response.body?.cancel().catch(() => undefined)
    if (response.ok) return
    const why = `engine answered HTTP ${response.status}`
    if (response.status === 400 || response.status === 413) {
      throw new RejectedMessageError(why)
    }
    // 401/403 (token), 404 (ingest off), 429/5xx (busy, ClickHouse down): retried.
    throw new Error(why)
  }

  close(): Promise<void> {
    return Promise.resolve()
  }
}
