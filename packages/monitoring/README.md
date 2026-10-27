# skilllane-monitoring

One log format for every NestJS service: ECS JSON lines on stdout, an
`event.code` on every line, an English hint for known errors, and OpenTelemetry
traces. Everything also goes to the service's own queue (Kafka, RabbitMQ or
BullMQ), straight to the skilllane-monitoring engine over HTTP, or to OTLP.

## Wiring a service: no code changes

```sh
pnpm add skilllane-monitoring
NODE_OPTIONS="--require skilllane-monitoring/register" node dist/main.js
```

or `import 'skilllane-monitoring/register'` first in `main.ts`. A service with
its own instrumentation file calls `registerTelemetry({ ... })` there instead
(school-core-api: `src/instrumentation.ts`).

| Wires | How |
| --- | --- |
| Nest logger | `NestFactory.create` / `createApplicationContext` get this logger and `setupLogging(app)`; a later `app.useLogger(old)` is ignored |
| One line per request | `http.request` when the response finishes; the `request-id` header carries the trace id |
| `LoggingModule` | added unless the app declares its own; finds the TypeORM `DataSource` (errors name `Entity.property`), the `@nestjs/cqrs` buses (each query/command is a use case), BullMQ and axios |
| ioredis · kafkajs · amqplib | `dependency.up` / `down` / `still_down`; kafkajs `logCreator`; one job per Kafka message / batch and per AMQP delivery |
| @nestjs/schedule | each `@Cron` / `@Interval` / `@Timeout` run is a job `Class.method` |
| Request data on spans | query, headers, bodies, SQL binds, Redis commands, queue payloads — masked ([Captured request data](#captured-request-data-spans)) |
| Boot and process | `app.boot_failed`, `app.started`, uncaught exceptions, unhandled rejections, `app.shutdown` with the work still running |

`LOGGING_ENGINE=legacy` turns all of it off without a deploy;
`LOG_NEST_AUTO=false` / `LOG_AUTO_WATCH=false` turn off one part. Options
auto-discovery cannot guess go to `LoggingModule.forRoot({ watch: { … } })`.

Business code keeps `new Logger(Class.name)`:

```ts
this.logger.error('Failed to load class report', err)
this.logger.error('Failed to import score row', { code: 'SCORE_OUT_OF_RANGE', hint: 'Score out of range' })
this.logger.warn('Authentication rejected', { event: 'auth.rejected', reason: 'token_expired' })
await tracked('cache:rebuild_school_list', () => this.rebuild())
throw new AppError('SCORE_OUT_OF_RANGE', 'Score out of range', { hint: '…', cause: err })
```

## Where to fix it

| Field | Example | From |
| --- | --- | --- |
| `http.request.method`, `http.route` | `GET /question-bank/my` | the request |
| `labels.usecase` | `GetMyQuestionsQuery` | the CQRS query/command it escaped from |
| `log.origin.function` / `.file.name` | `GetMyQuestionsHandler.execute`, `src/…/get-my-questions.handler.ts` | first stack frame of our code (`dist/*.js` mapped to `src/*.ts`, no line numbers) |
| `labels.error_target` | `id`, `APP.UQ_QUESTION_CODE` | property, constraint or column named in the message |
| `labels.failed_step` | `oracle INSERT QUESTION_BANK` | last outgoing call that failed (needs OTel) |
| `labels.error_category` | `bug` · `input` · `data` · `dependency` · `config` | who has to act |
| `error.fix` | `QuestionBankEntity.title got 312 (max 255). …` | this specific case; shown instead of `hint_detail` in pretty |

`error.hint` is constant per kind of error (group and alert on it); `error.fix`
and `error_target` hold names and counts, never row values — those are on the
spans, masked. With the TypeORM `DataSource` as `schema`, database names
(including hash names like `FK_9aac0395…`) appear as `Entity.property`.

## Level of an error line inside a request

A pattern may say `warn` for errors that are usually the caller's fault (404,
400 validation, ORA-12899 …). Inside a request such a line is held until the
response finishes, then written just before the `http.request` line: `error`
if the status is ≥ 500, else `warn`. A closed connection, a crash, SIGTERM and
`flushTelemetry()` write it as decided. Lines outside a request, or that the
app writes at `warn` itself, are written at once. `kill -9` loses held lines.

## Dependency lines

One monitor per watched dependency per process (the SDK's own clients are
never watched):

| Line | When |
| --- | --- |
| `dependency.up`, `reason: connected` | first connect of the process |
| `dependency.down` | the first failure (error with hint) |
| `dependency.still_down` | every `DEPENDENCY_STILL_DOWN_MS`, with `duration_ms` so far |
| `dependency.up`, `reason: recovered` | back after `down`, `duration_ms` = outage |

Reconnects without an outage write nothing.

## Queue export: Kafka · RabbitMQ · BullMQ (or straight to the engine)

stdout is always written. `LOG_EXPORT` adds one destination:

| `LOG_EXPORT` | Logs / traces | Needs |
| --- | --- | --- |
| `kafka` | topics `skilllane-monitoring.logs` / `.spans` (GZIP, key `<service>/<role>`) | `LOG_KAFKA_BROKERS` |
| `rabbitmq` | exchange `skilllane-monitoring.telemetry`, routing key / queue per stream | `LOG_RABBITMQ_URL` |
| `bullmq` | queues `skilllane-monitoring.logs` / `.spans` | `LOG_BULLMQ_REDIS_URL` |
| `http` | `POST <url>/api/ingest/logs` / `spans` | `LOG_HTTP_URL` |
| `otlp` | OTLP `/v1/logs`, `/v1/traces` | `OTEL_EXPORTER_ENDPOINT` |
| empty | the first one configured, in the order above, else stdout | |

- One message = one JSON envelope `{ v: 1, stream, resource, sentAt, items }`
  with headers `skilllane-monitoring-stream` / `skilllane-monitoring-v`
  (`skilllane-monitoring/contract`). `logs` items are the records stdout gets.
- Sending never blocks or throws into the app: items wait in memory (bounded
  by `LOG_EXPORT_MAX_QUEUE` / `_MAX_QUEUE_BYTES`, oldest dropped), go out every
  `LOG_EXPORT_BATCH_MS`, retry with backoff, at least once. Shutdown and
  crashes flush within `LOG_EXPORT_SHUTDOWN_MS`.
- `http`: `LOG_HTTP_TOKEN` only when the engine sets `ENGINE_INGEST_TOKEN`.
  While the engine is down items wait only in memory; a restart loses them.
- State changes are logged once each (`Telemetry export connected`,
  `… is failing`, `… recovered`, `… dropped N items`). The SDK's own sends
  make no spans and no dependency lines.

## Captured request data (spans)

Spans carry what went in and out, like the browser's Network tab. Log lines
carry none of it.

| Span | Attributes |
| --- | --- |
| incoming / outgoing HTTP, fetch | `url.query`, `http.{request,response}.headers`, `.body`, `.body.size`, `.body.truncated` |
| SQL (oracledb, pg, TypeORM `collectParameters`) | `skilllane.monitoring.db.parameters`: `[{ key, type, value, column? }]` in bind order |
| Redis | the whole command, pasteable into redis-cli |
| Kafka, RabbitMQ, BullMQ | `messaging.message.body`, `.body.size`, `.headers`; `Queue.add` makes a producer span |

- Only the first `LOG_BODY_MAX_BYTES` of a body are kept; the client gets the
  same bytes. gzip / deflate / br are decoded, JSON re-serialised, multipart
  summarised as fields + file names and sizes. Binary types and
  `LOG_CAPTURE_SKIP_ROUTES` keep only the size.
- Cost: synchronous at span end, bounded by the cap; about +0.1–0.2 ms per
  typical request, a few ms with two bodies cut at 64 KB. `LOG_CAPTURE=off`
  removes it.

**Masking** is always on, before any exporter sees a span, and the engine
uses the same rules for other senders (`src/contract/mask`, SPEC.md §3 of the
engine repository):

- key rule: a key, parameter, column, header, hash field, Redis key segment or
  label that names a secret (`password`, `token`, `secret`, `session`,
  `cookie`, `otp`, `apiKey` …; not `tokenType`, `passwordChangedAt`) →
  `[REDACTED]`, nested values too. Full list: `src/contract/mask/keys.ts`;
- value rule on every string: JWT, Bearer / Basic, URL userinfo, sensitive
  `name=value` / `"name": "value"` pairs, JSON inside a string, a valid Thai
  national ID. Cut or invalid JSON fails closed;
- `authorization` headers whole; cookies keep their names; SQL binds and
  literals under a sensitive column; Redis AUTH and secret key prefixes;
- log lines: message, error text, `user.id`, `job.id`, `dependency.*`,
  `url.path` and labels.

Emails, phone numbers and other personal data are not masked (emails were up
to mask version 2).

## LOG_PRETTY

`LOG_PRETTY=true` is a readable format for local development; production stays
JSON with the same fields.

```
14:03:40.517 ERR school-core-api/api  read from undefined value
    method=POST path=/orders/:id/discount
    file=src/orders/apply-discount.handler.ts duration=31ms
    error detail: the object holding .percent was undefined; …
    actual error: TypeError: Cannot read properties of undefined (reading 'percent')
    user id:      u_2201
    trace id:     a3ce929d0e0e47364bf92f3577b34da6

14:05:20.100 WRN school-core-api/api  redis "cache" still down
    target=10.0.3.21:6379 retry=9 duration=30.0s
```

- Title: `error.hint`, else the event's title or the message.
- key=value lines: what ran (`method path status source job id attempt`), then
  where (`file target reason dlq affects retry port`), `duration` last. `path`
  is the route pattern; `duration` inside a request/job without one is the time
  since it started.
- Then `error detail:` (`error.fix`, else `error.hint_detail`), `actual error:`,
  `stack:` (`LOG_STACK`), `user id:`, `trace id:` — only those with a value.
- Entries with more than one line are separated by a blank line; colours only
  on a TTY without `NO_COLOR`.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `LOGGING_ENGINE` | `new` | `legacy` = nothing from this library is installed |
| `LOG_NEST_AUTO` / `LOG_AUTO_WATCH` | `true` | `false` = no Nest wiring / no ioredis, kafkajs, amqplib, schedule watching |
| `LOG_EXPORT` | from config | `kafka` · `rabbitmq` · `bullmq` · `http` · `otlp` · `stdout` (see Queue export) |
| `LOG_KAFKA_BROKERS` / `_CLIENT_ID` / `_SSL` | — / `skilllane-monitoring-<service>` / off | `host:port,…`; `LOG_KAFKA_SASL_MECHANISM` / `_USERNAME` / `_PASSWORD` for SASL |
| `LOG_RABBITMQ_URL` / `_EXCHANGE` | — / `skilllane-monitoring.telemetry` | `amqp://user:pass@host:5672/vhost` |
| `LOG_BULLMQ_REDIS_URL` / `_PREFIX` | — / `bull` | the queue Redis, not the app's cache |
| `LOG_HTTP_URL` / `LOG_HTTP_TOKEN` | — | the engine's base URL; the token only when the engine sets one |
| `LOG_TOPIC_LOGS` / `LOG_TOPIC_SPANS` | `skilllane-monitoring.logs` / `.spans` | topic / routing key / queue names |
| `OTEL_EXPORTER_ENDPOINT` | — | OTLP Collector, e.g. `http://otel-collector:4318` |
| `LOG_EXPORT_BATCH_MS` / `_BATCH_SIZE` / `_MAX_QUEUE` | `1000` / `500` / `10000` | batching; oldest dropped when full |
| `LOG_EXPORT_MAX_BYTES` / `_MAX_QUEUE_BYTES` | `800000` / 64 MB | one message / items waiting per stream |
| `LOG_EXPORT_SHUTDOWN_MS` | `3000` | how long shutdown waits for the exporters |
| `OTEL_SERVICE_NAME` / `SERVICE_VERSION` / `OTEL_ENV` / `APP_ROLE` | package.json / package.json / `NODE_ENV` / – | `service.name` / `.version` / `.environment` / role |
| `LOG_LEVEL` | `info` | lowest level written |
| `LOG_PRETTY` / `LOG_STACK` / `LOG_PRETTY_TRACE` | `false` / `off` / `all` | pretty format; `app` / `full` stack; `warn` = user/trace id lines from WRN up only |
| `UNHANDLED_REJECTION` | `exit` | `log` keeps the process alive |
| `INFLIGHT_HTTP_AFTER_MS` | `1000` | requests longer than this are listed in `job.inflight` |
| `DEPENDENCY_STILL_DOWN_MS` | `30000` | interval of `dependency.still_down` |
| `LOG_CAPTURE` / `LOG_BODY_MAX_BYTES` / `LOG_CAPTURE_SKIP_ROUTES` | `all` / `65536` / — | `off` = capture nothing on spans; bytes kept per body; path prefixes whose bodies are not read |

## Field changes from the previous school-core-api logger

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

## Development

```sh
pnpm --filter skilllane-monitoring test
pnpm --filter skilllane-monitoring build
```

Error hints live in `src/errors/patterns/` — read its README before adding one.

## The contract: `skilllane-monitoring/contract`

The wire format between the SDK and the engine, as an entry point without side
effects, so the engine imports only this:

```ts
import { parseEnvelope, resolveExportMode, INGEST_PATH, maskObject } from 'skilllane-monitoring/contract'
```

Stream and topic names, headers, the envelope types, the `LOG_*` names and
`resolveExportMode()`, and the masking rules. It replaces the deprecated
package `skilllane-monitoring-contract` (≤ 0.1.0).
