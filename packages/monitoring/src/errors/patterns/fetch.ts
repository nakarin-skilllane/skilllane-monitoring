import type { ErrorPattern } from './types'

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
        fix: 'The request hit the timeout option before a response. The remote API is slow or down.',
      }
    case 'body-timeout':
      return {
        target: type,
        fix: 'The response body stalled past the timeout. The remote API stopped sending mid-response.',
      }
    case 'max-size':
      return {
        target: type,
        fix: 'The response body exceeded the size option. Raise it or stream the body.',
      }
    case 'invalid-json':
      return {
        target: type,
        fix: 'response.json() got a body that is not JSON (HTML error page?). Check response.status and content-type first.',
      }
    case 'max-redirect':
      return {
        target: type,
        fix: 'Too many redirects. The URL loops or the API redirects to a login page.',
      }
    case 'system':
      return reason
        ? { target: 'system', fix: `Network failure: ${reason.slice(0, 100)}` }
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
    hintDetail:
      'fetch could not open the TCP/TLS connection within the connect timeout (10 s default). The host is down, filtered, or DNS returned an unreachable address.',
    retryable: true,
  },
  {
    key: 'UND_ERR_HEADERS_TIMEOUT',
    hint: 'No response headers',
    hintDetail:
      'The server accepted the connection but sent no response within headersTimeout (5 min default). The remote API is hung or very slow.',
    retryable: true,
  },
  {
    key: 'UND_ERR_BODY_TIMEOUT',
    hint: 'Response body stalled',
    hintDetail:
      'The response body stopped arriving for longer than bodyTimeout. The remote API or a proxy stalled mid-response.',
    retryable: true,
  },
  {
    key: 'UND_ERR_SOCKET',
    hint: 'Socket closed mid-request',
    hintDetail:
      'The connection dropped during the request ("other side closed"): server restart, idle keep-alive reuse, or a proxy reset. Retry once.',
    retryable: true,
  },
  {
    key: 'UND_ERR_ABORTED',
    hint: 'Request aborted',
    hintDetail:
      'The fetch was aborted by its AbortSignal (timeout or caller). Usually not an error by itself.',
  },
  {
    key: 'UND_ERR_DESTROYED',
    hint: 'HTTP client destroyed',
    hintDetail:
      'A request ran on an undici client/pool after destroy(), usually during shutdown.',
  },
  {
    key: 'UND_ERR_CLOSED',
    hint: 'HTTP client closed',
    hintDetail: 'A request ran on an undici client/pool after close().',
  },
  {
    key: 'UND_ERR_RES_CONTENT_LENGTH_MISMATCH',
    hint: 'Response shorter than declared',
    hintDetail:
      'The body did not match Content-Length: the server or a proxy cut the response.',
    retryable: true,
  },
  {
    key: 'UND_ERR_REQ_CONTENT_LENGTH_MISMATCH',
    hint: 'Request body length mismatch',
    hintDetail:
      'The body written does not match the Content-Length header sent. Check how the body/length are built.',
    category: 'bug',
  },
  {
    key: 'UND_ERR_RES_EXCEEDED_MAX_SIZE',
    hint: 'Response too large',
    hintDetail:
      'The response exceeded the configured max size. Raise the limit or stream the body.',
  },
  {
    key: 'UND_ERR_HEADERS_OVERFLOW',
    hint: 'Response headers too large',
    hintDetail:
      'The response headers exceed maxHeaderSize. A misbehaving upstream (huge Set-Cookie).',
  },
  {
    key: 'UND_ERR_REDIRECT_MAX',
    hint: 'Too many redirects',
    hintDetail:
      'The redirect chain exceeded the limit: a loop, or an API redirecting to a login page.',
  },
  {
    key: 'UND_ERR_INVALID_ARG',
    hint: 'Invalid fetch argument',
    hintDetail:
      'undici rejected an option or header (invalid value, body on GET). Check the request construction.',
    category: 'bug',
  },
  {
    key: 'UND_ERR_NOT_SUPPORTED',
    hint: 'Fetch feature unsupported',
    hintDetail:
      'The request uses something undici does not support (protocol, option).',
    category: 'bug',
  },
  {
    key: 'UND_ERR_PRX_TLS',
    hint: 'Proxy TLS failed',
    hintDetail:
      'The TLS connection to the HTTP proxy failed. Check the proxy URL and CA.',
    category: 'config',
  },
  {
    key: 'UND_ERR_PRX_CONN',
    hint: 'Proxy connection failed',
    hintDetail:
      'Could not connect through the HTTP proxy (HTTPS_PROXY). Check the proxy address and auth.',
    category: 'config',
  },
  {
    key: 'UND_ERR_RESPONSE',
    hint: 'Upstream error response',
    hintDetail:
      'undici raised the response as an error (throwOnError). Read status and body.',
  },
  {
    key: 'UND_ERR_REQ_RETRY',
    hint: 'Fetch retries exhausted',
    hintDetail:
      'The retry interceptor gave up. See the cause for the last failure.',
    retryable: true,
  },
  {
    key: 'FetchError',
    hint: 'Fetch failed',
    hintDetail:
      'node-fetch failed before a usable response (see target): network, timeout, size or invalid JSON body.',
    retryable: true,
    explain: explainFetchError,
  },
  {
    key: 'FETCH_FAILED',
    messageMatch: /^fetch failed$/,
    hint: 'Fetch failed',
    hintDetail:
      'fetch could not complete and the cause carried no code. Read error.cause for the network or TLS reason.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'FETCH_BODY_TERMINATED',
    messageMatch: /^terminated$/,
    hint: 'Response body cut off',
    hintDetail:
      'The response body ended before it was fully read: the server or a proxy closed the connection mid-body.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'FETCH_BODY_USED',
    messageMatch: /^Body is unusable|body used already/,
    hint: 'Response body read twice',
    hintDetail:
      'response.json()/text() was called after the body was already consumed. Read it once and reuse the value.',
    category: 'bug',
  },
]
