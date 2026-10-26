# skilllane-monitoring

One log format for every NestJS service: one ECS JSON object per line on
stdout, an `event.code` on every line, an English hint for known errors, and a
report of the work that was running when the process died.

The library never stores logs. Every line goes to stdout, and to wherever the
environment names: the customer's own queue (Kafka, RabbitMQ or BullMQ), from
which the skilllane-monitoring engine writes ClickHouse, or OTLP to an OpenTelemetry
Collector. See [Queue export](#queue-export-kafka--rabbitmq--bullmq).

## Wiring a service: no code changes

Add the dependency and load the register entry before anything else:

```sh
pnpm add skilllane-monitoring
NODE_OPTIONS="--require skilllane-monitoring/register" node dist/main.js
```

or, when the service already has an instrumentation file loaded first by
`main.ts`, call `registerTelemetry({ ... })` there with the app's own
OpenTelemetry options (school-core-api does this in `src/instrumentation.ts`).
A later call still applies its `instrumentationConfig` and `instrumentations`.

`main.ts`, the modules and the business code stay as they are. Register then:

| Wires | How |
| --- | --- |
| Nest logger | `NestFactory.create` / `createApplicationContext` get this logger (also when the app passes only levels, e.g. `logger: ['log', 'warn', 'error']`), `abortOnError: false`, and `setupLogging(app)` right after; a later `app.useLogger(oldLogger)` is ignored. `new Logger(...)` lines written before `create()` use it too |
| One line per request | `http.request` when the response finishes; the `request-id` header carries the trace id |
| `LoggingModule` | added next to the root module unless the app declares its own; it finds the TypeORM `DataSource` (DB names in errors become `Entity.property`), the `@nestjs/cqrs` buses (every query/command becomes a use case), BullMQ and the default axios instance |
| ioredis | every connection: `dependency.up` (`reason: connected`) on the first connect, `dependency.down` / `still_down` / `up` (`reason: recovered`), one monitor per server |
| kafkajs | `logCreator`, producer state, consumer rebalances, one job per message (`eachMessage`) or batch (`eachBatch`) |
| amqplib | connection state, one job per delivery on every `channel.consume` |
| @nestjs/schedule | each `@Cron` / `@Interval` / `@Timeout` run is a job named `Class.method` |
| Request data on spans | query strings, request / response headers and bodies of every incoming and outgoing HTTP call, SQL bind values, full Redis commands, queue payloads — masked (see [Captured request data](#captured-request-data-spans)) |
| Boot and process | `app.boot_failed`, `app.started`, uncaught exceptions (then exit 1 as Node would; when the app has its own `uncaughtException` listener, Node would not exit, so neither does the SDK), unhandled rejections, `app.shutdown` with the work in progress |

`LOGGING_ENGINE=legacy` turns all of it off without a deploy of new code.
`LOG_NEST_AUTO=false` or `LOG_AUTO_WATCH=false` turns off one part.

An app that already writes its own request lines (school-core-api's
`LoggerMiddleware`) keeps writing them, now in this format; remove them when
the old dashboards move to `http.request`.

Explicit wiring is still available for options auto-discovery cannot guess,
e.g. a name for a Redis client: `LoggingModule.forRoot({ watch: { redis: [...] } })`.

Business code keeps using `new Logger(Class.name)` and `this.logger.log/warn/error`.

```ts
this.logger.error('Failed to load class report', err)
this.logger.error('Failed to import score row', { code: 'SCORE_OUT_OF_RANGE', hint: 'Score out of range', hintDetail: '…' })
this.logger.warn('Authentication rejected', { event: 'auth.rejected', reason: 'token_expired' })
await tracked('cache:rebuild_school_list', () => this.rebuild())
throw new AppError('SCORE_OUT_OF_RANGE', 'Score out of range', { hint: '…', cause: err })
```

## Where to fix it

Every error line says where to fix it, without line numbers (they differ
between `src/*.ts` and the compiled `dist/*.js`, and need source maps):

| Field | Example | From |
| --- | --- | --- |
| `http.request.method`, `http.route` | `GET /question-bank/my` | the request the error happened in |
| `labels.usecase` | `GetMyQuestionsQuery` | the CQRS query/command it escaped from (`watch.cqrs`); also on every line inside it |
| `log.origin.function` | `GetMyQuestionsHandler.execute` | first stack frame of our code |
| `log.origin.file.name` | `src/domain/question-bank/…/get-my-questions.handler.ts` | same frame; `dist/src/x.js` is mapped to `src/x.ts` |
| `labels.error_target` | `id`, `APP.UQ_QUESTION_CODE` | the property, constraint or column named in the message (pattern `target`) |
| `labels.failed_step` | `oracle INSERT QUESTION_BANK` | last outgoing call that failed (`FailedStepSpanProcessor`; needs OTel) |
| `labels.error_category` | `bug` · `input` · `data` · `dependency` · `config` | who has to act (pattern `category`) |
| `error.fix` | `QuestionBankEntity.title got 312 (max 255). Validate the length…` | this specific case (pattern `explain`); shown instead of `hint_detail` in pretty |

`error.hint` stays constant per kind of error (group and alert on it);
`error.fix` and `labels.error_target` carry the specifics. They hold names and
counts only — table, column, constraint, property, key shape, field names —
never row values: the values of the failing request (its body, the bind
values of the failing statement) are on its spans, masked
([Captured request data](#captured-request-data-spans)).

Pass the TypeORM `DataSource` as `schema` to LoggingModule: database names
then appear as `Entity.property`, including TypeORM hash names such as
`FK_9aac0395…` (`ORA-00001/01400/01407/02291/02292/12899/00904`), and a
`reading 'school'` TypeError is recognised as a relation that was not loaded.

When every frame is inside a library (a driver error), `labels.usecase` and
`labels.failed_step` still say where. A line without a context (`App`, e.g.
the exception filter) is attributed to the origin class.

## Level of an error line inside a request

Error patterns may say `warn` for errors that are usually the caller's fault
(404 `EntityNotFoundError`, 400 validation, 401, ORA-12899 value too long …):
`this.logger.error(err)` then writes `warn`. Whether it really was the
caller's fault is only known from the status the request answers, so inside
an HTTP request such a line waits for the response:

- the line is complete (hint, fix, origin, trace, `@timestamp` of the call)
  but is held until the response finishes; it is then written just before
  the `http.request` line, at `error` when the status sent is ≥ 500 and at
  `warn` otherwise (ORA-12899 answered 500 → `error`; `EntityNotFoundError`
  answered 404 → `warn`);
- a response that closes without finishing (client gone) writes it as
  decided (`warn`); so do `uncaughtException`, a fatal unhandled rejection,
  SIGTERM / SIGINT and `flushTelemetry()` / `shutdownTelemetry()`;
- lines the app writes at `warn` itself, lines whose pattern says `error`,
  library events and lines outside a request (jobs, consumers, cron) or
  after the response finished are written at once, as before.

Held lines appear on stdout after the other lines of their request; their
`@timestamp` is unchanged. `kill -9` before the response finishes loses them.

## Dependency lines

Every watched dependency (ioredis server, the BullMQ queue connection,
amqplib connection, kafkajs producer, or a client in `watch`) has one
monitor per process:

| Line | When | Fields |
| --- | --- | --- |
| `dependency.up`, `reason: connected` | first successful connect of the process, once (message `Dependency connected`, pretty title `redis "queue" connected`) | `dependency.*`, `event.module` |
| `dependency.down` | the first failure | error with hint, `dependency.attempt` |
| `dependency.still_down` | every `DEPENDENCY_STILL_DOWN_MS` while down | `duration_ms` so far |
| `dependency.up`, `reason: recovered` | back after `dependency.down` | `duration_ms` = outage |

Reconnects without an outage write nothing. A dependency that is down before
it ever connected gets only the `recovered` line. BullMQ queues are watched
from their constructor (`waitUntilReady`), so a producer-only API process
reports its queue connection at boot, not at the first `add()`. The SDK's
own telemetry clients (Kafka producer, AMQP connection, BullMQ queues and
their Redis connection) are never monitored.

## Queue export: Kafka · RabbitMQ · BullMQ (or straight to the engine)

`LOG_EXPORT` picks where logs and traces go. stdout is always written as well.
An app with a queue uses it; an app without one sets only `LOG_HTTP_URL` and
posts to the engine.

| `LOG_EXPORT` | Logs | Traces | Needs |
| --- | --- | --- | --- |
| `kafka` | topic `skilllane-monitoring.logs` | topic `skilllane-monitoring.spans` | `LOG_KAFKA_BROKERS` |
| `rabbitmq` | exchange `skilllane-monitoring.telemetry`, routing key / queue `skilllane-monitoring.logs` | `skilllane-monitoring.spans` | `LOG_RABBITMQ_URL` |
| `bullmq` | queue `skilllane-monitoring.logs` | queue `skilllane-monitoring.spans` | `LOG_BULLMQ_REDIS_URL` |
| `http` | `POST <url>/api/ingest/logs` | `POST <url>/api/ingest/spans` | `LOG_HTTP_URL` |
| `otlp` | OTLP `/v1/logs` | OTLP `/v1/traces` (+ metrics) | `OTEL_EXPORTER_ENDPOINT` |
| `stdout` | stdout only | OTLP when `OTEL_EXPORTER_ENDPOINT` is set | – |
| empty | the first one configured: Kafka brokers → RabbitMQ URL → BullMQ Redis URL → engine URL (`LOG_HTTP_URL`) → OTEL endpoint → stdout. A configured queue wins over http | | |

The SDK only publishes; the customer runs the queue and the skilllane-monitoring engine
subscribes (both read the same `.env`, and the rule above is
`resolveExportMode()` of `skilllane-monitoring/contract`). A queue mode whose connection
variable is empty writes one warning and stays on stdout. Queue modes add no
OTLP exporters.

**Wire format** (`skilllane-monitoring/contract`): one message = one JSON envelope
`{ v: 1, stream: 'logs' | 'spans', resource, sentAt, items }`. `resource` is
`service.name` (without the role), `service.version`,
`deployment.environment.name`, `host.name`, `app.role`, `telemetry.sdk.*`.
`logs` items are the exact redacted records stdout gets; `spans` items are
finished OTel spans (`SpanItem`: ids, parent id, kind, status, nanosecond
times as decimal strings, attributes, events, links, scope).

| | Kafka | RabbitMQ | BullMQ |
| --- | --- | --- | --- |
| Destination | topics `LOG_TOPIC_LOGS` / `LOG_TOPIC_SPANS` | durable direct exchange `LOG_RABBITMQ_EXCHANGE`; per stream a durable queue named after the topic, bound with routing key = topic name (asserted on connect) | queues named after the topics, prefix `LOG_BULLMQ_PREFIX` |
| Message | value = JSON, GZIP; key `<service>/<role>`; headers `skilllane-monitoring-stream` (`logs`/`spans`) and `skilllane-monitoring-v` (`"1"`) | body = JSON, persistent, `application/json`, confirm channel; headers `skilllane-monitoring-stream`, `skilllane-monitoring-v` (integer 1); `appId` = `<service>/<role>` | job name = stream, data = the envelope object; attempts 5, exponential backoff 1 s, `removeOnComplete`, `removeOnFail: 1000` |
| Connection | kafkajs; SSL / SASL (`plain`, `scram-sha-256`, `scram-sha-512`) from env; client id `LOG_KAFKA_CLIENT_ID`, default `skilllane-monitoring-<service>` | amqplib, connection name `skilllane-monitoring-sdk-telemetry` | its own ioredis connection (`maxRetriesPerRequest: null`, name `skilllane-monitoring-sdk-telemetry`), shared by both queues |

Only the chosen client library is loaded, on the first send.

**http (no queue).** Each message is one `POST` of the same envelope to the
engine, `content-type: application/json`, gzip from 1 KB, headers
`skilllane-monitoring-stream` / `skilllane-monitoring-v`. The URL is all it needs. Only when the engine sets
`ENGINE_INGEST_TOKEN` does it also need a token: `LOG_HTTP_TOKEN`, or the user
part of the URL (`https://<token>@monitoring.company.local`), sent as
`Authorization: Bearer <token>` and never printed. The
engine answers `202` once the rows are in ClickHouse. `401` / `403` / `404` /
`429` / `5xx` and network errors are retried like a queue outage; `400` and
`413` can never succeed, so that message is dropped (warned, counted) and the
items behind it go on. Uses Node's `fetch` (no extra dependency). Trade-off:
while the engine is down the items wait only in memory (the bounds below), not
in a queue, and a restart of the app loses them.

**Publisher** (one per stream, both over one connection):

- `push` only appends to memory: it never blocks and never throws into the app.
- A message goes out every `LOG_EXPORT_BATCH_MS`, or as soon as
  `LOG_EXPORT_BATCH_SIZE` items wait; a batch is split so that one message
  stays under `LOG_EXPORT_MAX_BYTES` (an item alone above it is dropped).
- At most `LOG_EXPORT_MAX_QUEUE` items and `LOG_EXPORT_MAX_QUEUE_BYTES`
  (encoded) wait in memory per stream; above either the oldest are dropped
  and counted (spans with captured bodies are large).
- A failed send keeps its items and retries; after 3 failures in a row it
  pauses 5 s (doubling up to 30 s, each pause cut by a random 0–50 % so pods
  do not retry in step). The connection is reopened on the next
  send (no client-side reconnect loops). Delivery is at-least-once.
- State changes are written once each, as `app.log` lines of logger
  `skilllane-monitoring`: `Telemetry export connected`, `… is failing` (warn, with
  the error), `… recovered` (with `duration_ms`), `… is dropping <stream>
  items` (warn) and `… dropped N <stream> items` (info).
- Shutdown (SIGTERM / `app.close()`), a crash, a boot failure and a script
  that simply ends (`beforeExit`) flush and close within
  `LOG_EXPORT_SHUTDOWN_MS`; what is still unsent then is named in a warning on
  stdout. An app that calls `process.exit()` itself should
  `await shutdownTelemetry()` (`skilllane-monitoring/otel`) first.

**No feedback loops.** Every publish runs under
`suppressTracing(ROOT_CONTEXT)`, so the instrumented kafkajs / amqplib /
ioredis calls of the SDK make no spans, even when a batch leaves inside a
request. The SDK's own clients are left out of the auto-watch hooks: no
`dependency.*` lines, no BullMQ "affected queues", no job lines for them, and
its kafkajs logs nothing. Its sockets and timers are unreferenced, so it
never keeps a process alive (kafkajs 2.2.4 re-arms a 1 ms timer on an idle
connection; the SDK stops that on its own connections only).

## Captured request data (spans)

Every request, in every environment, can be read like the browser's Network
tab: the spans carry what went in and out, masked. Log lines are unchanged
(no bodies, `url.path` without the query string).

| Span | Attributes |
| --- | --- |
| incoming HTTP (instrumentation-http) and outgoing http / https calls (axios, gaxios, the AWS SDK …) | `url.query` (no `?`), `http.request.headers` / `http.response.headers` (JSON object, lower-case names, value string or string[]), `http.request.body` / `http.response.body`, `http.request.body.size` / `http.response.body.size` (bytes as sent), `http.request.body.truncated` / `http.response.body.truncated` |
| fetch / undici (instrumentation-undici) | the same; bodies through undici's per-request `onBodySent` / `onData` |
| SQL (oracledb, pg, TypeORM with `collectParameters`) | `skilllane.monitoring.db.parameters`: JSON array `[{ key, type, value, column?, truncated?, masked? }]` in bind order; `key` the bind name or `"1"`, `"2"` … for positional binds; `type` `string` · `number` · `bigint` · `boolean` · `null` · `date` · `buffer` · `object`; `value` the string form (date ISO-8601, buffer hex, object JSON); `column` when the statement says (`col = :2`, `:2 = col`, `UPPER(col) LIKE :3`, `col IN (…)`, `col BETWEEN … AND …`, `(a, b) = (:1, :2)`, `:1 AS email`, a call around the value: `password = crypt($1, …)`, `SHA2(?, 256)`; `INSERT … (cols) VALUES (…), (…)`, `INSERT … (cols) SELECT …`, `INSERT ALL INTO …`, MERGE's `INSERT (cols) VALUES`); `masked: 'unresolved'` (see Masking) |
| Redis (ioredis, redis) | `db.query.text` / `db.statement`: the whole command with every argument, each quoted the way redis-cli reads it (`set k '{"a":"b c"}' EX 20`; `"…"` with `\"` `\n` `\xHH` when it holds `'` or control bytes), so it can be pasted; a cut argument is followed by ` …`, arguments past the cap by `(<n> more)` |
| Kafka, RabbitMQ, BullMQ job / consumer span and producer span | `messaging.message.body`, `messaging.message.body.size`, `messaging.message.body.truncated` (with a body), `messaging.message.headers` (JSON object; Kafka value + headers + `kafka.key`, RabbitMQ content + properties + `properties.headers`, BullMQ job.data + name, id and options). `Queue.add` / `addBulk` make a PRODUCER span `<queue> publish` (`messaging.system` bullmq), and the job's trace headers point at it |

**Bodies.** The first `LOG_BODY_MAX_BYTES` bytes are kept as they pass
(readable side: `emit('data')`; writable side: `write` / `end`); the rest is
only counted. Nothing else is buffered, no listener is added, `write`'s return
value (backpressure) and every argument are passed through, so the client
receives exactly the same bytes. gzip / deflate / br are decoded (at most
16 × the cap: no zip bomb; a cut stream decodes as far as it goes). JSON is
re-serialised compact after masking (a body cut at the cap is masked by a
tolerant scan); `application/x-www-form-urlencoded` is masked per field;
other text is kept as text (a UTF-8 BOM dropped, UTF-16 and other charsets
decoded); `multipart/form-data` becomes
`{"fields": {name: value}, "files": [{name, filename, type, size}]}` (sizes
of the whole upload), for the first 1,000 parts or 64 KB of summary: later
parts are not parsed, only counted, as `"more": {"parts", "bytes"}`; binary
and streaming types (images, audio, video, octet-stream, PDF, archives,
`text/event-stream`, gRPC) and bodies under `LOG_CAPTURE_SKIP_ROUTES` keep
only `*.body.size` (a body an app hook wrote for such a side is removed). A
body the app never read (no parser on the route, 413) has its
`content-length` as size and no text; one cut short (an aborted upload) has
the bytes received as size and `truncated: true`. Tiny writes are copied
into one shared buffer, so at most about `LOG_BODY_MAX_BYTES` is held per body.

**Masking** (always on, also for attributes the app or another
instrumentation writes, also with `LOG_CAPTURE=off`; `CaptureSpanProcessor`
applies it before any exporter sees the span). The rules live in
`skilllane-monitoring/contract` (`src/contract/mask`), the same code the skilllane-monitoring
engine uses for other senders (SPEC.md §3 in the engine repository):

- key rule (`isSensitiveKey`): an object key, form / query / bind parameter
  name, bind column, header name, hash or stream field, Redis key segment or
  log label whose lower case contains `password`, `confirmpassword`, `token`,
  `secret`, `authorization`, `cookie`, `session`, `passwd`, `pwd`, `apikey`,
  `api_key`, `api-key`, `credential`, `privatekey`; or that has a word (split
  at camelCase, `_ - . :` …) `pass`, `pw`, `pwd`, `pin`, `otp`, `totp`, `cvv`,
  `cvc`, `passcode`, `passphrase`, `sid`, `sess`, `sig`, `signature`, `auth`,
  `authentication`, `oauth`, `jwt`, `refresh`, `creds`; or that ends in `key`
  after `api`, `access`, `secret`, `private`, `client`, `signing`,
  `encryption` … (`x-access-key`, `privateKey`) → `"[REDACTED]"`, recursively
  in nested objects and arrays (a nested object under such a key is replaced
  whole). Not when it has two or more words and the last one is metadata
  (`type`, `at`, `date`, `time`, `changed`, `expires`, `ttl`, `timeout`,
  `length`, `min`, `max`, `policy`, `enabled`, `count`, `hint`, `name`,
  `consent`, `format`, `version` …): `tokenType`,
  `passwordChangedAt`, `PASSWORD_CHANGED_AT`, `sessionTimeout` stay readable.
  In a query string or form also `code` (OAuth), `key` (`?key=AIza…`) and
  `ticket`;
- headers `authorization`, `proxy-authorization` → `"[REDACTED]"`; `cookie`
  and `set-cookie` keep the cookie names and Set-Cookie attributes
  (`sid=[REDACTED]; Path=/; HttpOnly`); a URL-valued header (Referer,
  Location) has its query masked by name;
- value-based: `redactValue` on every string value — bodies, header values,
  query values, bind values, Redis arguments, message payloads, every other
  span attribute and event attribute: JWT, Bearer / Basic credentials, the
  credential after `Authorization:` whatever its scheme, URL userinfo
  (`redis://:[REDACTED]@host`), any `name=value`, `"name": "value"` or
  `name: "value"` pair whose name the key rule matches (`confirmPassword=…`,
  `"newPassword":"…"`, a quoted value whole), a string that is itself JSON
  (masked as JSON: `{"meta": "{\"newPassword\": …}"}`), Thai national ID
  with its checksum; and a 13-digit number that is a valid Thai national ID;
- JSON that is not valid JSON (a UTF-8 BOM, UTF-16, single quotes, comments,
  NDJSON) or is cut at the cap goes through a tolerant scan; where the scan
  cannot follow the structure, every sensitive `"name": value` pair is masked
  once more (fails closed). XML / HTML: an element whose tag or `name=` /
  `key=` attribute is sensitive loses its text and its `value=`. CSV: the
  columns under a sensitive header. Multipart: `name*=` is read; a part
  without a readable name is masked;
- SQL binds by their name or their column (see the table); in a statement
  that names a secret (an identifier the key rule matches, e.g. `CALL
  change_password(?, ?)` or `pkg.set_pw(:1, :2)`), a bind whose column cannot
  be read is masked too, with `masked: 'unresolved'`. SQL statements get the
  value rule with bind placeholders kept (`"PASSWORD" = :1` stays runnable)
  and literals under a sensitive column masked (`VALUES ('a@b.c',
  '[REDACTED]')`);
- Redis: AUTH / HELLO / MIGRATE / CONFIG SET / ACL credentials; a key whose
  prefix segment is a secret keeps the prefix (`session:[REDACTED]`,
  `password_reset:[REDACTED]`, `reset:`, `verify:` …); values under a
  sensitive key, hash or stream field (`HSET user:1 pin …`, `XADD s * password
  …`); EVAL / FCALL arguments when one of its keys is sensitive;
- `url.full` / `http.url` / `http.target` get userinfo, path and query (and a
  fragment with pairs) masked; `url.path` / `http.target` a segment under a
  sensitive route parameter (`/reset-password/:token`); `job.id`,
  `messaging.message.id` and `messaging.kafka.message.key` by key segments
  and the value rule; exception messages, stacks and status messages the
  value rule;
- log lines: message, error text, hint and fix, `user.id`, `job.id`,
  `dependency.*` (`user:[REDACTED]@host`), `url.path` and every label by its
  key (`logger.log('x', { newPassword })` → label `newPassword:
  [REDACTED]`).

Emails, phone numbers and other personal data beyond the Thai national ID
are not masked (not in the agreed list; emails were masked up to mask
version 2). SPEC.md §3 in the engine repository says how to add them.

Raw bind values other instrumentations write (oracledb
`enhancedDatabaseReporting` → `db.operation.parameter.<i>`, semconv
`db.query.parameter.<key>`, TypeORM `db.statement.parameters`, pg
`db.postgresql.values`) are moved into `skilllane.monitoring.db.parameters` and removed.

**Wiring.** Done by `registerTelemetry`, nothing in the app:
instrumentation-http and -undici get a `requestHook` / `responseHook`;
oracledb `enhancedDatabaseReporting: true` + a `requestHook` (the execute's
real, typed binds); pg a `requestHook`; ioredis / redis a
`dbStatementSerializer`; kafkajs a `producerHook`; amqplib a `publishHook`; a
`TypeormInstrumentation` passed in `instrumentations` gets
`collectParameters: true`. Hooks the app passes in `instrumentationConfig`
(school-core-api's http `requestHook` / `responseHook`) are chained after the
SDK's, never replaced; its other options win (e.g. `enhancedDatabaseReporting:
false`). Capture runs only when spans leave the process (a queue mode, OTLP,
or the app's own span processors).

Code that makes its own spans uses the same rules: `captureHttp(span, { url,
request: { headers, body }, response: { headers, body } })`,
`captureMessage(span, { body, headers })`, `captureDbParameters(span,
statement, binds)` (`skilllane-monitoring`); `instrumentationConfigOf(name)`
(`skilllane-monitoring/otel`) gives an instrumentation's running options, e.g. for a
stand-in driver.

Not captured: a TypeORM `query(sql, params)` (the instrumentation records no
parameters, and school-core-api suppresses the oracledb span beneath it),
Kafka batches (`eachBatch`), message bodies the consumer reads in another
way than the tracked callback.

**Cost.** All capture work is synchronous at span end and bounded by
`LOG_BODY_MAX_BYTES`: at most that much of a body, statement, bind list or
Redis command is ever looked at, whatever its real size (a 10,000-bind bulk
INSERT costs ~3 ms, a 10 MB Redis SET ~6 ms, a 23 MB multipart form with
200,000 fields ~25 ms). Masking one body, warm, on an Apple M4: a
login-sized JSON ~0.01 ms, 8 KB ~0.13 ms, 30 KB ~0.25 ms, a body cut at 64 KB
(tolerant scan) ~0.7 ms. Per request, measured end to end on the reviewer's
closed-loop runs before this round: login-sized +0.06–0.14 ms CPU, a
realistic 2 KB in / 8 KB out +0.1–0.2 ms, 30 KB / 20 KB +0.8–1.1 ms, and two
bodies both cut at 64 KB +3–4 ms (3–8 ms under load). On a trivial handler at
concurrency 16 that is 65–80 % fewer requests per second with capture on; on
a real handler (database calls) the share is far smaller. A span with two cut
bodies is about 160 KB on the queue. `LOG_CAPTURE=off` or
`LOG_CAPTURE_SKIP_ROUTES` remove the capture work (masking of what the app
writes itself stays).

## LOG_PRETTY

`LOG_PRETTY=true` replaces the JSON lines with a readable format for local
development. Production must stay JSON. The JSON fields do not change.

```
<time> <LVL> <service/role>  <title>
    <method path status source job id attempt>
    <file target reason …> duration=…
    error detail: <what to do>
    actual error: <the error>
    trace id:     <full trace id>  user id: <user id>
```

```
14:02:11.204 INF school-core-api/api  request completed
    method=POST path=/orders status=201 duration=84ms
    trace id:     4bf92f3577b34da6a3ce929d0e0e4736  user id: u_1029

14:03:40.517 ERR school-core-api/api  read from undefined value
    method=POST path=/orders/:id/discount
    file=src/orders/apply-discount.handler.ts duration=31ms
    error detail: the object holding .percent was undefined; …
    actual error: TypeError: Cannot read properties of undefined (reading 'percent')
    trace id:     a3ce929d0e0e47364bf92f3577b34da6  user id: u_2201

14:05:20.100 WRN school-core-api/api  redis "cache" still down
    target=10.0.3.21:6379 retry=9 duration=30.0s

14:05:35.300 INF school-core-api/api  redis "cache" is back
    target=10.0.3.21:6379 duration=45.2s
```

- **First line**: local `HH:mm:ss.SSS`, `DBG/INF/WRN/ERR/FTL`, `service.name`,
  then the title — `error.hint` when there is one, else the event's short
  title (`EVENT_CATALOG[code].title`) or the message, first letter lower-cased.
- **key=value lines** under it, only those with a value: what ran
  (`method path status source job id attempt`), then where
  (`file target reason dlq affects retry port`); `duration` ends the last
  line. `path` is `http.route` (no ids), else `url.path`. `source` is `event.module`.
  `job` is the topic/queue for Kafka/RabbitMQ, the job name otherwise.
  `target` is `labels.error_target`, else the dependency `host:port`, else
  `url.domain`. `duration` is `duration_ms`; on a line inside a request/job
  without one, the time since it started (pretty only, not in JSON).
  < 1000 ms → `84ms`, else `1.2s`.
- **Sub-lines**, only with a value, in this order: `error detail:`
  (`error.fix`, else `error.hint_detail`), `actual error:` (`Type [CODE] message`
  or `Type: message`), `stack:` (with `LOG_STACK`), `trace id:` + `user id:`.
- A multi-line entry is separated from its neighbours by one blank line.
- Colours (level; dim labels and trace id) only on a TTY without `NO_COLOR`.
- No user data besides the user id: paths show the route pattern.

`event.module` (`bullmq`, `kafka`, `rabbitmq`, `cron`, `task`) is on job lines
and on dependency lines of those systems (the queue Redis → `bullmq`). A
repeatable BullMQ job is `cron`; `tracked(name, fn, { source: 'cron' })` marks
a `@Cron` method. `app.started` of an HTTP app is written after `listen()`
with `server.port`. Work still running at shutdown or a crash is listed in
`job.inflight` on the `app.shutdown` / `app.uncaught_exception` line
(in memory only; nothing survives `kill -9`).

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `LOGGING_ENGINE` | `new` | `legacy` = the service's previous logger, nothing from this library is installed |
| `LOG_NEST_AUTO` | `true` | `false` = no automatic Nest wiring (logger, LoggingModule, request lines) |
| `LOG_AUTO_WATCH` | `true` | `false` = do not watch ioredis / kafkajs / amqplib / @nestjs/schedule |
| `LOG_EXPORT` | from config | `kafka` · `rabbitmq` · `bullmq` · `http` · `otlp` · `stdout`; empty = the first configured of `LOG_KAFKA_BROKERS`, `LOG_RABBITMQ_URL`, `LOG_BULLMQ_REDIS_URL`, `LOG_HTTP_URL`, `OTEL_EXPORTER_ENDPOINT`, else stdout. stdout is always written |
| `LOG_KAFKA_BROKERS` | — | `host:port,host:port` |
| `LOG_KAFKA_CLIENT_ID` | `skilllane-monitoring-<service>` | kafkajs client id |
| `LOG_KAFKA_SSL` | off | `true` = TLS |
| `LOG_KAFKA_SASL_MECHANISM` / `_USERNAME` / `_PASSWORD` | off | `plain` · `scram-sha-256` · `scram-sha-512` |
| `LOG_RABBITMQ_URL` | — | `amqp://user:pass@host:5672/vhost` |
| `LOG_RABBITMQ_EXCHANGE` | `skilllane-monitoring.telemetry` | durable direct exchange |
| `LOG_BULLMQ_REDIS_URL` | — | `redis://host:6379/0` (the queue Redis, not the app's cache) |
| `LOG_BULLMQ_PREFIX` | `bull` | BullMQ key prefix |
| `LOG_HTTP_URL` | — | no queue: the engine's base URL, e.g. `http://skilllane-monitoring-engine:5100` |
| `LOG_HTTP_TOKEN` | — | only when the engine sets `ENGINE_INGEST_TOKEN` (or put it in the URL: `https://<token>@host`) |
| `LOG_TOPIC_LOGS` / `LOG_TOPIC_SPANS` | `skilllane-monitoring.logs` / `skilllane-monitoring.spans` | topic / routing key / queue names (no `:`) |
| `OTEL_EXPORTER_ENDPOINT` | — | Collector base URL for OTLP, e.g. `http://otel-collector:4318` |
| `LOG_EXPORT_BATCH_MS` / `LOG_EXPORT_BATCH_SIZE` / `LOG_EXPORT_MAX_QUEUE` | `1000` / `500` / `10000` | export batching; the oldest items are dropped when the queue is full |
| `LOG_EXPORT_MAX_BYTES` | `800000` | max encoded bytes of one queue message; bigger batches are split, and a span over it has its largest captured values cut (flagged truncated) instead of being dropped |
| `LOG_EXPORT_MAX_QUEUE_BYTES` | `67108864` | max heap held by the items waiting in memory per stream (64 MB; an item with any character above U+00FF, e.g. Thai, counts 2 bytes per character, as V8 stores it); the oldest are dropped above it. Two streams (logs, spans): up to twice this per process during a queue outage |
| `LOG_EXPORT_SHUTDOWN_MS` | `3000` | how long shutdown, crash and exit wait for the exporters |
| `OTEL_SERVICE_NAME` / `SERVICE_VERSION` / `OTEL_ENV` / `APP_ROLE` | package.json name / version / `NODE_ENV` / – | `service.name` / `service.version` / `service.environment` / role; also the `resource` of every queue envelope |
| `LOG_LEVEL` | `info` | lowest level written |
| `LOG_PRETTY` | `false` | readable format for local development (see LOG_PRETTY) |
| `LOG_STACK` | `off` | pretty only: `app` = our frames (≤5, no line numbers), `full` = the whole stack |
| `LOG_PRETTY_TRACE` | `all` | pretty only: `warn` = trace/user line on WRN, ERR, FTL only |
| `UNHANDLED_REJECTION` | `exit` | `exit` keeps Node 20's crash (after logging); `log` keeps the process alive |
| `INFLIGHT_HTTP_AFTER_MS` | `1000` | requests running longer than this are listed in `job.inflight` |
| `DEPENDENCY_STILL_DOWN_MS` | `30000` | interval of `dependency.still_down` |
| `LOG_CAPTURE` | `all` | `off` = no headers, bodies, query strings, bind values, full Redis commands or payloads captured on spans (what the app captures itself is still masked) |
| `LOG_BODY_MAX_BYTES` | `65536` | bytes kept of each body, payload, statement and header / parameter list; the rest is counted (`*.body.size`) and `*.body.truncated` is true |
| `LOG_CAPTURE_SKIP_ROUTES` | — | comma-separated path prefixes (incoming paths, or outgoing paths / URLs, e.g. `/ar-webgl/raw,https://s3.`) whose bodies are not read: headers, query and size only |

## Field changes from the previous school-core-api logger

Dashboards and alerts that query the old fields must move to the new ones.

| Old | New |
| --- | --- |
| `message: "request middleware"` (2 lines per request; still written until the app removes its `LoggerMiddleware`) | `event.code: "http.request"` (1 line, when the response finishes) |
| `request_id` | `trace.id`; the `request-id` response header and the error body `requestId` carry the same value |
| `service: "GET /url?query"` | `http.request.method` + `url.path` (no query string) + `http.route` |
| `response_code` | `http.response.status_code` |
| `response_time_ms` | `duration_ms` |
| `user_id`, `schoolId`, `user_role` | `user.id`, `organization.id`, `user.roles` |
| `traceId`, `spanId` (PinoInstrumentation) | `trace.id`, `span.id` |
| `dbQuery`, `dbDriverError` (exception filter) | `db.statement`, `error.code` (`dbParameters` is no longer logged: the bind values are `skilllane.monitoring.db.parameters` on the db span) |
| every handled HttpException at `error` | 4xx at `warn`, 5xx at `error`; an error a pattern calls `warn` that ends in a 5xx answer is `error` (see "Level of an error line inside a request") |

## Development

```sh
pnpm --filter skilllane-monitoring test
pnpm --filter skilllane-monitoring build   # school-core-api imports dist/
```

Error hints live in `src/errors/patterns/` — see its README before adding one.

## The contract: `skilllane-monitoring/contract`

The wire format between the SDK (publisher, inside the app) and the skilllane-monitoring engine
(subscriber) lives in `src/contract` and is exposed as its own entry point, free of side effects
(no OpenTelemetry, no hooks), so the engine and other readers import only this:

```ts
import { parseEnvelope, resolveExportMode, INGEST_PATH, maskObject } from 'skilllane-monitoring/contract'
```

- stream names and queue / topic defaults (`STREAMS`, `topicName()`, `rabbitmqExchange()`)
- message headers (`HEADER_STREAM`, `HEADER_VERSION`) and the HTTP ingest path (`INGEST_PATH`)
- the envelope types and `parseEnvelope()`
- the `LOG_*` environment variable names and `resolveExportMode()`
- the masking rules both ends apply (`mask/`)

Up to 0.1.0 this was the separate package `skilllane-monitoring-contract`; it is now deprecated in
favour of this entry point.
