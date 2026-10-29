import type { ErrorPattern } from './types'

// Sources:
// - https://nodejs.org/api/errors.html (ERR_HTTP_*, ERR_STREAM_*, ERR_INVALID_URL*)
// - https://nodejs.org/api/http.html (maxHeaderSize, server.requestTimeout)
// - https://github.com/nodejs/node/blob/main/lib/internal/http/outgoing.js (header, trailer and pipe checks)
// - https://github.com/nodejs/llhttp/blob/main/src/llhttp/http.ts (HPE_* parser errors)
// - https://github.com/nodejs/node/blob/main/src/node_http_parser.cc (HPE_HEADER_OVERFLOW, upgrade handling)

// Node http server, HTTP parser (llhttp HPE_*) and stream errors.
export const nodeHttpPatterns: ErrorPattern[] = [
  {
    key: 'ERR_HTTP_HEADERS_SENT',
    hint: 'Response already sent',
    detail:
      'Code set headers or a status after the response started: a handler that calls res.send and also returns a value, or two replies on one error.',
    howToFix:
      'Make sure each request gets one reply, and do not return a value after res.send.',
    category: 'bug',
  },
  {
    key: 'ERR_HTTP_REQUEST_TIMEOUT',
    hint: 'Client request timed out',
    detail:
      'The client did not send the whole request within server.requestTimeout. Slow upload or a stalled client.',
    howToFix:
      'Raise server.requestTimeout if large uploads are expected; a stalled client needs no action.',
    level: 'warn',
  },
  {
    key: 'ERR_HTTP_INVALID_STATUS_CODE',
    hint: 'Invalid HTTP status code',
    detail:
      'A status outside 100-999 was set, often undefined from a missing mapping.',
    howToFix: 'Check the status the filter computes.',
    category: 'bug',
  },
  {
    key: 'ERR_HTTP_INVALID_HEADER_VALUE',
    hint: 'Invalid header value',
    detail: 'A header was set to undefined or an invalid value.',
    howToFix: 'Check the value is defined before setting it.',
    category: 'bug',
  },
  {
    key: 'ERR_HTTP_TRAILER_INVALID',
    hint: 'Invalid HTTP trailer',
    detail:
      'The Trailer header was set on a message that is not chunked (e.g. it has a Content-Length header).',
    howToFix:
      'Use chunked transfer encoding when sending trailers, or drop the trailers.',
    category: 'bug',
  },
  {
    key: 'ERR_INVALID_HTTP_TOKEN',
    hint: 'Invalid header name',
    detail:
      'A header name or method contains forbidden characters (space, colon, non-ASCII).',
    howToFix: 'Check dynamic header names.',
    category: 'bug',
  },
  {
    key: 'ERR_INVALID_CHAR',
    hint: 'Invalid header character',
    detail:
      'A header value contains a newline or control character, often a Thai/unicode file name in Content-Disposition.',
    howToFix: 'Encode it (RFC 5987).',
    category: 'bug',
  },
  {
    key: 'ERR_UNESCAPED_CHARACTERS',
    hint: 'URL has unescaped characters',
    detail: 'The request path contains spaces or unicode.',
    howToFix: 'Use encodeURIComponent on path segments and query values.',
    category: 'bug',
  },
  {
    key: 'ERR_INVALID_URL',
    hint: 'Invalid URL',
    detail:
      'new URL() could not parse the value: missing scheme (host without http://), empty env var, or a path passed where a full URL is needed.',
    howToFix: 'Check the env var is set and holds a full URL with its scheme.',
    category: 'config',
  },
  {
    key: 'ERR_INVALID_URL_SCHEME',
    hint: 'Wrong URL scheme',
    detail:
      'A URL that is not file: was passed where only file: URLs work (fs, fileURLToPath).',
    howToFix: 'Pass a URL with the scheme the API expects.',
    category: 'bug',
  },
  {
    key: 'HPE_HEADER_OVERFLOW',
    hint: 'HTTP headers too large',
    detail:
      'The headers exceed the 16 KB limit (max-http-header-size): a huge cookie or token.',
    howToFix: 'Trim the headers or raise the limit.',
    level: 'warn',
  },
  {
    key: 'HPE_INVALID_HEADER_TOKEN',
    hint: 'Malformed HTTP header',
    detail:
      'The peer sent a header with invalid characters. A broken client or proxy; the request/response was dropped.',
    howToFix:
      'Check the client or proxy that sends the header if it happens often.',
    level: 'warn',
  },
  {
    key: 'HPE_INVALID_METHOD',
    hint: 'Invalid HTTP method',
    detail:
      'The request line has an unknown method: non-HTTP traffic (TLS on a plain port, a scanner) hit the server.',
    howToFix:
      'Check what sends non-HTTP traffic to the port if it happens often.',
    level: 'warn',
  },
  {
    key: 'HPE_INVALID_CONSTANT',
    hint: 'Malformed HTTP message',
    detail:
      'The parser expected an HTTP token and got something else: non-HTTP data on the port, or a corrupted proxy response.',
    howToFix:
      'Check what sends non-HTTP data to the port, or the proxy in front of the upstream.',
    level: 'warn',
  },
  {
    key: 'HPE_INVALID_STATUS',
    hint: 'Malformed HTTP status',
    detail:
      'The upstream response status line is invalid. The upstream is not speaking HTTP.',
    howToFix: 'Check the upstream URL and port point at an HTTP service.',
  },
  {
    key: 'HPE_UNEXPECTED_CONTENT_LENGTH',
    hint: 'Conflicting content length',
    detail:
      'The message has two Content-Length headers. A broken upstream or proxy.',
    howToFix: 'Check the upstream or proxy that builds the response headers.',
  },
  {
    key: 'HPE_INVALID_CHUNK_SIZE',
    hint: 'Invalid chunked encoding',
    detail:
      'A chunk size in the body is not valid hex. The upstream response stream is corrupted.',
    howToFix: 'Retry, and check the upstream or proxy that streams the body.',
  },
  {
    key: 'HPE_INVALID_EOF_STATE',
    hint: 'Response ended early',
    detail:
      'The connection closed in the middle of an HTTP message. The upstream crashed or a proxy cut the stream.',
    howToFix:
      'Retry; if frequent, check the upstream logs and the proxy timeouts.',
    retryable: true,
  },
  {
    key: 'HPE_CR_EXPECTED',
    hint: 'Malformed HTTP line ending',
    detail:
      'A line of the HTTP message (status line, header or chunk) ended with a bare LF. The peer is not RFC-compliant; Node rejects it by default.',
    howToFix: 'Fix the peer to end every HTTP line with CRLF.',
  },
  {
    key: 'HPE_LF_EXPECTED',
    hint: 'Malformed HTTP line ending',
    detail:
      'A CR was not followed by LF. The peer sent a malformed HTTP message.',
    howToFix: 'Check the peer that builds the HTTP message.',
  },
  {
    key: 'HPE_PAUSED_UPGRADE',
    hint: 'HTTP upgrade not handled',
    detail:
      'The HTTP parser stopped after a CONNECT/Upgrade (WebSocket) message and the code running the parser did not take over the connection.',
    howToFix:
      'Handle CONNECT/Upgrade in the client or proxy that runs the parser; the Node http server serves an Upgrade with no upgrade listener as a normal request.',
    category: 'bug',
  },
  {
    key: 'ERR_STREAM_PREMATURE_CLOSE',
    hint: 'Stream closed early',
    detail:
      'A piped stream ended before it finished: the client disconnected during a download, or an upstream cut the body.',
    howToFix:
      'Retry if the upstream cut the body; a client disconnect needs no action.',
    retryable: true,
  },
  {
    key: 'ERR_STREAM_WRITE_AFTER_END',
    hint: 'Write after stream end',
    detail:
      'Code wrote to a stream after end(): usually a response written twice, or a write after the client went away.',
    howToFix:
      'Make sure the response is written once, and stop writing after close.',
    category: 'bug',
  },
  {
    key: 'ERR_STREAM_DESTROYED',
    hint: 'Stream already destroyed',
    detail:
      'A stream method ran after destroy(): the request was aborted and the code kept writing.',
    howToFix: 'Stop work on close.',
    category: 'bug',
  },
  {
    key: 'ERR_STREAM_PUSH_AFTER_EOF',
    hint: 'Push after stream EOF',
    detail:
      'A readable pushed data after it signalled the end. Bug in a custom stream.',
    howToFix: 'Stop pushing after push(null) in the custom stream.',
    category: 'bug',
  },
  {
    key: 'ERR_STREAM_CANNOT_PIPE',
    hint: 'Stream cannot be piped',
    detail:
      'pipe() was called on a writable stream, such as an HTTP response; only a readable stream can be piped.',
    howToFix: 'Pipe from a readable stream into a writable one.',
    category: 'bug',
  },
  {
    key: 'ERR_STREAM_NULL_VALUES',
    hint: 'Null written to stream',
    detail: 'null was written to a stream (null means end-of-stream).',
    howToFix: 'Check the value before writing.',
    category: 'bug',
  },
  {
    key: 'ERR_STREAM_UNSHIFT_AFTER_END_EVENT',
    hint: 'Unshift after stream end',
    detail: 'unshift() was called after the end event. Bug in a custom stream.',
    howToFix: 'Call unshift() only before the end event in the custom stream.',
    category: 'bug',
  },
]
