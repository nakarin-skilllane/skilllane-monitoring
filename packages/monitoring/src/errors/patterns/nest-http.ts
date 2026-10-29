import type { ErrorPattern, ExplainInput, Explanation } from './types'

// Sources:
// - https://www.rfc-editor.org/rfc/rfc9110.html (HTTP status code meanings)
// - https://www.rfc-editor.org/rfc/rfc6585.html (428, 429, 431)
// - https://www.rfc-editor.org/rfc/rfc4918.html (WebDAV 423, 424, 507)
// - https://www.rfc-editor.org/rfc/rfc5842.html (508 Loop Detected)
// - https://www.rfc-editor.org/rfc/rfc7725.html (451)
// - https://github.com/nestjs/nest/tree/master/packages/common/exceptions (built-in HttpException classes)

/**
 * ValidationPipe answers 400 with `message: string[]`, one rule per entry,
 * starting with the property path (`items.0.score must be ...`). Field names
 * only; the rejected values are never read.
 */
function explainValidation({ error }: ExplainInput): Explanation | undefined {
  const response =
    typeof error?.getResponse === 'function' ? error.getResponse() : undefined
  const messages = response?.message
  if (!Array.isArray(messages)) return undefined
  const fields = [
    ...new Set(
      messages
        .map((entry) =>
          typeof entry === 'string' ? entry.split(' ')[0] : undefined,
        )
        .filter((field): field is string => !!field && /^[\w.]+$/.test(field))
        .map((field) => field.replace(/\.\d+(?=\.|$)/g, '.*')),
    ),
  ].slice(0, 6)
  if (!fields.length) return undefined
  return {
    target: fields.join(', '),
    detail: `Rejected fields: ${fields.join(', ')}.`,
    howToFix: 'Read the response message for the rule each field broke.',
  }
}

