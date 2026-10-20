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
// mistakes, so they log as warn.
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
    key: 'HTTP_409',
    hint: 'Conflict',
    hintDetail:
      'The request conflicts with current data, e.g. a duplicate or a stale status.',
    level: 'warn',
  },
  {
    key: 'HTTP_413',
    hint: 'Payload too large',
    hintDetail: 'The upload or body exceeds the size limit.',
    level: 'warn',
  },
  {
    key: 'HTTP_415',
    hint: 'Unsupported file type',
    hintDetail: 'The uploaded file type is not accepted by this endpoint.',
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
    key: 'HTTP_429',
    hint: 'Too many requests',
    hintDetail: 'The caller hit the throttler limit. Retry later.',
    level: 'warn',
  },
  {
    key: 'HTTP_500',
    hint: 'Internal server error',
    hintDetail:
      'An unexpected error was thrown as InternalServerErrorException. Read error.cause and the stack for the origin.',
  },
  {
    key: 'HTTP_503',
    hint: 'Service unavailable',
    hintDetail:
      'A dependency is busy or down (lock timeout, Kafka, partner API). Usually temporary.',
    retryable: true,
  },
]
