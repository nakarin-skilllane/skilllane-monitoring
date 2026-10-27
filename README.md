# skilllane-monitoring

SDK ที่ NestJS service ติดตั้งเพื่อส่ง log และ trace ไปที่ **skilllane-monitoring engine** ไม่ต้องแก้ business code

```
service + SDK  →  Kafka / RabbitMQ / BullMQ ของ service (หรือ HTTP ตรง)  →  engine  →  ClickHouse  →  monitor
```

repo นี้มีแค่ SDK ส่วน engine และหน้า monitor อยู่ใน repo `skilllane-monitoring-engine`

## เริ่มใช้

```sh
pnpm add skilllane-monitoring
```

```ts
// บรรทัดแรกของ src/main.ts (หรือ NODE_OPTIONS="--require skilllane-monitoring/register")
import 'skilllane-monitoring/register'
```

```sh
OTEL_SERVICE_NAME=school-core-api
APP_ROLE=api
LOG_HTTP_URL=http://10.0.0.5:5100     # หรือ LOG_EXPORT=kafka|rabbitmq|bullmq
LOG_PRETTY=true                       # dev เท่านั้น
```

เปิด service แล้วต้องเห็น `app.started` ในหน้า monitor

## เอกสาร

| เรื่อง | ที่ |
| --- | --- |
| การต่อ service, env ทุกตัว, hint, dependency, queue, capture, masking, CLI | [packages/monitoring/README.md](packages/monitoring/README.md) |
| ตาราง error ของโปรเจค (`errors init` / `check` / `uninstall`) | [docs/project-error-catalog.md](docs/project-error-catalog.md) |
| กติกาเพิ่ม hint ในตัว SDK | [packages/monitoring/src/errors/patterns/README.md](packages/monitoring/src/errors/patterns/README.md) |
| สเปก wire format และ engine | `SPEC.md` ใน repo `skilllane-monitoring-engine` |

## พัฒนา SDK

Node ≥ 20 และ pnpm 8

```sh
pnpm install
pnpm test && pnpm typecheck && pnpm lint
pnpm build        # packages/monitoring → dist/
```

Publish: แก้ `version` ใน `packages/monitoring/package.json` (semver) แล้ว `cd packages/monitoring && pnpm publish`
(ต้อง `npm login` และใส่ OTP) จากนั้นอัปเดตเวอร์ชันใน service และใน engine
