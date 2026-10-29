import type { ErrorPattern, ExplainInput, Explanation } from './types'

// Sources:
// - https://github.com/axios/axios/blob/v1.x/README.md (axios error codes, maxContentLength/maxBodyLength/maxRedirects)
// - https://github.com/axios/axios/blob/v1.x/lib/adapters/http.js (where the Node adapter raises each code and message)
// - https://github.com/follow-redirects/follow-redirects/blob/main/index.js (ERR_FR_TOO_MANY_REDIRECTS, 10 MB maxBodyLength)
// - https://nodejs.org/api/http.html (socket hang up as ECONNRESET)
// - https://nodejs.org/api/errors.html (ECONNREFUSED, ECONNRESET, ENOTFOUND, ETIMEDOUT)
// - https://www.rfc-editor.org/rfc/rfc9110.html (HTTP status code meanings)

const STATUS_TEXT: Record<number, { detail: string; howToFix?: string }> = {
  400: {
    detail: 'answered 400: the payload or query is invalid.',
    howToFix: 'Compare the request with the API docs.',
  },
  401: {
    detail:
      'answered 401: the API key or token is missing, expired or for another environment.',
    howToFix: 'Check the credential in env.',
  },
  402: {
    detail: 'answered 402: the account or quota needs payment.',
    howToFix: 'Check the provider billing.',
  },
  403: {
    detail:
      'answered 403: the credential is valid but not allowed for this resource, or the IP is not allow-listed.',
  },
  404: {
    detail:
      'answered 404: the endpoint path or the resource id is wrong, or the resource was deleted.',
  },
  405: { detail: 'answered 405: wrong HTTP method for this endpoint.' },
  408: {
    detail: 'answered 408: the request took too long to send.',
    howToFix: 'Retry.',
  },
  409: {
    detail:
      'answered 409: the resource already exists or is in a conflicting state. Usually a double submit.',
  },
  410: {
    detail:
      'answered 410: the endpoint or resource is gone (deprecated API version).',
  },
  413: {
    detail: 'answered 413: the payload is too large for the API.',
    howToFix: 'Split the payload or upload it by reference.',
  },
  415: { detail: 'answered 415: wrong Content-Type for this endpoint.' },
  422: {
    detail:
      'answered 422: the request is well-formed but fails their validation.',
    howToFix: 'Read the response body.',
  },
  429: {
    detail: 'answered 429: rate limited.',
    howToFix: 'Back off and retry; reduce concurrency if frequent.',
  },
  500: {
    detail: 'answered 500: failed on their side.',
    howToFix:
      'Retry with backoff; check the provider status page if it persists.',
  },
  502: {
    detail:
      'answered 502: their gateway got an invalid response from the server behind it, often during a deploy or restart.',
    howToFix: 'Retry.',
  },
  503: {
    detail: 'answered 503: temporarily unavailable or overloaded.',
    howToFix: 'Retry with backoff.',
  },
  504: {
    detail:
      'answered 504: their gateway timed out. The request may still have been processed.',
    howToFix: 'Check before retrying writes.',
  },
}

/** axios: `error.response.status` says which 4xx/5xx the API returned. */
function explainStatus({ error }: ExplainInput): Explanation | undefined {
  const status = error?.response?.status ?? error?.status
  if (typeof status !== 'number') return undefined
  const text = STATUS_TEXT[status]
  if (!text) {
    return {
      target: `HTTP ${status}`,
      detail: `The API answered ${status}.`,
      howToFix: 'Read the response body for the reason.',
    }
  }
  return {
    target: `HTTP ${status}`,
    detail: `The API ${text.detail}`,
    howToFix: text.howToFix,
  }
}

