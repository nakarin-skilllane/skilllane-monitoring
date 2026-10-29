# ตาราง error ของโปรเจค (project error catalog)

ตั้งแต่ `skilllane-monitoring` 0.4.0 แอปสอน logger ให้รู้จัก error code ของตัวเองได้จากไฟล์เดียว
(`detail` / `howToFix` ตั้งแต่ 0.5.0 ส่วน 0.4 ใช้ `hintDetail` ช่องเดียว)
hint, คำอธิบาย, ใครต้องแก้ และระดับของ error เหล่านั้นจะขึ้นใน log และหน้า monitor โดยไม่ต้องแก้วิธี throw ที่มีอยู่

## เริ่มใช้

```sh
pnpm skilllane-monitoring errors init
```

สร้าง `src/skilllane-monitoring/` พร้อม 2 ไฟล์:

- `errors.ts` ตาราง error ร่างจากของที่แอปใช้อยู่จริง (`errorCode` ของ exception, ข้อความ `throw new …Exception('…')` ที่ซ้ำหลายที่, `code` ใน `this.logger.*`) ทีมเติม `hint` เอง
- `log.ts` ส่ง `log` ของ SDK ต่อให้โค้ดของแอป: `import { log } from '../skilllane-monitoring/log'` แล้ว `log.error('…', err)` ได้โดยไม่ต้องประกาศ `new Logger(Class.name)` ชื่อ class ที่เรียกขึ้นใน `log.logger` เอง
- `README.md` วิธีใช้ กฎ ข้อจำกัด และวิธีตั้ง path (เนื้อหาเหมือนเอกสารนี้ อ่านได้โดยไม่ต้องเปิดที่อื่น)

ไม่เขียนทับไฟล์ที่มีอยู่ · `--path src/common/config/monitoring-errors.ts` วางที่อื่นได้ (ดู "ตำแหน่งไฟล์") · `--min-repeat 10` เปลี่ยนเกณฑ์ข้อความซ้ำ

## ตัวอย่างไฟล์

```ts
// src/skilllane-monitoring/errors.ts
const catalog = {
  ORDER_ALREADY_PAID: {
    hint: 'Order already paid',
    detail: 'The order was paid before.',
    howToFix: 'Check the payment status before charging again.',
    category: 'input',
    level: 'warn',
  },
  1701: { hint: 'Coupon expired', detail: 'The coupon is past its end date.', howToFix: 'Ask the user for another coupon.', category: 'input' },
  'ORA-00001': { hint: 'Duplicate product SKU' },                                             // ทับ hint ของตารางในตัว
  USER_NOT_FOUND: { messageMatch: /^User not found$/, hint: 'User not found', category: 'input', level: 'warn' },  // error ที่ไม่มี code
}

// code ข้างบนเป็นค่าคงที่: throw new AppError(AppErrorCode.ORDER_ALREADY_PAID, …)
export const AppErrorCode = {} as { [K in keyof typeof catalog as `${K & (string | number)}`]: `${K & (string | number)}` }
for (const code of Object.keys(catalog)) (AppErrorCode as Record<string, string>)[code] = code

export default {
  errors: {
    // code ของแอปอยู่ช่องไหนของ error (ไม่ใส่ = err.code และ errorCode ของ exception ของ Nest)
    codeOf: (err: any) => err.errorCode,
    catalog,
  },
}
```

SDK หาและโหลดไฟล์นี้เองตอนแอป start (ไม่ต้องลงทะเบียนหรือ import) และไฟล์ไม่ import อะไรจาก SDK · โค้ดของแอป import `AppErrorCode` จากไฟล์นี้ได้ (path สัมพัทธ์จากไฟล์ที่ import เช่น `import { AppErrorCode } from './skilllane-monitoring/errors'`)

## ทำงานอย่างไร

