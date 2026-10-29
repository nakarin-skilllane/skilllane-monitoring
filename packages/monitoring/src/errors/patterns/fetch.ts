import type { ErrorPattern } from './types'

// Sources:
// - https://github.com/nodejs/undici/blob/main/docs/docs/api/Errors.md (UND_ERR_* codes)
// - https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md (connect, headers and body timeout defaults)
// - https://github.com/nodejs/undici/blob/main/lib/web/fetch/index.js (fetch failed, terminated)
// - https://github.com/node-fetch/node-fetch/blob/main/docs/ERROR-HANDLING.md (FetchError and its type)
// - https://github.com/node-fetch/node-fetch/blob/2.x/src/index.js (v2 request-timeout, max-redirect)

/** node-fetch FetchError: `type` says what failed. */
function explainFetchError({
  error,
  message,
}: {
  error: any
  message: string
}) {
  const type = typeof error?.type === 'string' ? error.type : undefined
  const reason = message.match(/reason: (.+)$/)?.[1]
  switch (type) {
    case 'request-timeout':
      return {
        target: type,
        detail:
          'The request hit the timeout option before a response. The remote API is slow or down.',
      }
    case 'body-timeout':
      return {
        target: type,
        detail:
          'Reading the response body took longer than the timeout option. The remote API is slow or stopped sending mid-response.',
      }
    case 'max-size':
      return {
        target: type,
        detail: 'The response body exceeded the size option.',
        howToFix: 'Raise the size option or stream the body.',
      }
    case 'invalid-json':
      return {
        target: type,
        detail:
          'response.json() got a body that is not JSON (HTML error page?).',
        howToFix:
          'Check response.status and content-type before calling response.json().',
      }
    case 'max-redirect':
      return {
        target: type,
        detail:
          'Too many redirects. The URL loops or the API redirects to a login page.',
      }
    case 'system':
      return reason
        ? {
            target: 'system',
            detail: `Network failure: ${reason.slice(0, 100)}`,
          }
        : undefined
    default:
      return undefined
  }
}

