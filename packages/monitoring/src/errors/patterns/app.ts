import type { ErrorPattern } from './types'

// Sources:
// - https://github.com/auth0/node-jsonwebtoken/blob/master/verify.js (jsonwebtoken error classes and messages)
// - https://github.com/v8/v8/blob/main/src/common/message-template.h (JSON.parse SyntaxError messages)
// - https://zod.dev/basics (ZodError and error.issues)
// - https://mongoosejs.com/docs/api/error.html (Mongoose CastError and ValidationError)
// - https://docs.oracle.com/en/error-help/db/ora-00001/ (Oracle error help, also ORA-01400, ORA-02291, ORA-02292, ORA-12899)
// - https://github.com/Stuk/jszip/blob/main/lib/zipEntries.js (zip errors raised when reading .xlsx files)
// - https://csv.js.org/parse/errors/ (csv-parse errors)

/**
 * jsonwebtoken: the message says which check failed. Each case gives the
 * detail, and a howToFix only where the pattern's own does not fit.
 */
function explainJwt({ message }: { message: string }) {
  const cases: [RegExp, string, string, string?][] = [
    [
      /^jwt malformed/,
      'format',
      'The token does not have three dot-separated parts: it was truncated, or another value (a cookie, an opaque token) was passed as the JWT.',
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
      'The token alg is not in the allowed algorithms (HS256 vs RS256).',
      'Check the verify options and the issuer.',
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
      'An unsigned token (alg none) was presented.',
      'Reject the token.',
    ],
    [
      /^secret or public key must be provided/,
      'secret',
      'The verify call has no secret/key: the JWT secret env var is missing.',
      'Set the JWT secret env var.',
    ],
    [
      /^secretOrPublicKey/,
      'secret',
      'The key material does not match the algorithm (a PEM for HS256, a string for RS256).',
      'Check the JWT config.',
    ],
    [
      /^invalid (exp|nbf) value/,
      'claims',
      'The exp/nbf claim is not a number. The token was built with a wrong option type.',
    ],
    [/^maxAge exceeded/, 'age', 'The token is older than the maxAge option.'],
  ]
  for (const [match, target, detail, howToFix] of cases) {
    if (match.test(message)) return { target, detail, howToFix }
  }
  return undefined
}

