import type { ErrorPattern, ExplainInput, Explanation } from './types'

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
    fix: `Rejected fields: ${fields.join(', ')}. The response message lists the rule each one broke.`,
  }
}

// NestJS HttpException without an errorCode → HTTP_<status>. 4xx are caller
// mistakes, so they log as warn. One entry per built-in exception class.
export const nestHttpPatterns: ErrorPattern[] = [
  {
    key: 'HTTP_400',
    hint: 'Invalid request',
    hintDetail:
      'The request failed validation or business rules. The response message says which field.',
    level: 'warn',
    explain: explainValidation,
  },
  {
    key: 'HTTP_401',
    hint: 'Not authenticated',
    hintDetail: 'The token is missing, expired or invalid.',
    level: 'warn',
  },
  {
    key: 'HTTP_402',
    hint: 'Payment required',
    hintDetail:
      'The resource needs a paid plan or an unpaid balance blocks it.',
    level: 'warn',
  },
  {
    key: 'HTTP_403',
    hint: 'Not allowed',
    hintDetail:
      'The user role lacks permission. For a new route, check that a policy row is seeded for this method and path.',
    level: 'warn',
  },
  {
    key: 'HTTP_404',
    hint: 'Not found',
    hintDetail: 'The requested record or route does not exist.',
    level: 'warn',
  },
  {
    key: 'HTTP_405',
    hint: 'Method not allowed',
    hintDetail:
      'The route exists but not for this HTTP method. The client used the wrong verb.',
    level: 'warn',
  },
  {
    key: 'HTTP_406',
    hint: 'Not acceptable',
    hintDetail:
      'The server cannot produce a response matching the Accept header.',
    level: 'warn',
  },
  {
    key: 'HTTP_408',
    hint: 'Request timeout',
    hintDetail:
      'The handler gave up waiting (RequestTimeoutException, TimeoutInterceptor). The work behind it is slow.',
    retryable: true,
  },
  {
    key: 'HTTP_409',
    hint: 'Conflict',
    hintDetail:
      'The request conflicts with current data, e.g. a duplicate or a stale status.',
    level: 'warn',
  },
  {
    key: 'HTTP_410',
    hint: 'Gone',
    hintDetail:
      'The resource was permanently removed (expired link, retired API).',
    level: 'warn',
  },
  {
    key: 'HTTP_411',
    hint: 'Content-Length required',
    hintDetail:
      'The request body was sent without Content-Length. A client/proxy issue.',
    level: 'warn',
  },
  {
    key: 'HTTP_412',
    hint: 'Precondition failed',
    hintDetail:
      'An If-Match/ETag or business precondition did not hold. The client works on stale data.',
    level: 'warn',
  },
  {
    key: 'HTTP_413',
    hint: 'Payload too large',
    hintDetail: 'The upload or body exceeds the size limit.',
    level: 'warn',
  },
  {
    key: 'HTTP_414',
    hint: 'URI too long',
    hintDetail:
      'The query string is too long (huge id lists). Send the list in the body.',
    level: 'warn',
  },
  {
    key: 'HTTP_415',
    hint: 'Unsupported file type',
    hintDetail: 'The uploaded file type is not accepted by this endpoint.',
    level: 'warn',
  },
  {
    key: 'HTTP_416',
    hint: 'Range not satisfiable',
    hintDetail:
      'The Range header is outside the file size (resumed download past the end).',
    level: 'warn',
  },
  {
    key: 'HTTP_417',
    hint: 'Expectation failed',
    hintDetail: 'An Expect header could not be met.',
    level: 'warn',
  },
  {
    key: 'HTTP_418',
    hint: 'I am a teapot',
    hintDetail: 'ImATeapotException: a placeholder status thrown on purpose.',
    level: 'warn',
  },
  {
    key: 'HTTP_421',
    hint: 'Misdirected request',
    hintDetail:
      'The request reached a server that cannot answer for this host (TLS/SNI or ingress routing).',
    level: 'warn',
  },
  {
    key: 'HTTP_422',
    hint: 'Unprocessable request',
    hintDetail:
      'The request is well-formed but its content cannot be processed.',
    level: 'warn',
  },
  {
    key: 'HTTP_423',
    hint: 'Resource locked',
    hintDetail: 'The resource is locked by another operation. Retry later.',
    level: 'warn',
    retryable: true,
  },
  {
    key: 'HTTP_424',
    hint: 'Dependent request failed',
    hintDetail: 'A previous request this one depends on failed.',
    level: 'warn',
  },
  {
    key: 'HTTP_428',
    hint: 'Precondition required',
    hintDetail:
      'The request must be conditional (If-Match). The client omitted the ETag.',
    level: 'warn',
  },
  {
    key: 'HTTP_429',
    hint: 'Too many requests',
    hintDetail: 'The caller hit the throttler limit. Retry later.',
    level: 'warn',
  },
  {
    key: 'HTTP_431',
    hint: 'Headers too large',
    hintDetail: 'The request headers exceed the limit (huge cookie or token).',
    level: 'warn',
  },
  {
    key: 'HTTP_451',
    hint: 'Blocked for legal reasons',
    hintDetail: 'Access is denied by legal/policy restriction.',
    level: 'warn',
  },
  {
    key: 'HTTP_500',
    hint: 'Internal server error',
    hintDetail:
      'An unexpected error was thrown as InternalServerErrorException. Read error.cause and the stack for the origin.',
  },
  {
    key: 'HTTP_501',
    hint: 'Not implemented',
    hintDetail:
      'The endpoint or feature is declared but not implemented yet (NotImplementedException).',
    category: 'bug',
  },
  {
    key: 'HTTP_502',
    hint: 'Bad gateway',
    hintDetail:
      'An upstream service answered with an invalid response (BadGatewayException). Check the partner API or the proxy.',
    retryable: true,
  },
  {
    key: 'HTTP_503',
    hint: 'Service unavailable',
    hintDetail:
      'A dependency is busy or down (lock timeout, Kafka, partner API). Usually temporary.',
    retryable: true,
  },
  {
    key: 'HTTP_504',
    hint: 'Gateway timeout',
    hintDetail:
      'An upstream service did not answer in time (GatewayTimeoutException). Check the partner API.',
    retryable: true,
  },
  {
    key: 'HTTP_505',
    hint: 'HTTP version unsupported',
    hintDetail: 'The client used an HTTP version the server refuses.',
    level: 'warn',
  },
  {
    key: 'HTTP_507',
    hint: 'Insufficient storage',
    hintDetail:
      'The server cannot store the representation (disk or quota full).',
    category: 'dependency',
  },
  {
    key: 'HTTP_508',
    hint: 'Loop detected',
    hintDetail:
      'The server detected an infinite loop while processing the request.',
    category: 'bug',
  },
]