// Global fetch (undici, Node 18+) and node-fetch. undici puts the cause in
// `cause`; the adapter lifts its code (UND_ERR_*, ECONNREFUSED, a TLS code).
export const fetchPatterns: ErrorPattern[] = [
  {
    key: 'UND_ERR_CONNECT_TIMEOUT',
    hint: 'Connect timed out',
    detail:
      'fetch could not open the TCP/TLS connection within the connect timeout (10 s default). The host is down, filtered, or DNS returned an unreachable address.',
    howToFix:
      'Check that the host is up and reachable from here; retry with backoff.',
    retryable: true,
  },
  {
    key: 'UND_ERR_HEADERS_TIMEOUT',
    hint: 'No response headers',
    detail:
      'The server accepted the connection but sent no response within headersTimeout (5 min default). The remote API is hung or very slow.',
    howToFix:
      'Retry with backoff; set a shorter headersTimeout or an AbortSignal timeout to fail faster.',
    retryable: true,
  },
  {
    key: 'UND_ERR_BODY_TIMEOUT',
    hint: 'Response body stalled',
    detail:
      'The response body stopped arriving for longer than bodyTimeout. The remote API or a proxy stalled mid-response.',
    howToFix: 'Retry the request; check the remote API or proxy if it repeats.',
    retryable: true,
  },
  {
    key: 'UND_ERR_SOCKET',
    hint: 'Socket closed mid-request',
    detail:
      'The connection dropped during the request ("other side closed"): server restart, idle keep-alive reuse, or a proxy reset.',
    howToFix: 'Retry once.',
    retryable: true,
  },
  {
    key: 'UND_ERR_ABORTED',
    hint: 'Request aborted',
    detail:
      'The undici request was aborted by the caller, typically through an AbortSignal (timeout or cancel). Usually not an error by itself.',
    howToFix:
      'Check the AbortSignal timeout and why the caller aborted; ignore it during shutdown.',
  },
  {
    key: 'UND_ERR_DESTROYED',
    hint: 'HTTP client destroyed',
    detail:
      'A request ran on an undici client/pool after destroy(), usually during shutdown.',
    howToFix:
      'Stop sending requests before the client is destroyed at shutdown.',
  },
  {
    key: 'UND_ERR_CLOSED',
    hint: 'HTTP client closed',
    detail: 'A request ran on an undici client/pool after close().',
    howToFix: 'Create a new client, or stop sending requests after close().',
  },
  {
    key: 'UND_ERR_RES_CONTENT_LENGTH_MISMATCH',
    hint: 'Response shorter than declared',
    detail:
      'The body did not match Content-Length: the server or a proxy cut the response.',
    howToFix: 'Retry the request; check the proxy if it repeats.',
    retryable: true,
  },
  {
    key: 'UND_ERR_REQ_CONTENT_LENGTH_MISMATCH',
    hint: 'Request body length mismatch',
    detail: 'The body written does not match the Content-Length header sent.',
    howToFix: 'Check how the body/length are built.',
    category: 'bug',
  },
  {
    key: 'UND_ERR_RES_EXCEEDED_MAX_SIZE',
    hint: 'Response too large',
    detail: 'The response body exceeded the maxResponseSize option.',
    howToFix:
      'Raise maxResponseSize on the dispatcher if a response this large is expected.',
  },
  {
    key: 'UND_ERR_HEADERS_OVERFLOW',
    hint: 'Response headers too large',
    detail:
      'The response headers exceed maxHeaderSize. A misbehaving upstream (huge Set-Cookie).',
    howToFix: 'Check the upstream response headers, or raise maxHeaderSize.',
  },
  {
    key: 'UND_ERR_REDIRECT_MAX',
    hint: 'Too many redirects',
    detail:
      'The redirect chain exceeded the limit: a loop, or an API redirecting to a login page.',
    howToFix: 'Check the URL for a redirect loop and the credentials sent.',
  },
  {
    key: 'UND_ERR_INVALID_ARG',
    hint: 'Invalid fetch argument',
    detail:
      'undici rejected an option or header (invalid header, path, method or body type).',
    howToFix: 'Check the request construction.',
    category: 'bug',
  },
  {
    key: 'UND_ERR_NOT_SUPPORTED',
    hint: 'Fetch feature unsupported',
    detail:
      'The request uses something undici does not support (protocol, option).',
    howToFix: 'Remove the unsupported protocol or option from the request.',
    category: 'bug',
  },
  {
    key: 'UND_ERR_PRX_TLS',
    hint: 'Proxy TLS failed',
    detail: 'The TLS connection to the HTTP proxy failed.',
    howToFix: 'Check the proxy URL and CA.',
    category: 'config',
  },
  {
    key: 'UND_ERR_PRX_CONN',
    hint: 'Proxy connection failed',
    detail: 'Could not connect through the HTTP proxy (HTTPS_PROXY).',
    howToFix: 'Check the proxy address and auth.',
    category: 'config',
  },
  {
    key: 'UND_ERR_RESPONSE',
    hint: 'Upstream error response',
    detail: 'undici raised the response as an error (throwOnError).',
    howToFix: 'Read status and body.',
  },
  {
    key: 'UND_ERR_REQ_RETRY',
    hint: 'Fetch retries exhausted',
    detail:
      'The retry handler gave up: retries ran out, or the body is a stream that cannot be replayed.',
    howToFix: 'Read the cause for the last failure.',
    retryable: true,
  },
  {
    key: 'FetchError',
    hint: 'Fetch failed',
    detail:
      'node-fetch failed before a usable response (see target): network, timeout, size or invalid JSON body.',
    howToFix:
      'Read the target for the failing step; retry network and timeout failures.',
    retryable: true,
    explain: explainFetchError,
  },
  {
    key: 'FETCH_FAILED',
    messageMatch: /^fetch failed$/,
    hint: 'Fetch failed',
    detail: 'fetch could not complete and the cause carried no code.',
    howToFix: 'Read error.cause for the network or TLS reason.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'FETCH_BODY_TERMINATED',
    messageMatch: /^terminated$/,
    hint: 'Response body cut off',
    detail:
      'The response body ended before it was fully read: the server or a proxy closed the connection mid-body.',
    howToFix: 'Retry the request; check proxy timeouts if it repeats.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'FETCH_BODY_USED',
    messageMatch: /^Body is unusable|body used already/,
    hint: 'Response body read twice',
    detail:
      'response.json()/text() was called after the body was already consumed.',
    howToFix: 'Read the body once and reuse the value.',
    category: 'bug',
  },
]