// NestJS HttpException without an errorCode → HTTP_<status>. 4xx are caller
// mistakes, so they log as warn. One entry per built-in exception class.
export const nestHttpPatterns: ErrorPattern[] = [
  {
    key: 'HTTP_400',
    hint: 'Invalid request',
    detail: 'The request failed validation or business rules.',
    howToFix: 'Read the response message for the field that failed.',
    level: 'warn',
    explain: explainValidation,
  },
  {
    key: 'HTTP_401',
    hint: 'Not authenticated',
    detail: 'The token is missing, expired or invalid.',
    howToFix:
      'Log in again, or send a valid token in the Authorization header.',
    level: 'warn',
  },
  {
    key: 'HTTP_402',
    hint: 'Payment required',
    detail: 'The resource needs a paid plan or an unpaid balance blocks it.',
    howToFix: 'Check the user plan or outstanding balance.',
    level: 'warn',
  },
  {
    key: 'HTTP_403',
    hint: 'Not allowed',
    detail:
      'A guard or permission check refused the request: the caller is authenticated but lacks permission.',
    howToFix:
      'Check the role or permission the route requires; for a new route, check that the permission is granted to that role.',
    level: 'warn',
  },
  {
    key: 'HTTP_404',
    hint: 'Not found',
    detail: 'The requested record or route does not exist.',
    howToFix: 'Check the id or path the client sent.',
    level: 'warn',
  },
  {
    key: 'HTTP_405',
    hint: 'Method not allowed',
    detail:
      'The route exists but not for this HTTP method. The client used the wrong verb.',
    howToFix: 'Call the route with the HTTP method it declares.',
    level: 'warn',
  },
  {
    key: 'HTTP_406',
    hint: 'Not acceptable',
    detail: 'The server cannot produce a response matching the Accept header.',
    howToFix:
      'Send an Accept header the endpoint can produce, such as application/json.',
    level: 'warn',
  },
  {
    key: 'HTTP_408',
    hint: 'Request timeout',
    detail:
      'The handler gave up waiting (RequestTimeoutException, TimeoutInterceptor). The work behind it is slow.',
    howToFix:
      'Find the slow step behind the handler, or move the work to a background job.',
    retryable: true,
  },
  {
    key: 'HTTP_409',
    hint: 'Conflict',
    detail:
      'The request conflicts with current data, e.g. a duplicate or a stale status.',
    howToFix:
      'Reload the current data and retry, or skip the duplicate submit.',
    level: 'warn',
  },
  {
    key: 'HTTP_410',
    hint: 'Gone',
    detail: 'The resource was permanently removed (expired link, retired API).',
    howToFix: 'Use a new link or the current API version.',
    level: 'warn',
  },
  {
    key: 'HTTP_411',
    hint: 'Content-Length required',
    detail:
      'The request body was sent without Content-Length. A client/proxy issue.',
    howToFix: 'Check the client or proxy that drops Content-Length.',
    level: 'warn',
  },
  {
    key: 'HTTP_412',
    hint: 'Precondition failed',
    detail:
      'An If-Match/ETag or business precondition did not hold. The client works on stale data.',
    howToFix: 'Reload the resource for a fresh ETag, then retry.',
    level: 'warn',
  },
  {
    key: 'HTTP_413',
    hint: 'Payload too large',
    detail: 'The upload or body exceeds the size limit.',
    howToFix: 'Send a smaller payload, or raise the size limit for this route.',
    level: 'warn',
  },
  {
    key: 'HTTP_414',
    hint: 'URI too long',
    detail: 'The query string is too long (huge id lists).',
    howToFix: 'Send the list in the body.',
    level: 'warn',
  },
  {
    key: 'HTTP_415',
    hint: 'Unsupported file type',
    detail:
      'The request content format (Content-Type, Content-Encoding or uploaded file type) is not accepted by this endpoint.',
    howToFix:
      'Send a content or file type the endpoint accepts, or extend its allowed types.',
    level: 'warn',
  },
  {
    key: 'HTTP_416',
    hint: 'Range not satisfiable',
    detail:
      'The Range header is outside the file size (resumed download past the end).',
    howToFix: 'Restart the download, or request a range within the file size.',
    level: 'warn',
  },
  {
    key: 'HTTP_417',
    hint: 'Expectation failed',
    detail: 'An Expect header could not be met.',
    howToFix: 'Remove the Expect header from the client request.',
    level: 'warn',
  },
  {
    key: 'HTTP_418',
    hint: 'I am a teapot',
    detail: 'ImATeapotException: a placeholder status thrown on purpose.',
    howToFix: 'Replace the placeholder with the intended exception.',
    level: 'warn',
  },
  {
    key: 'HTTP_421',
    hint: 'Misdirected request',
    detail:
      'The request reached a server that cannot answer for this host (TLS/SNI or ingress routing).',
    howToFix: 'Check the TLS certificate and the ingress host routing.',
    level: 'warn',
  },
  {
    key: 'HTTP_422',
    hint: 'Unprocessable request',
    detail: 'The request is well-formed but its content cannot be processed.',
    howToFix: 'Read the response message for the rule the content broke.',
    level: 'warn',
  },
  {
    key: 'HTTP_423',
    hint: 'Resource locked',
    detail: 'The resource is locked by another operation.',
    howToFix: 'Retry later.',
    level: 'warn',
    retryable: true,
  },
  {
    key: 'HTTP_424',
    hint: 'Dependent request failed',
    detail: 'A previous request this one depends on failed.',
    howToFix: 'Fix the earlier failed request, then retry this one.',
    level: 'warn',
  },
  {
    key: 'HTTP_428',
    hint: 'Precondition required',
    detail:
      'The request must be conditional (If-Match). The client omitted the ETag.',
    howToFix: 'Send If-Match with the current ETag.',
    level: 'warn',
  },
  {
    key: 'HTTP_429',
    hint: 'Too many requests',
    detail: 'The caller hit the throttler limit.',
    howToFix: 'Retry later.',
    level: 'warn',
  },
  {
    key: 'HTTP_431',
    hint: 'Headers too large',
    detail: 'The request headers exceed the limit (huge cookie or token).',
    howToFix: 'Clear oversized cookies or shorten the token.',
    level: 'warn',
  },
  {
    key: 'HTTP_451',
    hint: 'Blocked for legal reasons',
    detail: 'Access is denied by legal/policy restriction.',
    howToFix: 'Check the legal or policy rule that blocks this resource.',
    level: 'warn',
  },
  {
    key: 'HTTP_500',
    hint: 'Internal server error',
    detail: 'An unexpected error was thrown as InternalServerErrorException.',
    howToFix: 'Read error.cause and the stack for the origin.',
  },
  {
    key: 'HTTP_501',
    hint: 'Not implemented',
    detail:
      'The endpoint or feature is declared but not implemented yet (NotImplementedException).',
    howToFix: 'Implement the endpoint, or hide it until it is ready.',
    category: 'bug',
  },
  {
    key: 'HTTP_502',
    hint: 'Bad gateway',
    detail:
      'An upstream service answered with an invalid response (BadGatewayException).',
    howToFix: 'Check the partner API or the proxy.',
    retryable: true,
  },
  {
    key: 'HTTP_503',
    hint: 'Service unavailable',
    detail:
      'A dependency is busy or down (lock timeout, Kafka, partner API). Usually temporary.',
    howToFix: 'Retry with backoff; check the dependency if it persists.',
    retryable: true,
  },
  {
    key: 'HTTP_504',
    hint: 'Gateway timeout',
    detail:
      'An upstream service did not answer in time (GatewayTimeoutException).',
    howToFix: 'Check the partner API.',
    retryable: true,
  },
  {
    key: 'HTTP_505',
    hint: 'HTTP version unsupported',
    detail: 'The client used an HTTP version the server refuses.',
    howToFix: 'Use HTTP/1.1 or a version the server accepts.',
    level: 'warn',
  },
  {
    key: 'HTTP_507',
    hint: 'Insufficient storage',
    detail: 'The server cannot store the representation (disk or quota full).',
    howToFix: 'Free disk space or raise the storage quota.',
    category: 'dependency',
  },
  {
    key: 'HTTP_508',
    hint: 'Loop detected',
    detail:
      'The server detected an infinite loop while processing the request.',
    howToFix: 'Check the request flow for a redirect or recursive call loop.',
    category: 'bug',
  },
]
