import type { ErrorPattern } from './types'

// Sources:
// - https://github.com/expressjs/body-parser/blob/master/README.md (error types, limit and parameterLimit defaults)
// - https://github.com/expressjs/multer/blob/main/README.md (limits and their defaults, LIMIT_UNEXPECTED_FILE)
// - https://github.com/expressjs/multer/blob/main/lib/multer-error.js (MulterError codes)
// - https://github.com/mscdex/busboy/blob/master/lib/types/multipart.js (multipart parse error messages)

// Inbound request body parsing: body-parser / raw-body (error.type), multer
// (MulterError.code), busboy (message) and qs.
export const httpBodyPatterns: ErrorPattern[] = [
  {
    key: 'entity.too.large',
    hint: 'Request body too large',
    detail:
      'The JSON/form body exceeds the body-parser limit (100 KB default).',
    howToFix: 'Raise the limit for this route, or upload as a file.',
    level: 'warn',
  },
  {
    key: 'entity.parse.failed',
    hint: 'Request body not valid JSON',
    detail:
      'The body could not be parsed as JSON (or urlencoded). The client sent malformed JSON or the wrong Content-Type.',
    howToFix: 'Send valid JSON with a matching Content-Type from the client.',
    level: 'warn',
  },
  {
    key: 'entity.verify.failed',
    hint: 'Body verification failed',
    detail:
      'The verify callback (raw body signature check) rejected the body. A webhook signature mismatch.',
    howToFix:
      'Check the webhook signing secret in env and that the signature is computed on the raw body.',
    level: 'warn',
  },
  {
    key: 'charset.unsupported',
    hint: 'Unsupported body charset',
    detail:
      'The Content-Type charset is not supported: JSON accepts only UTF charsets, the other parsers only what iconv-lite knows.',
    howToFix: 'The client must send UTF-8.',
    level: 'warn',
  },
  {
    key: 'encoding.unsupported',
    hint: 'Unsupported Content-Encoding',
    detail:
      'The Content-Encoding is one body-parser cannot inflate, or inflation is disabled (inflate: false).',
    howToFix:
      'Send the body uncompressed or with an encoding the parser supports, or enable inflate on the parser.',
    level: 'warn',
  },
  {
    key: 'request.aborted',
    hint: 'Client aborted upload',
    detail:
      'The client closed the connection before the body finished. Not a server fault.',
    howToFix:
      'No server fix is needed; check the client network or upload timeout if it repeats.',
    level: 'warn',
  },
  {
    key: 'request.size.invalid',
    hint: 'Body length mismatch',
    detail:
      'The body length does not match Content-Length. A broken client or proxy.',
    howToFix:
      'Check that the client computes Content-Length in bytes, not characters, and that no proxy rewrites the body.',
    level: 'warn',
  },
  {
    key: 'stream.not.readable',
    hint: 'Body already read',
    detail:
      'The request stream was consumed before body-parser ran: two body parsers, or a raw-body middleware before the JSON one.',
    howToFix:
      'Keep one body parser per route, or scope the raw-body middleware to its own routes.',
    category: 'bug',
  },
  {
    key: 'stream.encoding.set',
    hint: 'Body stream encoding set',
    detail: 'req.setEncoding was called before body-parser.',
    howToFix: 'Remove the earlier req.setEncoding call.',
    category: 'bug',
  },
  {
    key: 'parameters.too.many',
    hint: 'Too many form parameters',
    detail: 'The urlencoded body has more than parameterLimit (1000) fields.',
    howToFix: 'Raise the limit or send JSON.',
    level: 'warn',
  },
  {
    key: 'LIMIT_FILE_SIZE',
    hint: 'Uploaded file too large',
    detail: 'The file exceeds the multer fileSize limit.',
    howToFix: 'Tell the user the limit, or raise it for this route.',
    level: 'warn',
  },
  {
    key: 'LIMIT_FILE_COUNT',
    hint: 'Too many files uploaded',
    detail: 'The upload has more files than the multer files limit.',
    howToFix:
      'Send fewer files, or raise limits.files for this route; too many files for one field raises LIMIT_UNEXPECTED_FILE instead.',
    level: 'warn',
  },
  {
    key: 'LIMIT_UNEXPECTED_FILE',
    hint: 'Unexpected file field',
    detail:
      "A file arrived in a field the interceptor does not accept, or beyond that field's maxCount (see target).",
    howToFix:
      'The client must use the expected field name and send no more files than maxCount.',
    level: 'warn',
    target: /^Unexpected field(?:: (.+))?$/,
  },
  {
    key: 'LIMIT_PART_COUNT',
    hint: 'Too many multipart parts',
    detail: 'The multipart body has more parts than the multer parts limit.',
    howToFix:
      'Send fewer parts, or raise the multer parts limit for this route.',
    level: 'warn',
  },
  {
    key: 'LIMIT_FIELD_COUNT',
    hint: 'Too many form fields',
    detail:
      'The multipart body has more non-file fields than the multer fields limit.',
    howToFix:
      'Send fewer fields, or raise the multer fields limit for this route.',
    level: 'warn',
  },
  {
    key: 'LIMIT_FIELD_KEY',
    hint: 'Form field name too long',
    detail: 'A multipart field name exceeds the fieldNameSize limit.',
    howToFix: 'Shorten the field names, or raise fieldNameSize for this route.',
    level: 'warn',
  },
  {
    key: 'LIMIT_FIELD_VALUE',
    hint: 'Form field value too long',
    detail:
      'A multipart text field exceeds the fieldSize limit (1 MB default).',
    howToFix: 'Send large text as a file.',
    level: 'warn',
  },
  {
    key: 'LIMIT_FIELD_NESTING',
    hint: 'Form field nested too deep',
    detail: 'A multipart field name nests deeper than allowed (a[b][c]…).',
    howToFix: 'Flatten the field names, or send the data as JSON.',
    level: 'warn',
  },
  {
    key: 'LIMIT_FIELD_ARRAY_INDEX',
    hint: 'Form array index too large',
    detail: 'A multipart field name uses an array index above the limit.',
    howToFix: 'Send large arrays as JSON instead of indexed form fields.',
    level: 'warn',
  },
  {
    key: 'MISSING_FIELD_NAME',
    hint: 'Form field name missing',
    detail:
      'A multipart part has no name. The client built the form incorrectly.',
    howToFix: 'Give every part a field name when the client builds the form.',
    level: 'warn',
  },
  {
    key: 'INVALID_FIELD_NAME',
    hint: 'Form field name invalid',
    detail:
      'A multipart field name could not be added to req.body, e.g. an array index so large that appending to it overflows.',
    howToFix:
      'Use plain names or small array indexes in the client form; set fieldArrayIndexLimit to reject large indexes early.',
    level: 'warn',
  },
  {
    key: 'STREAM_DESTROYED',
    hint: 'Upload stream destroyed',
    detail:
      'The file stream was already destroyed when disk storage tried to write it: the client aborted or the upload failed earlier.',
    howToFix:
      'Retry the upload; if the client did not abort, look for an earlier error on the same request.',
    level: 'warn',
  },
  {
    key: 'MULTIPART_BOUNDARY_MISSING',
    messageMatch: /^Multipart: Boundary not found/,
    hint: 'Multipart boundary missing',
    detail:
      'Content-Type is multipart/form-data without a boundary: the client set the header by hand.',
    howToFix: 'Let the HTTP client set the Content-Type header from FormData.',
    level: 'warn',
    category: 'input',
  },
  {
    key: 'MULTIPART_UNEXPECTED_END',
    messageMatch: /^Unexpected end of form$/,
    hint: 'Multipart body truncated',
    detail:
      'The multipart body ended before the closing boundary: the client aborted, a proxy cut the upload, or Content-Length was wrong.',
    howToFix:
      'Retry the upload; check proxy body limits and timeouts if it repeats.',
    level: 'warn',
    category: 'input',
  },
  {
    key: 'MULTIPART_MALFORMED_HEADER',
    messageMatch: /^Malformed part header$/,
    hint: 'Multipart header malformed',
    detail: 'A part header in the multipart body is invalid. A broken client.',
    howToFix: 'Build the form with a standard FormData client.',
    level: 'warn',
    category: 'input',
  },
  {
    key: 'MULTIPART_CONTENT_TYPE',
    messageMatch:
      /^(Missing Content-Type|Malformed content type|Unsupported content type)/,
    hint: 'Upload Content-Type invalid',
    detail:
      'The request Content-Type is missing, malformed, or neither multipart/form-data nor urlencoded.',
    howToFix: 'The client must send a multipart form.',
    level: 'warn',
    category: 'input',
  },
  {
    key: 'MULTIPART_URLENCODED_MALFORMED',
    messageMatch: /^Malformed urlencoded form$/,
    hint: 'Form body malformed',
    detail: 'The urlencoded body has an invalid percent-encoding sequence.',
    howToFix:
      'Check that the client encodes the body as application/x-www-form-urlencoded.',
    level: 'warn',
    category: 'input',
  },
]
