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

## Where each file's codes came from

Two passes: a school-core-api scan (2026-10-06) for the codes the service actually
throws, then the official code lists of every library (2026-10-20) so the table
covers what we expect to meet, not only what we have met.

| File | Evidence |
| --- | --- |
| `oracle.ts` | `src/common/types/oracle-error-code.ts`, `common/filters/exception.filter.ts:134-185`, `database/database.config.ts:74-82` (pool max 20, queue 500), comments in repositories (ORA-01795, NJS-098, ORA-01722, ORA-00904, ORA-00936, ORA-01407). Then Oracle Database Error Messages (common ORA- codes: connection, PL/SQL, constraints, dates, tablespaces, TNS 12xxx), `node-oracledb/lib/errors.js` (NJS-), ODPI-C (DPI-). |
| `postgres.ts` | PostgreSQL errcodes appendix (SQLSTATE classes 08, 22, 23, 25, 28, 3D/3F, 40, 42, 53, 54, 55, 57, XX), node-postgres `client.js` messages |
| `mysql.ts` | mysql/mysql2 `lib/protocol/constants/errors.js` (ER_ names), client PROTOCOL_* / POOL_* codes |
| `mongodb.ts` | MongoDB driver error classes, server codes 11000/13/18/50/112/121/251, Mongoose errors |
| `typeorm.ts` | `findOneOrFail` ×122, query runners/transactions ×318 in school-core-api; TypeORM 0.3 `src/error/*` (every class), QueryBuilder messages |
| `node-net.ts` | `oracle-iam/oracle-api-error.handler.ts:30-127`, `google/google-api-error.handler.ts:20-24`, `partner-exercise-iframe.adapter.ts:123-124`; nodejs.org/api/errors.html "Common system errors" + ERR_SOCKET_* / ERR_SERVER_* |
| `node-tls.ts` | Node ERR_TLS_* / ERR_SSL_* / ERR_OSSL_* / ERR_CRYPTO_*, OpenSSL `crypto/x509/x509_txt.c` (X509_V_ERR names Node copies into `code`) |
| `node-http.ts` | Node ERR_HTTP_* / ERR_STREAM_*, llhttp HPE_* parser codes |
| `node-core.ts` | Node ERR_INVALID_ARG_*, ERR_OUT_OF_RANGE, modules (MODULE_NOT_FOUND, ERR_REQUIRE_ESM, ERR_PACKAGE_PATH_NOT_EXPORTED), workers, child processes, ABORT_ERR, DOMException AbortError/TimeoutError |
| `fetch.ts` | undici `lib/core/errors.js` (UND_ERR_*), node-fetch FetchError types, global fetch "fetch failed" / "terminated" |
| `redis.ts` | `src/redis/config/redis-connection.constants.ts:3-37` (commandTimeout, maxRetriesPerRequest=5); reply prefixes from `redis/src/server.c` shared replies + cluster spec (MOVED, ASK, TRYAGAIN, CLUSTERDOWN, CROSSSLOT); ioredis `Redis.ts` / `cluster/index.ts` messages |
| `bullmq.ts` | `common/global-queue/worker-host/worker-host.processor.ts`, `keyed-concurrency-limiter.ts:7`; BullMQ `scripts.ts` finishedErrors, `worker.ts` / `job.ts` messages, `classes/errors/*` |
| `kafka.ts` | `common/kafka/services/kafka-consumer.service.ts`, `kafka-producer.service.ts:77`, `kafka-publish-timeout.exception.ts`; kafkajs `src/errors.js` (all classes), Kafka `Errors.java` protocol error codes |
| `rabbitmq.ts` | `common/rabbitMQ/rabbitmq.service.ts:102-152`; AMQP 0-9-1 reply codes (rabbitmq/amqp-0.9.1-spec constants), amqplib `connection.js` / `channel.js` messages |
| `http.ts` | `thaid.provider.ts`, `oracle-api-error.handler.ts`; axios `AxiosError.js` codes, Node "socket hang up" |
| `ldap.ts` | ldapts error classes (one per LDAP result code, RFC 4511) |
| `google.ts` | `google-api-error.handler.ts:45-214`, `google-rate-limit.service.ts:91-108`, `login-with-google-callback.handler.ts:125`; Drive / Calendar "Resolve errors" pages, OAuth 2.0 web-server error codes, google.rpc.Code status names |
| `s3.ts` | `common/service/storage-v2/providers/aws.provider.ts:96,133-770`; S3 API ErrorResponses code list, AWS SDK v3 / STS client errors |
| `smtp.ts` | `common/service/email/email.service.ts:67-99`; nodemailer error codes, RFC 5321 §4.2.3 reply codes, RFC 4954 (530/534/535/538) |
| `nest-http.ts` | Throw counts: BadRequest 1,038 · NotFound 631 · Forbidden 270 · InternalServerError 228 · Conflict 204; one entry per built-in HttpException class |
| `nest-core.ts` | `@nestjs/core/errors/messages.ts` (DI, module, route errors), @nestjs/graphql and @nestjs/swagger type reflection messages |
| `http-body.ts` | body-parser / raw-body error `type` values, multer `multer-error.js` codes, busboy messages |
| `browser.ts` | Puppeteer / Playwright navigation, target and launch messages, Chromium net::ERR_* |
| `runtime.ts` | V8 TypeError / ReferenceError / RangeError / SyntaxError messages (bugs in our code), heap OOM text |
| `app.ts` | `auth.service.ts:91-99` (JWT), `exception.filter.ts` errorCodes, Excel import errorCodes; jsonwebtoken `verify.js` messages, validation libraries (Joi/Yup/Mongoose ValidationError, ZodError, CastError) |