- **โค้ดเดิมไม่ต้องแก้** error ที่มี code ตรงกับตารางได้ hint อัตโนมัติ ทั้งที่ throw (`throw new OrderAlreadyPaidException()`) และที่บันทึกเอง (`this.logger.error('Import failed', { code: 'E1001' })`)
- **ใช้ code เป็นค่าคงที่:** `AppErrorCode.ORDER_ALREADY_PAID` (ไฟล์ที่สร้างก่อน 0.5 เพิ่มเองได้ตามตัวอย่าง) และ code ในตัว SDK ใช้ `ErrorCode.<file>.<CODE>`
- **ลำดับหา hint:** hint ที่ส่งมากับ error เอง → ตารางของโปรเจค → ตารางในตัว package → ไม่มี hint
- **custom รายครั้งตอน throw exception ของ Nest:** `throw new BadRequestException('Coupon has expired', { code: AppErrorCode.COUPON_EXPIRED, howToFix: '…' })` ใส่ได้ `code` `hint` `detail` `howToFix` `category` `level` `target` (ช่องที่ไม่ใส่มาจากตาราง) แล้วได้ log 1 บรรทัด body ที่ client ได้ยังมี `error: 'Bad Request'` เหมือนเดิม · throw โดยไม่ใส่ช่องเหล่านี้ไม่มี log เหมือนเดิม · filter ของแอปที่ตอบเองโดยไม่เรียก `super.catch()` ต้อง log เอง · TypeScript ฟ้องว่า `'howToFix' does not exist in type 'HttpExceptionOptions'`: แอปไม่ได้ import SDK ที่ไหนเลย (ใช้ `NODE_OPTIONS`) และ catalog สร้างก่อน 0.5.2 ให้เพิ่ม `import type {} from 'skilllane-monitoring'` ในไฟล์ไหนก็ได้ (ไม่มีผลตอนรัน)
- **code เป็นตัวเลขหรืออยู่ช่องอื่น:** ใส่ `codeOf` เช่น `(err) => err.errorCode`
- **error ที่ไม่มี code** (เช่น `NotFoundException('User not found')`): ใช้ `messageMatch` แล้ว `error.code` ของบรรทัดนั้นจะเป็นชื่อ key แทน `HTTP_404`
- **ทับ code ของตารางในตัว** (เช่น `ORA-00001`): ใส่แค่ `hint` ส่วนที่ไม่ได้ใส่ (`detail`, `howToFix`, category, level) คำอธิบายเฉพาะกรณี และ `error_target` ยังมาจากตารางในตัว

## กฎ และผลเมื่อใส่ผิด

| ช่อง | กฎ | ใส่ผิดแล้ว |
|---|---|---|
| `hint` | ≤ 30 ตัวอักษร (≤ 40 เมื่อมี `dependency`) ภาษาอังกฤษ คงที่ ห้ามใส่ค่าที่เปลี่ยน (ใช้จัดกลุ่ม error) | ว่าง = ข้ามรายการ · ยาวเกิน = ตัดแล้วต่อ `…` |
| `detail` | ≤ 200 ตัวอักษร เกิดอะไรขึ้น (สาเหตุที่น่าจะเป็น) | ยาวเกิน = ตัดแล้วต่อ `…` |
| `howToFix` | ≤ 200 ตัวอักษร ต้องทำอะไร | ยาวเกิน = ตัดแล้วต่อ `…` |
| `category` | `bug` · `input` · `data` · `dependency` · `config` | ค่าอื่น = ไม่ใช้ช่องนี้ |
| `level` | `warn` (ความผิดฝั่งผู้เรียก) หรือ `error` · ไม่ใส่: error ที่แอปตอบ 4xx (`AppError` `status`, exception ของ Nest) เป็น warn · request ที่ตอบ 5xx เป็น error เสมอ | ค่าอื่น = ไม่ใช้ช่องนี้ |
| `dependency` | `redis` · `oracle` · `kafka` · `rabbitmq` · `smtp` · `http` · `s3` · `google` | ค่าอื่น = ไม่ใช้ช่องนี้ |
| `messageMatch` | RegExp | ไม่ใช่ RegExp = ไม่ใช้ช่องนี้ |
| key | `[A-Z0-9_.-]+` | ใช้ได้ แค่เตือนใน `errors check` |
| ทุกช่อง | ห้ามใส่ข้อมูลส่วนบุคคล | ตรวจอัตโนมัติไม่ได้ |

ใส่ผิดแล้ว**แอปไม่ล้ม**: ตอน start มี warn 1 บรรทัด `custom error catalog: N entries adjusted` พร้อมรายการที่ปรับ
ไฟล์ที่ไม่มี `errors.catalog` = ตาราง 0 code + warn บอกรูปแบบที่ต้องการ · ไฟล์ที่ throw ตอนโหลด = `failed to load` พร้อมเหตุผล ใช้ตารางในตัวต่อไป

## ตรวจก่อน deploy

```sh
pnpm skilllane-monitoring errors check     # exit 1 เมื่อผิดกฎ ใช้ใน CI ได้
```

ตรวจกฎแบบเข้มงวด และเตือน code ที่โค้ดใน `src/` ใช้ (`errorCode`, `code:` ใน logger) แต่ไม่มีในตาราง
ไฟล์ `.ts` ถูกแปลงด้วย `typescript` ของโปรเจคเอง

## ตำแหน่งไฟล์ และ `SKILLLANE_MONITORING_ERRORS_FILE_PATH`

ตำแหน่งมาตรฐาน `src/skilllane-monitoring/errors.ts` ไม่ต้องตั้งค่า SDK หาจากโฟลเดอร์ของไฟล์ที่รันแอป (`dist/skilllane-monitoring/errors.js` หรือ `dist/config/skilllane-monitoring.js`)
ที่อื่นใต้ `src/` ให้ชี้ด้วย env:

