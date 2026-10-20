/** Span attributes the capture writes (SPEC §8; the engine moves them into columns). */
export const CAPTURE_ATTR = {
  urlQuery: 'url.query',
  requestHeaders: 'http.request.headers',
  responseHeaders: 'http.response.headers',
  requestBody: 'http.request.body',
  responseBody: 'http.response.body',
  requestBodySize: 'http.request.body.size',
  responseBodySize: 'http.response.body.size',
  requestBodyTruncated: 'http.request.body.truncated',
  responseBodyTruncated: 'http.response.body.truncated',
  dbParameters: 'skilllane.monitoring.db.parameters',
  messageBody: 'messaging.message.body',
  messageBodySize: 'messaging.message.body.size',
  messageBodyTruncated: 'messaging.message.body.truncated',
  messageHeaders: 'messaging.message.headers',
} as const
