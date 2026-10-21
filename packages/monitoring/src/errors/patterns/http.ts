import type { ErrorPattern, ExplainInput, Explanation } from './types'

const STATUS_FIX: Record<number, string> = {
  400: 'answered 400: the payload or query is invalid. Compare the request with the API docs.',
  401: 'answered 401: the API key or token is missing, expired or for another environment. Check the credential in env.',
  402: 'answered 402: the account or quota needs payment. Check the provider billing.',
  403: 'answered 403: the credential is valid but not allowed for this resource, or the IP is not allow-listed.',
  404: 'answered 404: the endpoint path or the resource id is wrong, or the resource was deleted.',
  405: 'answered 405: wrong HTTP method for this endpoint.',
  408: 'answered 408: the request took too long to send. Retry.',
  409: 'answered 409: the resource already exists or is in a conflicting state. Usually a double submit.',
  410: 'answered 410: the endpoint or resource is gone (deprecated API version).',
  413: 'answered 413: the payload is too large for the API. Split it or upload by reference.',
  415: 'answered 415: wrong Content-Type for this endpoint.',
  422: 'answered 422: the request is well-formed but fails their validation. Read the response body.',
  429: 'answered 429: rate limited. Back off and retry; reduce concurrency if frequent.',
  500: 'answered 500: failed on their side. Retry with backoff; check the provider status page if it persists.',
  502: 'answered 502: their gateway could not reach the backend. Usually a deploy on their side; retry.',
  503: 'answered 503: temporarily unavailable or overloaded. Retry with backoff.',
  504: 'answered 504: their gateway timed out. The request may still have been processed; check before retrying writes.',
}

/** axios: `error.response.status` says which 4xx/5xx the API returned. */
function explainStatus({ error }: ExplainInput): Explanation | undefined {
  const status = error?.response?.status ?? error?.status
  if (typeof status !== 'number') return undefined
  const fix = STATUS_FIX[status]
  return {
    target: `HTTP ${status}`,
    fix: fix
      ? `The API ${fix}`
      : `The API answered ${status}. Read the response body for the reason.`,
  }
}

// Outbound HTTP via axios (AxiosError.code) and the external APIs we call.
export const httpPatterns: ErrorPattern[] = [
  {
    key: 'ETIMEDOUT',
    dependency: 'http',
    hint: '"{name}" API not responding',
    hintDetail:
      'No reply from {host} in time. The external API may be slow or down.',
    retryable: true,
  },
  {
    key: 'ECONNABORTED',
    dependency: 'http',
    hint: '"{name}" API timed out',
    hintDetail:
      'The request hit its timeout before {host} answered. The external API may be slow or down.',
    retryable: true,
  },
  {
    key: 'ECONNREFUSED',
    dependency: 'http',
    hint: '"{name}" API unreachable',
    hintDetail:
      'Nothing is listening at {host}. The service is down or restarting, or the base URL in env points to the wrong host/port.',
    retryable: true,
  },
  {
    key: 'ECONNRESET',
    dependency: 'http',
    hint: '"{name}" API dropped connection',
    hintDetail:
      '{host} closed the connection mid-request (restart, idle keep-alive reuse, proxy reset). Usually temporary; retry once.',
    retryable: true,
  },
  {
    key: 'ENOTFOUND',
    dependency: 'http',
    hint: '"{name}" API host not found',
    hintDetail:
      'DNS could not resolve {host}. The base URL in env is misspelled or the service is not reachable from this cluster.',
    category: 'config',
  },
  {
    key: 'ERR_BAD_RESPONSE',
    dependency: 'http',
    hint: '"{name}" API returned 5xx',
    hintDetail:
      '{host} failed on its side. Usually temporary; check the provider status if it persists.',
    retryable: true,
    explain: explainStatus,
  },
  {
    key: 'ERR_BAD_REQUEST',
    dependency: 'http',
    hint: '"{name}" API rejected request',
    hintDetail:
      '{host} answered 4xx. Check credentials (401/403), the URL (404) or the payload (400); 429 means rate limited.',
    explain: explainStatus,
  },
  {
    key: 'ERR_NETWORK',
    dependency: 'http',
    hint: '"{name}" API network error',
    hintDetail:
      'The request failed before a response arrived. Check DNS, network policy or proxy settings for {host}.',
    retryable: true,
  },
  {
    key: 'ERR_CANCELED',
    dependency: 'http',
    hint: 'Request cancelled',
    hintDetail:
      'The request was aborted by the caller (AbortController or shutdown). Usually not an error by itself.',
  },
  {
    key: 'ERR_FR_TOO_MANY_REDIRECTS',
    dependency: 'http',
    hint: '"{name}" API redirect loop',
    hintDetail:
      '{host} redirected more than maxRedirects times: a loop, or a redirect to a login page because auth failed.',
    category: 'config',
  },
  {
    key: 'ERR_INVALID_URL',
    dependency: 'http',
    hint: 'Invalid API URL',
    hintDetail:
      'axios could not build the request URL: the base URL env var is empty or has no scheme, or the path has a template left unfilled.',
    category: 'config',
  },
  {
    key: 'ERR_BAD_OPTION_VALUE',
    dependency: 'http',
    hint: 'Invalid axios option value',
    hintDetail:
      'An axios config value is invalid (responseType, adapter, timeout as string). Check the client factory.',
    category: 'bug',
  },
  {
    key: 'ERR_BAD_OPTION',
    dependency: 'http',
    hint: 'Unknown axios option',
    hintDetail:
      'The axios config has an option that does not exist. Check the client factory.',
    category: 'bug',
  },
  {
    key: 'ERR_NOT_SUPPORT',
    dependency: 'http',
    hint: 'Unsupported axios feature',
    hintDetail:
      'The request uses a feature the axios adapter does not support in this environment (e.g. upload progress on Node).',
    category: 'bug',
  },
  {
    key: 'ERR_DEPRECATED',
    dependency: 'http',
    hint: 'Deprecated axios option',
    hintDetail:
      'A removed axios option was used. Check the client factory against the axios changelog.',
    category: 'bug',
  },
  {
    key: 'ERR_FORM_DATA_DEPTH_EXCEEDED',
    dependency: 'http',
    hint: 'Form data nested too deep',
    hintDetail:
      'The object serialized to multipart/form-data nests deeper than allowed. Flatten the payload or send JSON.',
    category: 'bug',
  },
  {
    key: 'HTTP_SOCKET_HANG_UP',
    messageMatch: /^socket hang up$/,
    hint: 'Server hung up',
    hintDetail:
      'The server closed the socket without answering: it crashed, restarted, or a proxy/idle timeout cut the connection. Retry once.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'HTTP_TLS_SOCKET_DISCONNECTED',
    messageMatch:
      /^Client network socket disconnected before secure TLS connection was established/,
    hint: 'TLS connection dropped',
    hintDetail:
      'The socket closed during the TLS handshake: the host is not a TLS endpoint, a firewall reset it, or the server is overloaded.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'HTTP_MAX_CONTENT_LENGTH',
    messageMatch: /^maxContentLength size of \d+ exceeded/,
    hint: 'Response too large',
    hintDetail:
      'The response body exceeds the axios maxContentLength. Raise it or stream the response.',
    category: 'bug',
  },
  {
    key: 'HTTP_MAX_BODY_LENGTH',
    messageMatch: /^Request body larger than maxBodyLength limit/,
    hint: 'Request body too large',
    hintDetail:
      'The upload exceeds the axios maxBodyLength (10 MB default). Set maxBodyLength: Infinity or stream the upload.',
    category: 'bug',
  },
]
