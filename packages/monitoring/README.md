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
its own instrumentation file (e.g. `src/instrumentation.ts`) calls
`registerTelemetry({ ... })` there instead.

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
this.logger.error('Failed to load the sales report', err)
this.logger.error(ErrorCode.smtp.ECONNECTION)                                   // message = its hint
this.logger.error('Send welcome mail failed', err, ErrorCode.smtp.ECONNECTION, {
  howToFix: 'Check MAIL_HOST in the mail service env.',                       // replaces only this field
})
this.logger.warn('Import failed', { code: AppErrorCode.PRICE_OUT_OF_RANGE, level: 'error' })
throw new AppError(ErrorCode.redis.ECONNREFUSED, 'Cache is down', { status: 503 })
await tracked('cache:rebuild_product_list', () => this.rebuild())
```

`ErrorCode.<file>.<CODE>` lists every built-in code (`ORA-00001` is
`ErrorCode.oracle.ORA_00001`). A plain object next to a code, or one with
`code`, may set `message`, `hint`, `detail`, `howToFix`, `category`, `level`,
`target`, `labels`; each field left out comes from the app's catalog, then the
built-in table. Without a message the line reads as its hint. `level` given
here is final. `AppError` takes the same fields and `status` (the HTTP status
Nest answers with; its message goes to the client). A line with a code and no
error names the function that logged it in `log.origin.*`.

## Where to fix it

| Field | Example | From |
| --- | --- | --- |
| `http.request.method`, `http.route` | `GET /orders/:id` | the request |
| `labels.usecase` | `GetOrderQuery` | the CQRS query/command it escaped from |
| `log.origin.function` / `.file.name` | `GetOrderHandler.execute`, `src/orders/get-order.handler.ts` | first stack frame of our code (`dist/*.js` mapped to `src/*.ts`, no line numbers) |
| `labels.error_target` | `id`, `APP.UQ_PRODUCT_SKU` | property, constraint or column named in the message |
| `labels.failed_step` | `oracle INSERT PRODUCT` | last outgoing call that failed (needs OTel) |
| `labels.error_category` | `bug` · `input` · `data` · `dependency` · `config` | who has to act |
| `error.detail` | `ProductEntity.name got 312 (max 255).` | what happened: this case when the pattern can tell, else the kind's constant sentence |
| `error.how_to_fix` | `Validate the length of name before saving, or widen the column.` | what to do |

`error.hint` is constant per kind of error (group and alert on it);
`error.detail`, `error.how_to_fix` and `error_target` hold names and counts,
never row values — those are on the spans, masked. With the TypeORM `DataSource` as `schema`, database names
(including hash names like `FK_9aac0395…`) appear as `Entity.property`.

## The app's own error codes: `errors init`

The app's own codes (`errorCode` of its exceptions, `code` given to the logger)
get a hint, category and level from one catalog file, without changing any
`throw` or `this.logger.*` call:

```sh
pnpm skilllane-monitoring errors init    # draft src/skilllane-monitoring/errors.ts + README.md from src/
pnpm skilllane-monitoring errors check   # check it before deploying; exit 1 on a broken rule (CI)
pnpm skilllane-monitoring uninstall      # remove the catalog, the register imports and the package
```

`init` drafts every `errorCode: '…'`, logger `code: '…'` and
`throw new …Exception('…')` message seen 5 times or more (`--min-repeat`); the
team fills in each `hint`. It never overwrites a file. `--path` puts the
catalog elsewhere under `src/`, then set `SKILLLANE_MONITORING_ERRORS_FILE_PATH`
to the same path.

```ts
// src/skilllane-monitoring/errors.ts
export default {
  errors: {
    codeOf: (err: any) => err.errorCode, // default: err.code, then a Nest exception's errorCode
    catalog: {
      ORDER_ALREADY_PAID: { hint: 'Order already paid', category: 'input', level: 'warn' },
      'ORA-00001': { hint: 'Duplicate product SKU' }, // replaces the built-in hint only
      USER_NOT_FOUND: { messageMatch: /^User not found$/, hint: 'User not found', level: 'warn' },
    },
  },
}
```

Nothing imports the file: the SDK loads the built file from `dist/` once at
start (CommonJS) and logs `custom error catalog: …`. Lookup order: the hint
passed with the error → the app's catalog → the built-in table. A broken rule
never stops the app. Full rules: the generated `README.md`.

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
14:03:40.517 ERR orders-api/api  read from undefined value
    method=POST path=/orders/:id/discount
    file=src/orders/apply-discount.handler.ts duration=31ms
    error code:   NULL_READ
    error detail: The object holding .percent was undefined: …
    how to fix:   Guard it before reading .percent.
    actual error: TypeError: Cannot read properties of undefined (reading 'percent')
    user id:      u_2201
    trace id:     a3ce929d0e0e47364bf92f3577b34da6

14:05:20.100 WRN orders-api/api  redis "cache" still down
    target=10.0.3.21:6379 retry=9 duration=30.0s
```

- Title: `error.hint`, else the event's title or the message.
- key=value lines: what ran (`method path status source job id attempt`), then
  where (`file target reason dlq affects retry port`), `duration` last. `path`
  is the route pattern; `duration` inside a request/job without one is the time
  since it started.
- Then `error code:`, `error detail:` (`error.detail`), `how to fix:`
  (`error.how_to_fix`), `actual error:`, `stack:` (`LOG_STACK`), `user id:`,
  `trace id:` — only those with a value.
- Entries with more than one line are separated by a blank line; colours only
  on a TTY without `NO_COLOR`.

## Environment

Service

| Variable | Default | Meaning |
| --- | --- | --- |
| `OTEL_SERVICE_NAME` | package.json name | `service.name` |
| `APP_ROLE` | – | `api`, `worker` …, appended as `service.name` = `<name>/<role>` |
| `SERVICE_VERSION` | package.json version | `service.version` |
| `OTEL_ENV` | `NODE_ENV` | `service.environment` |
| `LOGGING_ENGINE` | `new` | `legacy` = nothing from this library is installed |
| `LOG_NEST_AUTO` | `true` | `false` = no automatic Nest wiring |
| `LOG_AUTO_WATCH` | `true` | `false` = do not watch ioredis, kafkajs, amqplib, @nestjs/schedule |
| `LOG_LEVEL` | `info` | lowest level written |
| `UNHANDLED_REJECTION` | `exit` | `log` keeps the process alive |
| `INFLIGHT_HTTP_AFTER_MS` | `1000` | requests longer than this are listed in `job.inflight` |
| `DEPENDENCY_STILL_DOWN_MS` | `30000` | interval of `dependency.still_down` |
| `SKILLLANE_MONITORING_ERRORS_FILE_PATH` | `src/skilllane-monitoring/errors.ts` | the app's error catalog: its source path under `src/`, or the built `.js` |

Export (see [Queue export](#queue-export-kafka--rabbitmq--bullmq-or-straight-to-the-engine))

| Variable | Default | Meaning |
| --- | --- | --- |
| `LOG_EXPORT` | from config | `kafka` · `rabbitmq` · `bullmq` · `http` · `otlp` · `stdout` |
| `LOG_KAFKA_BROKERS` | — | `host:port,host:port` |
| `LOG_KAFKA_CLIENT_ID` | `skilllane-monitoring-<service>` | kafkajs client id |
| `LOG_KAFKA_SSL` | off | `true` = TLS |
| `LOG_KAFKA_SASL_MECHANISM` / `_USERNAME` / `_PASSWORD` | off | `plain` · `scram-sha-256` · `scram-sha-512` |
| `LOG_RABBITMQ_URL` | — | `amqp://user:pass@host:5672/vhost` |
| `LOG_RABBITMQ_EXCHANGE` | `skilllane-monitoring.telemetry` | durable direct exchange |
| `LOG_BULLMQ_REDIS_URL` | — | the queue Redis, not the app's cache |
| `LOG_BULLMQ_PREFIX` | `bull` | BullMQ key prefix |
| `LOG_HTTP_URL` | — | the engine's base URL |
| `LOG_HTTP_TOKEN` | — | only when the engine sets `ENGINE_INGEST_TOKEN` |
| `LOG_TOPIC_LOGS` | `skilllane-monitoring.logs` | topic / routing key / queue of logs |
| `LOG_TOPIC_SPANS` | `skilllane-monitoring.spans` | topic / routing key / queue of spans |
| `OTEL_EXPORTER_ENDPOINT` | — | OTLP Collector, e.g. `http://otel-collector:4318` |
| `LOG_EXPORT_BATCH_MS` | `1000` | how often a batch is sent |
| `LOG_EXPORT_BATCH_SIZE` | `500` | items that send a batch at once |
| `LOG_EXPORT_MAX_QUEUE` | `10000` | items waiting per stream; the oldest are dropped above it |
| `LOG_EXPORT_MAX_BYTES` | `800000` | max bytes of one message; bigger batches are split |
| `LOG_EXPORT_MAX_QUEUE_BYTES` | `67108864` (64 MB) | max bytes waiting per stream |
| `LOG_EXPORT_SHUTDOWN_MS` | `3000` | how long shutdown waits for the exporters |

Pretty and capture

| Variable | Default | Meaning |
| --- | --- | --- |
| `LOG_PRETTY` | `false` | readable format for local development |
| `LOG_STACK` | `off` | pretty only: `app` = our frames, `full` = the whole stack |
| `LOG_PRETTY_TRACE` | `all` | pretty only: `warn` = user / trace id lines from WRN up only |
| `LOG_CAPTURE` | `all` | `off` = capture nothing on spans (masking stays) |
| `LOG_BODY_MAX_BYTES` | `65536` | bytes kept of each body, payload or statement |
| `LOG_CAPTURE_SKIP_ROUTES` | — | comma-separated path prefixes whose bodies are not read |

## Development

See the [repository README](https://github.com/nakarin-skilllane/skilllane-monitoring#readme).
To add or change a hint for an app, use its catalog ([`errors init`](#the-apps-own-error-codes-errors-init)).

## The contract: `skilllane-monitoring/contract`

The wire format between the SDK and the engine, as an entry point without side
effects, so the engine imports only this:

```ts
import { parseEnvelope, resolveExportMode, INGEST_PATH, maskObject } from 'skilllane-monitoring/contract'
```

Stream and topic names, headers, the envelope types, the `LOG_*` names and
`resolveExportMode()`, and the masking rules. It replaces the deprecated
package `skilllane-monitoring-contract` (≤ 0.1.0).
