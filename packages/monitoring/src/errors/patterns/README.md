# Error patterns

The hint table that turns an `error.code` into `error.hint` + `error.hint_detail`.
One file per source; `index.ts` concatenates them and `../hints.ts` builds the lookup.

## Lookup order

1. A hint the developer passed (`{ hint, hintDetail }` or `AppError`) wins.
2. The app's own catalog (`errors init`, see the package README), by the same
   steps 3–5. An entry for a built-in code replaces only the fields it sets.
3. `(dependency.type, error.code)` — e.g. `(redis, ECONNREFUSED)`.
4. `error.code` alone.
5. `messageMatch` — only for errors that carry no code.
6. Nothing matched → no hint. A missing hint is better than a wrong one.

## Example file

The four kinds of entry, taken from the real files:

```ts
// src/errors/patterns/<source>.ts
import { quotedColumn } from './explain-helpers'
import type { ErrorPattern } from './types'

// Where the codes come from (library file, spec section): see the table below.
export const examplePatterns: ErrorPattern[] = [
  // 1. A code (smtp.ts)
  {
    key: 'EAUTH',
    hint: 'Wrong SMTP login',
    hintDetail:
      'The SMTP server rejected the username/password, or the account is locked. Check mail credentials in env.',
    category: 'config',
  },
  // 2. A code raised by one dependency, with placeholders (redis.ts)
  {
    key: 'ECONNREFUSED',
    dependency: 'redis',
    hint: '{Type} "{name}" unreachable',
    hintDetail:
      'Nothing is listening at {host}:{port}. {Type} may be stopped or restarting, or {env} is wrong.',
    retryable: true,
  },
  // 3. No code: match the message, pull out what to fix (runtime.ts)
  {
    key: 'NULL_WRITE',
    messageMatch: /Cannot set propert(?:y|ies) of (?:undefined|null)/,
    hint: 'Write to undefined value',
    hintDetail:
      'Code set a property (see target) on undefined or null. Create the object first, or check why it was not loaded.',
    category: 'bug',
    target: /\(setting '([^']*)'\)|property '([^']*)'/,
  },
  // 4. The specific case as error.fix: names and counts, never values (oracle.ts)
  {
    key: 'ORA-12899',
    hint: 'Value too long for column',
    hintDetail:
      'A text value exceeds the column size. Common in Excel imports; validate length before saving.',
    level: 'warn',
    category: 'data',
    explain: ({ message, schema }) => {
      const target = quotedColumn(schema, message) // "APP"."product"."name" → ProductEntity.name
      const sizes = message.match(/actual: (\d+), maximum: (\d+)/)
      if (!target) return undefined
      return {
        target,
        fix: sizes
          ? `${target} got ${sizes[1]} (max ${sizes[2]}). Validate the length in the DTO or import before saving.`
          : `${target} is too long. Validate the length before saving.`,
      }
    },
  },
]
```

Then add `...examplePatterns` to `ALL_PATTERNS` in `index.ts` (a `messageMatch`
pattern of a library goes before the generic Node/V8 ones: the first match
wins), a row to the evidence table below, and for `explain` a fixture with the
library's real message in `test/explain.test.ts`:

```ts
it('ORA-12899 gives the column, actual and maximum', () => {
  const line = logged(oracle('ORA-12899: value too large for column "APP"."product"."name" (actual: 312, maximum: 255)'))
  expect(line['error.fix']).toBe('ProductEntity.name got 312 (max 255). Validate the length in the DTO or import before saving.')
  expect(line.labels.error_target).toBe('ProductEntity.name')
})
```

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

Two passes: the codes a production NestJS service (Oracle, Redis, Kafka,
RabbitMQ, S3, Google APIs) actually throws, then the official code list of
every library, so the table covers what a service is expected to meet.

| File | Source |
| --- | --- |
| `oracle.ts` | Oracle Database Error Messages (connection, PL/SQL, constraints, dates, tablespaces, TNS 12xxx), `node-oracledb/lib/errors.js` (NJS-), ODPI-C (DPI-) |
| `postgres.ts` | PostgreSQL errcodes appendix (SQLSTATE classes 08, 22, 23, 25, 28, 3D/3F, 40, 42, 53, 54, 55, 57, XX), node-postgres `client.js` messages |
| `mysql.ts` | mysql/mysql2 `lib/protocol/constants/errors.js` (ER_ names), client PROTOCOL_* / POOL_* codes |
| `mongodb.ts` | MongoDB driver error classes, server codes 11000/13/18/50/112/121/251, Mongoose errors |
| `typeorm.ts` | TypeORM 0.3 `src/error/*` (every class), QueryBuilder messages |
| `node-net.ts` | nodejs.org/api/errors.html "Common system errors" + ERR_SOCKET_* / ERR_SERVER_* |
| `node-tls.ts` | Node ERR_TLS_* / ERR_SSL_* / ERR_OSSL_* / ERR_CRYPTO_*, OpenSSL `crypto/x509/x509_txt.c` (X509_V_ERR names Node copies into `code`) |
| `node-http.ts` | Node ERR_HTTP_* / ERR_STREAM_*, llhttp HPE_* parser codes |
| `node-core.ts` | Node ERR_INVALID_ARG_*, ERR_OUT_OF_RANGE, modules (MODULE_NOT_FOUND, ERR_REQUIRE_ESM, ERR_PACKAGE_PATH_NOT_EXPORTED), workers, child processes, ABORT_ERR, DOMException AbortError/TimeoutError |
| `fetch.ts` | undici `lib/core/errors.js` (UND_ERR_*), node-fetch FetchError types, global fetch "fetch failed" / "terminated" |
| `redis.ts` | `redis/src/server.c` shared replies + cluster spec (MOVED, ASK, TRYAGAIN, CLUSTERDOWN, CROSSSLOT); ioredis `Redis.ts` / `cluster/index.ts` messages |
| `bullmq.ts` | BullMQ `scripts.ts` finishedErrors, `worker.ts` / `job.ts` messages, `classes/errors/*` |
| `kafka.ts` | kafkajs `src/errors.js` (all classes), Kafka `Errors.java` protocol error codes |
| `rabbitmq.ts` | AMQP 0-9-1 reply codes (rabbitmq/amqp-0.9.1-spec constants), amqplib `connection.js` / `channel.js` messages |
| `http.ts` | axios `AxiosError.js` codes, Node "socket hang up" |
| `ldap.ts` | ldapts error classes (one per LDAP result code, RFC 4511) |
| `google.ts` | Drive / Calendar "Resolve errors" pages, OAuth 2.0 web-server error codes, google.rpc.Code status names |
| `s3.ts` | S3 API ErrorResponses code list, AWS SDK v3 / STS client errors |
| `smtp.ts` | nodemailer error codes, RFC 5321 §4.2.3 reply codes, RFC 4954 (530/534/535/538) |
| `nest-http.ts` | one entry per built-in Nest HttpException class |
| `nest-core.ts` | `@nestjs/core/errors/messages.ts` (DI, module, route errors), @nestjs/graphql and @nestjs/swagger type reflection messages |
| `http-body.ts` | body-parser / raw-body error `type` values, multer `multer-error.js` codes, busboy messages |
| `browser.ts` | Puppeteer / Playwright navigation, target and launch messages, Chromium net::ERR_* |
| `runtime.ts` | V8 TypeError / ReferenceError / RangeError / SyntaxError messages (bugs in our code), heap OOM text |
| `app.ts` | jsonwebtoken `verify.js` messages, validation libraries (Joi/Yup/Mongoose ValidationError, ZodError, CastError), common app `errorCode` values (duplicate, busy, file import) |
