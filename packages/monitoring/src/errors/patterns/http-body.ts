import type { ErrorPattern } from './types'

// Inbound request body parsing: body-parser / raw-body (error.type), multer
// (MulterError.code), busboy (message) and qs.
export const httpBodyPatterns: ErrorPattern[] = [
  {
    key: 'entity.too.large',
    hint: 'Request body too large',
    hintDetail:
      'The JSON/form body exceeds the body-parser limit (100 KB default). Raise the limit for this route, or upload as a file.',
    level: 'warn',
  },
  {
    key: 'entity.parse.failed',
    hint: 'Request body not valid JSON',
    hintDetail:
      'The body could not be parsed as JSON (or urlencoded). The client sent malformed JSON or the wrong Content-Type.',
    level: 'warn',
  },
  {
    key: 'entity.verify.failed',
    hint: 'Body verification failed',
    hintDetail:
      'The verify callback (raw body signature check) rejected the body. A webhook signature mismatch.',
    level: 'warn',
  },
  {
    key: 'charset.unsupported',
    hint: 'Unsupported body charset',
    hintDetail:
      'The Content-Type charset is not supported (only UTF-8 for JSON). The client must send UTF-8.',
    level: 'warn',
  },
  {
    key: 'encoding.unsupported',
    hint: 'Unsupported Content-Encoding',
    hintDetail:
      'The body uses a compression the server does not accept (br, zstd). The client must send identity/gzip.',
    level: 'warn',
  },
  {
    key: 'request.aborted',
    hint: 'Client aborted upload',
    hintDetail:
      'The client closed the connection before the body finished. Not a server fault.',
    level: 'warn',
  },
  {
    key: 'request.size.invalid',
    hint: 'Body length mismatch',
    hintDetail:
      'The body length does not match Content-Length. A broken client or proxy.',
    level: 'warn',
  },
  {
    key: 'stream.not.readable',
    hint: 'Body already read',
    hintDetail:
      'The request stream was consumed before body-parser ran: two body parsers, or a raw-body middleware before the JSON one.',
    category: 'bug',
  },
  {
    key: 'stream.encoding.set',
    hint: 'Body stream encoding set',
    hintDetail:
      'req.setEncoding was called before body-parser. Remove the earlier call.',
    category: 'bug',
  },
  {
    key: 'parameters.too.many',
    hint: 'Too many form parameters',
    hintDetail:
      'The urlencoded body has more than parameterLimit (1000) fields. Raise the limit or send JSON.',
    level: 'warn',
  },
  {
    key: 'LIMIT_FILE_SIZE',
    hint: 'Uploaded file too large',
    hintDetail:
      'The file exceeds the multer fileSize limit. Tell the user the limit, or raise it for this route.',
    level: 'warn',
  },
  {
    key: 'LIMIT_FILE_COUNT',
    hint: 'Too many files uploaded',
    hintDetail:
      'More files than the multer files limit. Check maxCount on the interceptor.',
    level: 'warn',
  },
  {
    key: 'LIMIT_UNEXPECTED_FILE',
    hint: 'Unexpected file field',
    hintDetail:
      'The multipart field name does not match the interceptor (see target). The client must use the expected field name.',
    level: 'warn',
    target: /^Unexpected field(?:: (.+))?$/,
  },
  {
    key: 'LIMIT_PART_COUNT',
    hint: 'Too many multipart parts',
    hintDetail:
      'The multipart body has more parts than the multer parts limit.',
    level: 'warn',
  },
  {
    key: 'LIMIT_FIELD_COUNT',
    hint: 'Too many form fields',
    hintDetail:
      'The multipart body has more non-file fields than the multer fields limit.',
    level: 'warn',
  },
  {
    key: 'LIMIT_FIELD_KEY',
    hint: 'Form field name too long',
    hintDetail: 'A multipart field name exceeds the fieldNameSize limit.',
    level: 'warn',
  },
  {
    key: 'LIMIT_FIELD_VALUE',
    hint: 'Form field value too long',
    hintDetail:
      'A multipart text field exceeds the fieldSize limit (1 MB default). Send large text as a file.',
    level: 'warn',
  },
  {
    key: 'LIMIT_FIELD_NESTING',
    hint: 'Form field nested too deep',
    hintDetail: 'A multipart field name nests deeper than allowed (a[b][c]…).',
    level: 'warn',
  },
  {
    key: 'LIMIT_FIELD_ARRAY_INDEX',
    hint: 'Form array index too large',
    hintDetail: 'A multipart field name uses an array index above the limit.',
    level: 'warn',
  },
  {
    key: 'MISSING_FIELD_NAME',
    hint: 'Form field name missing',
    hintDetail:
      'A multipart part has no name. The client built the form incorrectly.',
    level: 'warn',
  },
  {
    key: 'INVALID_FIELD_NAME',
    hint: 'Form field name invalid',
    hintDetail: 'A multipart field name contains invalid characters.',
    level: 'warn',
  },
  {
    key: 'STREAM_DESTROYED',
    hint: 'Upload stream destroyed',
    hintDetail:
      'The file stream was destroyed mid-upload: the client aborted or the storage engine failed.',
    level: 'warn',
  },
  {
    key: 'MULTIPART_BOUNDARY_MISSING',
    messageMatch: /^Multipart: Boundary not found/,
    hint: 'Multipart boundary missing',
    hintDetail:
      'Content-Type is multipart/form-data without a boundary: the client set the header by hand. Let the HTTP client set it from FormData.',
    level: 'warn',
    category: 'input',
  },
  {
    key: 'MULTIPART_UNEXPECTED_END',
    messageMatch: /^Unexpected end of form$/,
    hint: 'Multipart body truncated',
    hintDetail:
      'The multipart body ended before the closing boundary: the client aborted, a proxy cut the upload, or Content-Length was wrong.',
    level: 'warn',
    category: 'input',
  },
  {
    key: 'MULTIPART_MALFORMED_HEADER',
    messageMatch: /^Malformed part header$/,
    hint: 'Multipart header malformed',
    hintDetail:
      'A part header in the multipart body is invalid. A broken client.',
    level: 'warn',
    category: 'input',
  },
  {
    key: 'MULTIPART_CONTENT_TYPE',
    messageMatch:
      /^(Missing Content-Type|Malformed content type|Unsupported content type)/,
    hint: 'Upload Content-Type invalid',
    hintDetail:
      'The request Content-Type is missing or not multipart/form-data. The client must send a multipart form.',
    level: 'warn',
    category: 'input',
  },
  {
    key: 'MULTIPART_URLENCODED_MALFORMED',
    messageMatch: /^Malformed urlencoded form$/,
    hint: 'Form body malformed',
    hintDetail: 'The urlencoded body could not be parsed.',
    level: 'warn',
    category: 'input',
  },
]
