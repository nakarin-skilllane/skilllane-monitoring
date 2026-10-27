import type { ErrorPattern } from './types'

/** jsonwebtoken: the message says which check failed. */
function explainJwt({ message }: { message: string }) {
  const cases: [RegExp, string, string][] = [
    [
      /^jwt malformed/,
      'format',
      'The token is not three base64url parts: a truncated header, a cookie value, or an empty string was passed.',
    ],
    [
      /^jwt must be provided|^jwt must be a string/,
      'missing',
      'No token was passed: the Authorization header is missing or not "Bearer <token>".',
    ],
    [
      /^invalid signature/,
      'signature',
      'The signature does not match the secret/public key: a token from another environment, or JWT_SECRET changed.',
    ],
    [
      /^invalid algorithm/,
      'algorithm',
      'The token alg is not in the allowed algorithms (HS256 vs RS256). Check the verify options and the issuer.',
    ],
    [
      /^jwt audience invalid/,
      'audience',
      'The aud claim does not match the expected audience. The token was issued for another client.',
    ],
    [
      /^jwt issuer invalid/,
      'issuer',
      'The iss claim does not match the expected issuer. The token comes from another identity provider or environment.',
    ],
    [
      /^jwt subject invalid/,
      'subject',
      'The sub claim does not match the expected subject.',
    ],
    [/^jwt jwtid invalid/, 'jti', 'The jti claim does not match.'],
    [
      /^jwt signature is required/,
      'signature',
      'An unsigned token (alg none) was presented. Reject it.',
    ],
    [
      /^secret or public key must be provided/,
      'secret',
      'The verify call has no secret/key: the JWT secret env var is missing.',
    ],
    [
      /^secretOrPublicKey/,
      'secret',
      'The key material does not match the algorithm (a PEM for HS256, a string for RS256). Check the JWT config.',
    ],
    [
      /^invalid (exp|nbf) value/,
      'claims',
      'The exp/nbf claim is not a number. The token was built with a wrong option type.',
    ],
    [/^maxAge exceeded/, 'age', 'The token is older than the maxAge option.'],
  ]
  for (const [match, target, fix] of cases) {
    if (match.test(message)) return { target, fix }
  }
  return undefined
}

