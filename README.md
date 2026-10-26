# skilllane-monitoring

SDK ที่ NestJS service ติดตั้งเพื่อส่ง log และ trace ไปที่ **skilllane-monitoring engine**
ติดตั้งแล้วตั้ง env ไม่กี่ตัว ไม่ต้องแก้ business code

```
NestJS service + skilllane-monitoring (SDK)  →  queue ของ service (Kafka / RabbitMQ / BullMQ)  →  engine  →  ClickHouse  →  monitor / AI
                                              →  หรือ HTTP ตรงเข้า engine ถ้าไม่มี queue
```

repo นี้มีแค่ฝั่ง **publish** (SDK) ส่วน engine, ClickHouse และหน้า monitor อยู่ใน repo `skilllane-monitoring-engine`

| Package | คืออะไร |
| --- | --- |
| [`skilllane-monitoring`](packages/monitoring) | SDK: log แบบ ECS JSON + trace ของ OpenTelemetry สำหรับ NestJS ส่งเข้า queue ของ service, HTTP ตรงเข้า engine หรือ OTLP |
| [`skilllane-monitoring/contract`](packages/monitoring/src/contract) | ส่วนหนึ่งของ SDK ที่ engine ใช้ด้วย: รูปแบบ envelope, ชื่อ topic, กติกา mask ข้อมูลลับ |

## เริ่มใช้ใน service

```sh
pnpm add skilllane-monitoring
```

โหลด `register` ก่อนทุกอย่าง ทางใดทางหนึ่ง:

```ts
// src/main.ts (หรือ src/instrumentation.ts) บรรทัดแรก
import 'skilllane-monitoring/register'
```

```sh
# หรือไม่แก้โค้ด
NODE_OPTIONS="--require skilllane-monitoring/register" node dist/main.js
```

ตั้ง env ของ service:

```sh
OTEL_SERVICE_NAME=school-core-api     # ชื่อ service
APP_ROLE=api                          # api | worker
OTEL_ENV=prod                         # prod | staging | dev … (แยกข้อมูลแต่ละ env ใน engine)
SERVICE_VERSION=31.4.0                # ไม่ใส่ = version ใน package.json ควรตั้งทุกครั้งที่ deploy

# ส่งเข้า engine ทางใดทางหนึ่ง (ค่าต้องตรงกับ .env ของ engine)
LOG_HTTP_URL=http://10.0.0.5:5100     # HTTP ตรง
LOG_HTTP_TOKEN=<ENGINE_INGEST_TOKEN>
# หรือผ่าน queue: LOG_EXPORT=kafka|rabbitmq|bullmq + LOG_KAFKA_BROKERS / LOG_RABBITMQ_URL / LOG_BULLMQ_REDIS_URL

LOG_PRETTY=true                       # dev: log บน terminal อ่านง่าย (production ใช้ false = JSON)
```

เปิด service แล้วดูที่หน้า monitor ต้องเห็น service นั้นและ log `app.started`
รายการ env ทั้งหมดอยู่ใน [SDK README › Environment](packages/monitoring/README.md#environment)

## สิ่งที่ได้อัตโนมัติ

- **log ทุกบรรทัดเป็น ECS JSON** ผ่าน `new Logger()` ของ Nest ตามปกติ มี `event.code`, hint ว่าน่าจะเกิดจากอะไร, `error.fix` และ `log.origin.*` บอกว่าต้องแก้ที่ไหน
- **trace ข้าม service** ด้วย OpenTelemetry ใน process เดียวกัน (ไม่ต้องมี Collector) ผ่าน HTTP (`traceparent`) และ BullMQ
- **request / response แบบ Network tab**: header, body, query, SQL พร้อมค่า bind, คำสั่ง Redis, payload ของ queue **mask ข้อมูลลับก่อนออกจาก process เสมอ** (password, token, JWT, email, เลขบัตรประชาชน)
- **dependency**: `dependency.up` / `down` / `still_down` ของ Oracle, Redis, Kafka, RabbitMQ, SMTP, S3, Google
- **งานเบื้องหลัง**: `job.started` / `finished` / `retry` / `failed` ของ BullMQ, kafkajs, amqplib และ `@nestjs/schedule`
- **ตาราง error ของโปรเจค**: สอน SDK ให้รู้จัก error code ของแอปเอง (hint, ใครต้องแก้, ระดับ) จากไฟล์เดียว ดู [docs/project-error-catalog.md](docs/project-error-catalog.md)

```sh
pnpm skilllane-monitoring errors init     # สร้าง src/skilllane-monitoring/errors.ts + README
pnpm skilllane-monitoring errors check    # ตรวจก่อน deploy (ใช้ใน CI ได้)
pnpm skilllane-monitoring uninstall       # ถอดออกทั้งหมด
```

ถ้า queue หรือ engine ล่ม SDK พักข้อมูลไว้ใน memory แบบมีเพดานแล้วส่งต่อเมื่อกลับมา ไม่ block และไม่ throw ใส่แอป
และ log ยังออก stdout เสมอ `LOGGING_ENGINE=legacy` ปิดทุกอย่างโดยไม่ต้อง deploy โค้ดใหม่

## เอกสาร

| เรื่อง | ที่ |
| --- | --- |
| การต่อ service, hint / fix, dependency, queue, ข้อมูลที่ capture, env ทุกตัว | [packages/monitoring/README.md](packages/monitoring/README.md) |
| ตาราง error ของโปรเจค (`errors init` / `check` / `uninstall`) | [docs/project-error-catalog.md](docs/project-error-catalog.md) |
| กติกาเพิ่ม hint ในตัว SDK | [packages/monitoring/src/errors/patterns/README.md](packages/monitoring/src/errors/patterns/README.md) |
| สเปก wire format และ engine | `SPEC.md` ใน repo `skilllane-monitoring-engine` |

## พัฒนา SDK

ต้องมี Node ≥ 20 และ pnpm 8

```sh
pnpm install
pnpm build        # packages/monitoring → dist/
pnpm test         # vitest
pnpm typecheck
pnpm lint         # biome (pnpm lint:fix แก้ format ให้)
```

โครง repo:

```
packages/monitoring/
  src/
    logger/        AppLogger, ECS record, pretty, redact
    errors/        serializer, adapters ของแต่ละ library, hint patterns, ตาราง error ของโปรเจค
    capture/       เก็บ request / response ลง span + mask
    integrations/  ioredis, kafkajs, amqplib, bullmq, dependency monitor
    otel/          registerTelemetry, auto-instrumentation
    transport/     publisher + Kafka / RabbitMQ / BullMQ / HTTP
    contract/      envelope, topic, กติกา mask (export เป็น skilllane-monitoring/contract)
    cli/           bin `skilllane-monitoring`
  test/            vitest
docs/              คู่มือ และ superpowers/ (spec กับแผนของแต่ละงาน)
```

### Publish

package อยู่บน npm ชื่อ `skilllane-monitoring` engine และทุก service ติดตั้งจากที่นั่น

```sh
cd packages/monitoring
# แก้ "version" ใน package.json ตาม semver (เพิ่มความสามารถ = minor)
pnpm publish      # prepublishOnly build ให้เอง
```

แล้วอัปเดต `"skilllane-monitoring": "^x.y.z"` ใน service และใน `apps/engine` ของ repo engine