// Outbound HTTP via axios (AxiosError.code) and the external APIs we call.
export const httpPatterns: ErrorPattern[] = [
  {
    key: 'ETIMEDOUT',
    dependency: 'http',
    hint: '"{name}" API not responding',
    detail:
      'No reply from {host} in time. The external API may be slow or down.',
    howToFix:
      'Retry with backoff; check the API status or raise the client timeout if it persists.',
    retryable: true,
  },
  {
    key: 'ECONNABORTED',
    dependency: 'http',
    hint: '"{name}" API timed out',
    detail:
      'The request hit its timeout before {host} answered. The external API may be slow or down.',
    howToFix:
      'Retry with backoff; raise the request timeout only if the API is known to be slow.',
    retryable: true,
  },
  {
    key: 'ECONNREFUSED',
    dependency: 'http',
    hint: '"{name}" API unreachable',
    detail:
      'Nothing is listening at {host}. The service is down or restarting, or the base URL in env points to the wrong host/port.',
    howToFix:
      'Check that the service is running and that the base URL in env has the right host and port.',
    retryable: true,
  },
  {
    key: 'ECONNRESET',
    dependency: 'http',
    hint: '"{name}" API dropped connection',
    detail:
      '{host} closed the connection mid-request (restart, idle keep-alive reuse, proxy reset). Usually temporary.',
    howToFix: 'Retry once.',
    retryable: true,
  },
  {
    key: 'ENOTFOUND',
    dependency: 'http',
    hint: '"{name}" API host not found',
    detail:
      'DNS could not resolve {host}. The base URL in env is misspelled or the service is not reachable from this cluster.',
    howToFix:
      'Check the base URL in env and that the host resolves from this cluster.',
    category: 'config',
  },
  {
    key: 'ERR_BAD_RESPONSE',
    dependency: 'http',
    hint: '"{name}" API returned 5xx',
    detail:
      '{host} answered 5xx, or its response could not be parsed or exceeded maxContentLength. A 5xx is usually temporary.',
    howToFix:
      'Retry a 5xx with backoff and check the provider status; for a parse or size failure, check the response format and size.',
    retryable: true,
    explain: explainStatus,
  },
  {
    key: 'ERR_BAD_REQUEST',
    dependency: 'http',
    hint: '"{name}" API rejected request',
    detail:
      '{host} answered 4xx (429 means rate limited), or axios rejected the request before sending it (unsupported protocol, body over maxBodyLength).',
    howToFix:
      'Check credentials (401/403), the URL (404) or the payload (400).',
    explain: explainStatus,
  },
  {
    key: 'ERR_NETWORK',
    dependency: 'http',
    hint: '"{name}" API network error',
    detail: 'The request failed before a response arrived.',
    howToFix: 'Check DNS, network policy or proxy settings for {host}.',
    retryable: true,
  },
  {
    key: 'ERR_CANCELED',
    dependency: 'http',
    hint: 'Request cancelled',
    detail:
      'The request was aborted by the caller (AbortController or shutdown). Usually not an error by itself.',
    howToFix: 'Check why the caller aborted; ignore it during shutdown.',
  },
  {
    key: 'ERR_FR_TOO_MANY_REDIRECTS',
    dependency: 'http',
    hint: '"{name}" API redirect loop',
    detail:
      '{host} redirected more than maxRedirects times: a loop, or a redirect to a login page because auth failed.',
    howToFix:
      'Check the URL for a redirect loop and the credentials sent to {host}.',
    category: 'config',
  },
  {
    key: 'ERR_INVALID_URL',
    dependency: 'http',
    hint: 'Invalid API URL',
    detail:
      'The request URL could not be parsed: the base URL env var is empty or not absolute, or the scheme is not followed by //.',
    howToFix:
      'Set the base URL env var to an absolute URL that starts with http:// or https://.',
    category: 'config',
  },
  {
    key: 'ERR_BAD_OPTION_VALUE',
    dependency: 'http',
    hint: 'Invalid axios option value',
    detail:
      'An axios config value is invalid: a timeout that is not a number, a non-boolean transitional flag, a bad httpVersion, or a proxy/agent/socketPath setting.',
    howToFix:
      'Fix the option named in the error message where the axios client or request config is built.',
    category: 'bug',
  },
  {
    key: 'ERR_BAD_OPTION',
    dependency: 'http',
    hint: 'Unknown axios option',
    detail:
      'The axios config has an unknown key under transitional, or an invalid proxy auth setting.',
    howToFix:
      'Fix the option named in the error message where the axios client or request config is built.',
    category: 'bug',
  },
  {
    key: 'ERR_NOT_SUPPORT',
    dependency: 'http',
    hint: 'Unsupported axios feature',
    detail:
      'The request uses something the axios adapter does not support here: no usable adapter, a responseType or stream body the fetch adapter lacks, or HTTP/2 through a proxy.',
    howToFix:
      'Remove the unsupported option, or use an adapter that supports it.',
    category: 'bug',
  },
  {
    key: 'ERR_DEPRECATED',
    dependency: 'http',
    hint: 'Deprecated axios option',
    detail: 'A removed axios option was used.',
    howToFix: 'Check the client factory against the axios changelog.',
    category: 'bug',
  },
  {
    key: 'ERR_FORM_DATA_DEPTH_EXCEEDED',
    dependency: 'http',
    hint: 'Form data nested too deep',
    detail:
      'The object serialized to multipart/form-data nests deeper than allowed.',
    howToFix: 'Flatten the payload or send JSON.',
    category: 'bug',
  },
  {
    key: 'HTTP_SOCKET_HANG_UP',
    messageMatch: /^socket hang up$/,
    hint: 'Server hung up',
    detail:
      'The server closed the socket without answering: it crashed, restarted, or a proxy/idle timeout cut the connection.',
    howToFix: 'Retry once.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'HTTP_TLS_SOCKET_DISCONNECTED',
    messageMatch:
      /^Client network socket disconnected before secure TLS connection was established/,
    hint: 'TLS connection dropped',
    detail:
      'The socket closed during the TLS handshake: the host is not a TLS endpoint, a firewall reset it, or the server is overloaded.',
    howToFix:
      'Check that the host serves TLS on this port; retry if the server was overloaded.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'HTTP_MAX_CONTENT_LENGTH',
    messageMatch: /^maxContentLength size of \d+ exceeded/,
    hint: 'Response too large',
    detail: 'The response body exceeds the axios maxContentLength.',
    howToFix:
      'Raise maxContentLength if a response this large is expected; streaming does not bypass it in current axios.',
    category: 'bug',
  },
  {
    key: 'HTTP_MAX_BODY_LENGTH',
    messageMatch: /^Request body larger than maxBodyLength limit/,
    hint: 'Request body too large',
    detail:
      'The request body exceeds maxBodyLength: the axios option, or the 10 MB follow-redirects default that older axios versions left in place.',
    howToFix:
      'Raise maxBodyLength on the axios client (Infinity for no limit); streaming the upload does not bypass it.',
    category: 'bug',
  },
]