```sh
SKILLLANE_MONITORING_ERRORS_FILE_PATH=src/common/config/monitoring-errors.ts
```

- ใส่ path ของไฟล์ต้นฉบับได้: SDK ลอง `dist/<path ใต้ src>.js` แล้ว `dist/src/<path ใต้ src>.js` แล้วจึงไฟล์ `.ts` เอง (ts-node / tsx โหลดได้)
- path สัมพัทธ์นับจากโฟลเดอร์ของแอป (ที่มี `package.json` ใกล้ไฟล์ที่รันที่สุด) ก่อน แล้วค่อยโฟลเดอร์ที่สั่งรัน ใช้ได้แม้สั่ง `node packages/app/dist/main.js` จาก root ของ monorepo
- หรือใส่ path ของไฟล์ `.js` ที่ build แล้วตรง ๆ เช่น `/app/dist/common/config/monitoring-errors.js`

ตอน start มีบรรทัดบอกเสมอ (logger `skilllane-monitoring`):

| บรรทัด | ความหมาย |
|---|---|
| info `custom error catalog: 26 codes from src/…/x.ts (/app/dist/…/x.js)` | ใช้ไฟล์นี้ |
| info `custom error catalog: not found` (`reason` = path ที่ลองหา) | ไม่มีไฟล์ ใช้ตารางในตัวอย่างเดียว |
| warn `custom error catalog: failed to load <path>` | โหลดไม่ได้ (`reason` บอกเหตุผล) |
| warn `custom error catalog: N entries adjusted` | ใส่ผิดกฎ (`reason` บอกรายการ) |
| warn `custom error catalog: more than one file found; the first is used` | มีไฟล์ทั้งสองตำแหน่งมาตรฐาน |

`LOGGING_ENGINE=legacy` = ไม่โหลด

## ข้อจำกัด

- ไฟล์ต้อง build เป็น CommonJS (ค่าปกติของ NestJS) ไฟล์แบบ ES module โหลดไม่ได้ (`failed to load` พร้อม `ERR_REQUIRE_ESM`)
- `outDir` ของ tsconfig ที่ไม่ใช่ `dist` ให้ตั้ง `SKILLLANE_MONITORING_ERRORS_FILE_PATH` เป็น path ของไฟล์ `.js` ที่ build แล้ว
- ไฟล์ต้องอยู่ใต้ `src/` และอยู่ใน `include` ของ tsconfig ไม่อย่างนั้นไม่มีไฟล์ `.js` ให้โหลด
- ยังกำหนดคำอธิบายเฉพาะกรณี (`explain`) และ adapter ของโปรเจคจากตารางนี้ไม่ได้
- โหลดครั้งเดียวตอน start แก้ไฟล์แล้วต้อง build และ restart แอป

## ถอดออก

```sh
pnpm skilllane-monitoring uninstall          # ถามยืนยันก่อน · --yes ข้ามคำถาม · --force ถอดแม้ยังมี import อื่น
```

1. แสดงแผน: ไฟล์ตารางและ `README.md` ที่ `init` สร้าง (README ที่ทีมเขียนเองไม่ลบ) ลบโฟลเดอร์เมื่อว่างแล้ว · `log.ts` ที่ `init` สร้างไม่ลบ แต่เขียนใหม่เป็น `export const log = new Logger()` ของ Nest โค้ดที่ import ไฟล์นี้จึงยัง build ผ่าน (แต่บรรทัดไม่มีชื่อ class แล้ว) · บรรทัด `import 'skilllane-monitoring/register'` ใน `src/` ที่จะลบ (เช่น `main.ts`, `instrumentation.ts`) · import / require อื่นของ SDK ที่ต้องแก้เอง · การอ้างถึงนอก `src/` (`NODE_OPTIONS` ใน `Dockerfile`, script, `.env`) ที่ไม่แก้ให้
2. หยุด (exit 1) ถ้ายังมี import อื่นของ SDK เพราะ build จะพังหลังถอด เว้นแต่ `--force`
3. ถาม `Continue? (y/N)` ตอบอย่างอื่น = ไม่แก้อะไร
4. ลบไฟล์และบรรทัด แล้วรัน `pnpm remove skilllane-monitoring` (เลือก pnpm / yarn / npm ตาม lockfile)

pnpm และ npm ไม่ให้ package ลบไฟล์เองตอนถูกถอด ถ้าถอดด้วย `pnpm remove skilllane-monitoring` ตรง ๆ โฟลเดอร์ `src/skilllane-monitoring/` จะค้าง และ build พังเพราะ `errors.ts` กับ `log.ts` import จาก SDK ให้ใช้ `uninstall` หรือลบ `errors.ts` และแก้ `log.ts` เป็น `new Logger()` ของ Nest เอง
