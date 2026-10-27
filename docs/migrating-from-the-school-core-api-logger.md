# ย้ายจาก logger เดิมของ school-core-api

field ของ logger เดิม (pino + `LoggerMiddleware`) กับ field ที่ใช้แทน dashboard และ alert ที่ query field เดิมต้องเปลี่ยนตามตารางนี้

## ตาราง field

| Old | New |
| --- | --- |
| `message: "request middleware"` (2 lines per request) | `event.code: "http.request"` (1 line) |
| `request_id` | `trace.id` (also the `request-id` header and the error body `requestId`) |
| `service: "GET /url?query"` | `http.request.method` + `url.path` + `http.route` |
| `response_code` / `response_time_ms` | `http.response.status_code` / `duration_ms` |
| `user_id`, `schoolId`, `user_role` | `user.id`, `organization.id`, `user.roles` |
| `traceId`, `spanId` | `trace.id`, `span.id` |
| `dbQuery`, `dbDriverError` | `db.statement`, `error.code` (binds are on the db span) |
| every HttpException at `error` | 4xx `warn`, 5xx `error` |