// Framework errors (JWT, JSON, validation libraries) and common app errorCode
// values (duplicate, busy, file import).
export const appPatterns: ErrorPattern[] = [
  {
    key: 'TokenExpiredError',
    hint: 'Token expired',
    hintDetail:
      'The JWT is past its exp time. The client should refresh or sign in again.',
    level: 'warn',
  },
  {
    key: 'NotBeforeError',
    hint: 'Token not active yet',
    hintDetail:
      'The JWT nbf time is in the future. Clock skew between the issuer and this server; allow a small clockTolerance.',
    level: 'warn',
  },
  {
    key: 'JsonWebTokenError',
    hint: 'Invalid token',
    hintDetail:
      'The JWT signature or format is invalid (see fix). It may be tampered with, or signed by another environment.',
    level: 'warn',
    explain: explainJwt,
  },
  {
    key: 'INVALID_JSON',
    messageMatch:
      /(Unexpected token .* in JSON|is not valid JSON|Unexpected end of JSON input|in JSON at position \d+|Unterminated string in JSON|Expected (property name|',' or '}'|double-quoted property name|',' or ']') .*JSON|Unexpected non-whitespace character after JSON|Bad control character in string literal in JSON)/,
    hint: 'Invalid JSON',
    hintDetail:
      'JSON.parse received malformed text. Check the producer of the payload or message; an HTML error page in place of JSON is common.',
    category: 'bug',
    explain: ({ message }) => {
      const token = message.match(/Unexpected token '?(.)'?/)?.[1]
      if (token === '<')
        return {
          target: 'html',
          fix: 'The text starts with "<": an HTML error/login page was parsed as JSON. Check the HTTP status and content-type before parsing.',
        }
      if (/Unexpected end of JSON input/.test(message))
        return {
          target: 'truncated',
          fix: 'The JSON ends early: an empty body, a truncated message, or a string cut by a column size limit.',
        }
      return undefined
    },
  },
  {
    key: 'ValidationError',
    hint: 'Validation failed',
    hintDetail:
      'A validation library (class-validator, Joi, Yup, Mongoose) rejected the input. The message lists the failing fields.',
    level: 'warn',
  },
  {
    key: 'ZodError',
    hint: 'Validation failed',
    hintDetail:
      'A Zod schema rejected the input. error.issues lists each path and rule.',
    level: 'warn',
    explain: ({ error }) => {
      const paths = Array.isArray(error?.issues)
        ? [
            ...new Set(
              error.issues
                .map((issue: any) =>
                  Array.isArray(issue?.path) ? issue.path.join('.') : undefined,
                )
                .filter(Boolean),
            ),
          ].slice(0, 6)
        : []
      return paths.length
        ? {
            target: paths.join(', '),
            fix: `Rejected fields: ${paths.join(', ')}.`,
          }
        : undefined
    },
  },
  {
    key: 'CastError',
    hint: 'Value has wrong type',
    hintDetail:
      'A value could not be cast to the schema type (e.g. an invalid ObjectId or a non-numeric id). Validate the input first.',
    level: 'warn',
    target: /for path "([^"]+)"/,
  },
  {
    key: 'DUPLICATE_RECORD',
    hint: 'Duplicate record',
    hintDetail:
      'A unique constraint rejected the row (ORA-00001). Often a double submit or concurrent insert.',
    level: 'warn',
  },
  {
    key: 'RESOURCE_BUSY',
    hint: 'Record is locked',
    hintDetail: 'Another transaction holds the lock. Retry shortly.',
    retryable: true,
  },
  {
    key: 'VALUE_TOO_LONG',
    hint: 'Value too long',
    hintDetail: 'A value exceeds the column size (ORA-12899).',
    level: 'warn',
  },
  {
    key: 'REQUIRED_FIELD_MISSING',
    hint: 'Required field missing',
    hintDetail: 'A NOT NULL column was left empty (ORA-01400).',
    level: 'warn',
  },
  {
    key: 'RELATED_RECORD_NOT_FOUND',
    hint: 'Related record not found',
    hintDetail: 'A foreign key points to a missing record (ORA-02291).',
    level: 'warn',
  },
  {
    key: 'RELATED_RECORD_IN_USE',
    hint: 'Record still in use',
    hintDetail: 'Other records still reference this one (ORA-02292).',
    level: 'warn',
  },
  {
    key: 'VALIDATION_ERROR',
    hint: 'Invalid request',
    hintDetail: 'The request data failed validation.',
    level: 'warn',
  },
  {
    key: 'HEADER_VALIDATION_ERROR',
    hint: 'Wrong file headers',
    hintDetail: 'The uploaded file columns do not match the template.',
    level: 'warn',
  },
  {
    key: 'FILE_EMPTY',
    hint: 'Uploaded file is empty',
    hintDetail: 'The uploaded file has no data rows.',
    level: 'warn',
  },
  {
    key: 'FILE_ALREADY_PROCESSED',
    hint: 'File already processed',
    hintDetail: 'This import file was processed before.',
    level: 'warn',
  },
  {
    key: 'EXCEL_INVALID_FILE',
    messageMatch:
      /^(End of data reached|Can't find end of central directory|File is not a zip file|Corrupted zip|Invalid signature)/i,
    hint: 'Excel file unreadable',
    hintDetail:
      'The uploaded .xlsx is not a valid zip/OOXML file: a renamed .xls/.csv, a truncated upload, or an HTML download page. Validate the file signature.',
    level: 'warn',
    category: 'input',
  },
  {
    key: 'CSV_PARSE_ERROR',
    messageMatch:
      /^(Invalid Record Length|Invalid Opening Quote|Invalid Closing Quote|Quote Not Closed|Unclosed quote)/i,
    hint: 'CSV malformed',
    hintDetail:
      'The CSV has a row with the wrong number of columns or a broken quote. The message names the line.',
    level: 'warn',
    category: 'input',
    target: /on line (\d+)/,
  },
]