// Framework errors (JWT, JSON, validation libraries) and common app errorCode
// values (duplicate, busy, file import).
export const appPatterns: ErrorPattern[] = [
  {
    key: 'TokenExpiredError',
    hint: 'Token expired',
    detail:
      'The JWT is past its exp time, or older than the maxAge verify option.',
    howToFix: 'Have the client refresh the token or sign in again.',
    level: 'warn',
  },
  {
    key: 'NotBeforeError',
    hint: 'Token not active yet',
    detail:
      'The JWT nbf time is in the future: clock skew between the issuer and this server.',
    howToFix: 'Allow a small clockTolerance.',
    level: 'warn',
  },
  {
    key: 'JsonWebTokenError',
    hint: 'Invalid token',
    detail:
      'The JWT signature or format is invalid. It may be tampered with, or signed by another environment.',
    howToFix:
      'Have the client sign in again; if every token fails, check the JWT secret and verify options.',
    level: 'warn',
    explain: explainJwt,
  },
  {
    key: 'INVALID_JSON',
    messageMatch:
      /(Unexpected token .* in JSON|is not valid JSON|Unexpected end of JSON input|in JSON at position \d+|Unterminated string in JSON|Expected (property name|',' or '}'|double-quoted property name|',' or ']') .*JSON|Unexpected non-whitespace character after JSON|Bad control character in string literal in JSON)/,
    hint: 'Invalid JSON',
    detail:
      'JSON.parse received malformed text; an HTML error page in place of JSON is common.',
    howToFix: 'Check the producer of the payload or message.',
    category: 'bug',
    explain: ({ message }) => {
      const token = message.match(/Unexpected token '?(.)'?/)?.[1]
      if (token === '<')
        return {
          target: 'html',
          detail:
            'The text starts with "<": an HTML error/login page was parsed as JSON.',
          howToFix: 'Check the HTTP status and content-type before parsing.',
        }
      if (/Unexpected end of JSON input/.test(message))
        return {
          target: 'truncated',
          detail:
            'The JSON ends early: an empty body, a truncated message, or a string cut by a column size limit.',
        }
      return undefined
    },
  },
  {
    key: 'ValidationError',
    hint: 'Validation failed',
    detail:
      'A validation library (class-validator, Joi, Yup, Mongoose) rejected the input.',
    howToFix: 'Correct the failing fields listed in the error message.',
    level: 'warn',
  },
  {
    key: 'ZodError',
    hint: 'Validation failed',
    detail: 'A Zod schema rejected the input.',
    howToFix:
      'Read error.issues for each path and rule, and correct those fields.',
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
            detail: `Rejected fields: ${paths.join(', ')}.`,
          }
        : undefined
    },
  },
  {
    key: 'CastError',
    hint: 'Value has wrong type',
    detail:
      'A value could not be cast to the schema type (e.g. an invalid ObjectId or a non-numeric id).',
    howToFix: 'Validate the input first.',
    level: 'warn',
    target: /for path "([^"]+)"/,
  },
  {
    key: 'DUPLICATE_RECORD',
    hint: 'Duplicate record',
    detail:
      'A unique constraint rejected the row (ORA-00001), often a double submit or concurrent insert.',
    howToFix:
      'Check for an existing record before inserting, and block double submits.',
    level: 'warn',
  },
  {
    key: 'RESOURCE_BUSY',
    hint: 'Record is locked',
    detail: 'Another transaction holds the lock.',
    howToFix: 'Retry shortly.',
    retryable: true,
  },
  {
    key: 'VALUE_TOO_LONG',
    hint: 'Value too long',
    detail: 'A value exceeds the column size (ORA-12899).',
    howToFix:
      'Validate the value length against the column size before saving.',
    level: 'warn',
  },
  {
    key: 'REQUIRED_FIELD_MISSING',
    hint: 'Required field missing',
    detail: 'A NOT NULL column was left empty (ORA-01400).',
    howToFix: 'Validate that the required field is set before saving.',
    level: 'warn',
  },
  {
    key: 'RELATED_RECORD_NOT_FOUND',
    hint: 'Related record not found',
    detail: 'A foreign key points to a missing record (ORA-02291).',
    howToFix: 'Check that the referenced record exists before saving.',
    level: 'warn',
  },
  {
    key: 'RELATED_RECORD_IN_USE',
    hint: 'Record still in use',
    detail: 'Other records still reference this one (ORA-02292).',
    howToFix: 'Remove or reassign the referencing records first.',
    level: 'warn',
  },
  {
    key: 'VALIDATION_ERROR',
    hint: 'Invalid request',
    detail: 'The request data failed validation.',
    howToFix: 'Correct the request data and send it again.',
    level: 'warn',
  },
  {
    key: 'HEADER_VALIDATION_ERROR',
    hint: 'Wrong file headers',
    detail: 'The uploaded file columns do not match the template.',
    howToFix: 'Use the current template and keep its column headers unchanged.',
    level: 'warn',
  },
  {
    key: 'FILE_EMPTY',
    hint: 'Uploaded file is empty',
    detail: 'The uploaded file has no data rows.',
    howToFix: 'Upload a file that has data rows below the header.',
    level: 'warn',
  },
  {
    key: 'FILE_ALREADY_PROCESSED',
    hint: 'File already processed',
    detail: 'This import file was processed before.',
    howToFix:
      'Check the import history instead of uploading the same file again.',
    level: 'warn',
  },
  {
    key: 'EXCEL_INVALID_FILE',
    messageMatch:
      /^(End of data reached|Can't find end of central directory|File is not a zip file|Corrupted zip|Invalid signature)/i,
    hint: 'Excel file unreadable',
    detail:
      'The uploaded .xlsx is not a valid zip/OOXML file: a renamed .xls/.csv, a truncated upload, or an HTML download page.',
    howToFix:
      'Ask for a real .xlsx file, and reject uploads that are not a zip file before parsing them.',
    level: 'warn',
    category: 'input',
  },
  {
    key: 'CSV_PARSE_ERROR',
    messageMatch:
      /^(Invalid Record Length|Invalid Opening Quote|Invalid Closing Quote|Quote Not Closed|Unclosed quote)/i,
    hint: 'CSV malformed',
    detail:
      'The CSV has a row with the wrong number of columns or a broken quote. The message names the line.',
    howToFix: 'Fix the columns or quotes on that line and upload again.',
    level: 'warn',
    category: 'input',
    target: /on line (\d+)/,
  },
]
