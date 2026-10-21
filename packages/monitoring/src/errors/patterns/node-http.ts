import type { ErrorPattern } from './types'

// Node http server, HTTP parser (llhttp HPE_*) and stream errors.
export const nodeHttpPatterns: ErrorPattern[] = [
  {
    key: 'ERR_HTTP_HEADERS_SENT',
    hint: 'Response already sent',
    hintDetail:
      'Code set headers or a status after the response started: a handler that calls res.send and also returns a value, or two replies on one error.',
    category: 'bug',
  },
  {
    key: 'ERR_HTTP_REQUEST_TIMEOUT',
    hint: 'Client request timed out',
    hintDetail:
      'The client did not send the whole request within server.requestTimeout. Slow upload or a stalled client.',
    level: 'warn',
  },
  {
    key: 'ERR_HTTP_INVALID_STATUS_CODE',
    hint: 'Invalid HTTP status code',
    hintDetail:
      'A status outside 100-999 was set, often undefined from a missing mapping. Check the status the filter computes.',
    category: 'bug',
  },
  {
    key: 'ERR_HTTP_INVALID_HEADER_VALUE',
    hint: 'Invalid header value',
    hintDetail:
      'A header was set to undefined or an invalid value. Check the value is defined before setting it.',
    category: 'bug',
  },
  {
    key: 'ERR_HTTP_TRAILER_INVALID',
    hint: 'Invalid HTTP trailer',
    hintDetail: 'Trailers were set without chunked transfer encoding.',
    category: 'bug',
  },
  {
    key: 'ERR_INVALID_HTTP_TOKEN',
    hint: 'Invalid header name',
    hintDetail:
      'A header name or method contains forbidden characters (space, colon, non-ASCII). Check dynamic header names.',
    category: 'bug',
  },
  {
    key: 'ERR_INVALID_CHAR',
    hint: 'Invalid header character',
    hintDetail:
      'A header value contains a newline or control character, often a Thai/unicode file name in Content-Disposition. Encode it (RFC 5987).',
    category: 'bug',
  },
  {
    key: 'ERR_UNESCAPED_CHARACTERS',
    hint: 'URL has unescaped characters',
    hintDetail:
      'The request path contains spaces or unicode. Use encodeURIComponent on path segments and query values.',
    category: 'bug',
  },
  {
    key: 'ERR_INVALID_URL',
    hint: 'Invalid URL',
    hintDetail:
      'new URL() could not parse the value: missing scheme (host without http://), empty env var, or a path passed where a full URL is needed.',
    category: 'config',
  },
  {
    key: 'ERR_INVALID_URL_SCHEME',
    hint: 'Wrong URL scheme',
    hintDetail:
      'The URL scheme is not what the API expects (e.g. file: for fs, http(s): for fetch).',
    category: 'bug',
  },
  {
    key: 'HPE_HEADER_OVERFLOW',
    hint: 'HTTP headers too large',
    hintDetail:
      'The headers exceed the 16 KB limit (max-http-header-size): a huge cookie or token. Trim the headers or raise the limit.',
    level: 'warn',
  },
  {
    key: 'HPE_INVALID_HEADER_TOKEN',
    hint: 'Malformed HTTP header',
    hintDetail:
      'The peer sent a header with invalid characters. A broken client or proxy; the request/response was dropped.',
    level: 'warn',
  },
  {
    key: 'HPE_INVALID_METHOD',
    hint: 'Invalid HTTP method',
    hintDetail:
      'The request line has an unknown method: non-HTTP traffic (TLS on a plain port, a scanner) hit the server.',
    level: 'warn',
  },
  {
    key: 'HPE_INVALID_CONSTANT',
    hint: 'Malformed HTTP message',
    hintDetail:
      'The parser expected an HTTP token and got something else: non-HTTP data on the port, or a corrupted proxy response.',
    level: 'warn',
  },
  {
    key: 'HPE_INVALID_STATUS',
    hint: 'Malformed HTTP status',
    hintDetail:
      'The upstream response status line is invalid. The upstream is not speaking HTTP.',
  },
  {
    key: 'HPE_UNEXPECTED_CONTENT_LENGTH',
    hint: 'Conflicting content length',
    hintDetail:
      'The message has both Content-Length and chunked encoding, or two Content-Length headers. A broken upstream or proxy.',
  },
  {
    key: 'HPE_INVALID_CHUNK_SIZE',
    hint: 'Invalid chunked encoding',
    hintDetail:
      'A chunk size in the body is not valid hex. The upstream response stream is corrupted.',
  },
  {
    key: 'HPE_INVALID_EOF_STATE',
    hint: 'Response ended early',
    hintDetail:
      'The connection closed in the middle of an HTTP message. The upstream crashed or a proxy cut the stream.',
    retryable: true,
  },
  {
    key: 'HPE_CR_EXPECTED',
    hint: 'Malformed HTTP line ending',
    hintDetail:
      'A header line ended with a bare LF. The peer is not RFC-compliant; Node rejects it by default.',
  },
  {
    key: 'HPE_LF_EXPECTED',
    hint: 'Malformed HTTP line ending',
    hintDetail:
      'A CR was not followed by LF. The peer sent a malformed HTTP message.',
  },
  {
    key: 'HPE_PAUSED_UPGRADE',
    hint: 'HTTP upgrade not handled',
    hintDetail:
      'The server received an Upgrade (WebSocket) request without an upgrade handler.',
    category: 'bug',
  },
  {
    key: 'ERR_STREAM_PREMATURE_CLOSE',
    hint: 'Stream closed early',
    hintDetail:
      'A piped stream ended before it finished: the client disconnected during a download, or an upstream cut the body.',
    retryable: true,
  },
  {
    key: 'ERR_STREAM_WRITE_AFTER_END',
    hint: 'Write after stream end',
    hintDetail:
      'Code wrote to a stream after end(): usually a response written twice, or a write after the client went away.',
    category: 'bug',
  },
  {
    key: 'ERR_STREAM_DESTROYED',
    hint: 'Stream already destroyed',
    hintDetail:
      'A stream method ran after destroy(): the request was aborted and the code kept writing. Stop work on close.',
    category: 'bug',
  },
  {
    key: 'ERR_STREAM_PUSH_AFTER_EOF',
    hint: 'Push after stream EOF',
    hintDetail:
      'A readable pushed data after it signalled the end. Bug in a custom stream.',
    category: 'bug',
  },
  {
    key: 'ERR_STREAM_CANNOT_PIPE',
    hint: 'Stream cannot be piped',
    hintDetail: 'pipe() was called on a stream that does not allow it.',
    category: 'bug',
  },
  {
    key: 'ERR_STREAM_NULL_VALUES',
    hint: 'Null written to stream',
    hintDetail:
      'null was written to a stream (null means end-of-stream). Check the value before writing.',
    category: 'bug',
  },
  {
    key: 'ERR_STREAM_UNSHIFT_AFTER_END_EVENT',
    hint: 'Unshift after stream end',
    hintDetail:
      'unshift() was called after the end event. Bug in a custom stream.',
    category: 'bug',
  },
]
