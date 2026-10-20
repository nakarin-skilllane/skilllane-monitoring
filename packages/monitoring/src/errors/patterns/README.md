# Error patterns

The hint table that turns an `error.code` into `error.hint` + `error.hint_detail`.
One file per source; `index.ts` concatenates them and `../hints.ts` builds the lookup.

## Lookup order

1. A hint the developer passed (`{ hint, hintDetail }` or `AppError`) wins.
2. `(dependency.type, error.code)` — e.g. `(redis, ECONNREFUSED)`.
3. `error.code` alone.
4. `messageMatch` — only for errors that carry no code.
5. Nothing matched → no hint. A missing hint is better than a wrong one.

## Rules for a new pattern

- `hint` ≤30 characters (≤40 with `dependency`), `hintDetail` ≤200. English, constant.
- Placeholders allowed only in dependency patterns: `{Type} {name} {host} {port} {env}`.
- Describe the likely causes, not one certain cause (in Kubernetes `ECONNREFUSED`
  usually means the pod is restarting, not that the service is gone).
- `level: 'warn'` for errors caused by the caller (4xx, duplicates, validation).
  Inside an HTTP request the line still ends up `error` when the response is
  5xx (the line waits for the status; see the package README).
- `category` says who acts: `bug` (fix code), `input` (caller), `data` (stored
  rows conflict), `dependency` (a service is failing), `config` (env/credentials).
  Default: `dependency` with `dependency` set, `input` with `level: 'warn'`.
- `explain({ message, error, schema })` returns `{ target, fix }` for the
  specific case (`error.fix`): read names and counts only, never values
  (bind parameters, duplicated values, Redis keys are masked with `keyShape`).
  Use `schema` to turn DB names into `Entity.property`. Add a fixture with the
  library's real message to `test/explain.test.ts`.
- `target` (regex, first matching group) pulls the property, constraint or
  column out of the message into `labels.error_target`; the hint stays constant.
- The meaning must match the library's official documentation.
- `test/patterns.test.ts` enforces lengths, placeholders and unique keys.

## Where each file's codes came from (school-core-api scan, 2026-10-06)

| File | Evidence |
| --- | --- |
| `oracle.ts` | `src/common/types/oracle-error-code.ts`, `common/filters/exception.filter.ts:134-185`, `database/database.config.ts:74-82` (pool max 20, queue 500), comments in repositories (ORA-01795, NJS-098, ORA-01722, ORA-00904, ORA-00936, ORA-01407). Connection codes from node-oracledb docs. |
| `node-net.ts` | `oracle-iam/oracle-api-error.handler.ts:30-127`, `google/google-api-error.handler.ts:20-24`, `partner-exercise-iframe.adapter.ts:123-124` |
| `redis.ts` | `src/redis/config/redis-connection.constants.ts:3-37` (commandTimeout, maxRetriesPerRequest=5); reply codes from Redis docs |
| `bullmq.ts` | `common/global-queue/worker-host/worker-host.processor.ts`, `keyed-concurrency-limiter.ts:7` |
| `kafka.ts` | `common/kafka/services/kafka-consumer.service.ts`, `kafka-producer.service.ts:77`, `kafka-publish-timeout.exception.ts` |
| `rabbitmq.ts` | `common/rabbitMQ/rabbitmq.service.ts:102-152`; close codes from AMQP 0-9-1 spec |
| `http.ts` | `thaid.provider.ts`, `oracle-api-error.handler.ts` (ldapts errors), axios error codes |
| `google.ts` | `google-api-error.handler.ts:45-214`, `google-rate-limit.service.ts:91-108`, `login-with-google-callback.handler.ts:125` |
| `s3.ts` | `common/service/storage-v2/providers/aws.provider.ts:96,133-770` |
| `smtp.ts` | `common/service/email/email.service.ts:67-99`; nodemailer error codes |
| `nest-http.ts` | Throw counts: BadRequest 1,038 · NotFound 631 · Forbidden 270 · InternalServerError 228 · Conflict 204 |
| `typeorm.ts` | `findOneOrFail` ×122, query runners/transactions ×318 in school-core-api; TypeORM 0.3.19 error classes |
| `runtime.ts` | V8 TypeError / ReferenceError / RangeError messages (bugs in our code) |
| `app.ts` | `auth.service.ts:91-99` (JWT), `exception.filter.ts` errorCodes, Excel import errorCodes |
