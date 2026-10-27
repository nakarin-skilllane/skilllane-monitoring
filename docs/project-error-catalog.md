# ตาราง error ของโปรเจค (project error catalog)

ตั้งแต่ `skilllane-monitoring` 0.4.0 แอปสอน logger ให้รู้จัก error code ของตัวเองได้จากไฟล์เดียว
hint, คำอธิบาย, ใครต้องแก้ และระดับของ error เหล่านั้นจะขึ้นใน log และหน้า monitor โดยไม่ต้องแก้วิธี throw ที่มีอยู่

## เริ่มใช้

```sh
pnpm skilllane-monitoring errors init
```

สร้าง `src/skilllane-monitoring/` พร้อม 2 ไฟล์:

- `errors.ts` ตาราง error ร่างจากของที่แอปใช้อยู่จริง (`errorCode` ของ exception, ข้อความ `throw new …Exception('…')` ที่ซ้ำหลายที่, `code` ใน `this.logger.*`) ทีมเติม `hint` เอง
- `README.md` วิธีใช้ กฎ ข้อจำกัด และวิธีตั้ง path (เนื้อหาเหมือนเอกสารนี้ อ่านได้โดยไม่ต้องเปิดที่อื่น)

ไม่เขียนทับไฟล์ที่มีอยู่ · `--path src/common/config/monitoring-errors.ts` วางที่อื่นได้ (ดู "ตำแหน่งไฟล์") · `--min-repeat 10` เปลี่ยนเกณฑ์ข้อความซ้ำ

## ตัวอย่างไฟล์

```ts
// src/skilllane-monitoring/errors.ts
export default {
  errors: {
    // code ของแอปอยู่ช่องไหนของ error (ไม่ใส่ = err.code และ errorCode ของ exception ของ Nest)
    codeOf: (err: any) => err.errorCode,
    catalog: {
      STUDENT_LEAVE_SCHOOL: { hint: 'Student left school', hintDetail: 'The student is retired; check the roster.', category: 'input', level: 'warn' },
      1701: { hint: 'Role title exists', hintDetail: 'Another role of the school has this title.', category: 'input' },
      'ORA-00001': { hint: 'Duplicate exam code' },                                             // ทับ hint ของตารางในตัว
      USER_NOT_FOUND: { messageMatch: /^User not found$/, hint: 'User not found', category: 'input', level: 'warn' },  // error ที่ไม่มี code
    },
  },
}
```

ไฟล์นี้ไม่มีใคร import และไม่ import อะไรจาก SDK: SDK หาและโหลดเองตอนแอป start

## ทำงานอย่างไร

- **โค้ดเดิมไม่ต้องแก้** error ที่มี code ตรงกับตารางได้ hint อัตโนมัติ ทั้งที่ throw (`throw new StudentRetiredException()`) และที่บันทึกเอง (`this.logger.error('Import failed', { code: 'E1001' })`)
- **ลำดับหา hint:** hint ที่ส่งมากับ error เอง → ตารางของโปรเจค → ตารางในตัว package → ไม่มี hint
- **code เป็นตัวเลขหรืออยู่ช่องอื่น:** ใส่ `codeOf` เช่น `(err) => err.errorCode`
- **error ที่ไม่มี code** (เช่น `NotFoundException('User not found')`): ใช้ `messageMatch` แล้ว `error.code` ของบรรทัดนั้นจะเป็นชื่อ key แทน `HTTP_404`
- **ทับ code ของตารางในตัว** (เช่น `ORA-00001`): ใส่แค่ `hint` ส่วนที่ไม่ได้ใส่ (คำอธิบาย, category, level) และ `error.fix` / `error_target` ยังมาจากตารางในตัว

## กฎ และผลเมื่อใส่ผิด

| ช่อง | กฎ | ใส่ผิดแล้ว |
|---|---|---|
| `hint` | ≤ 30 ตัวอักษร (≤ 40 เมื่อมี `dependency`) ภาษาอังกฤษ คงที่ ห้ามใส่ค่าที่เปลี่ยน (ใช้จัดกลุ่ม error) | ว่าง = ข้ามรายการ · ยาวเกิน = ตัดแล้วต่อ `…` |
| `hintDetail` | ≤ 200 ตัวอักษร สาเหตุที่น่าจะเป็น + สิ่งที่ควรเช็ก | ยาวเกิน = ตัดแล้วต่อ `…` |
| `category` | `bug` · `input` · `data` · `dependency` · `config` | ค่าอื่น = ไม่ใช้ช่องนี้ |
| `level` | `warn` (ความผิดฝั่งผู้เรียก) หรือ `error` · request ที่ตอบ 5xx เป็น error เสมอ | ค่าอื่น = ไม่ใช้ช่องนี้ |
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
- ยังกำหนด `error.fix` / `explain` และ adapter ของโปรเจคจากตารางนี้ไม่ได้
- โหลดครั้งเดียวตอน start แก้ไฟล์แล้วต้อง build และ restart แอป

## ถอดออก

```sh
pnpm skilllane-monitoring uninstall          # ถามยืนยันก่อน · --yes ข้ามคำถาม · --force ถอดแม้ยังมี import อื่น
```

1. แสดงแผน: ไฟล์ตารางและ `README.md` ที่ `init` สร้าง (README ที่ทีมเขียนเองไม่ลบ) ลบโฟลเดอร์เมื่อว่างแล้ว · บรรทัด `import 'skilllane-monitoring/register'` ใน `src/` ที่จะลบ (เช่น `main.ts`, `instrumentation.ts`) · import / require อื่นของ SDK ที่ต้องแก้เอง · การอ้างถึงนอก `src/` (`NODE_OPTIONS` ใน `Dockerfile`, script, `.env`) ที่ไม่แก้ให้
2. หยุด (exit 1) ถ้ายังมี import อื่นของ SDK เพราะ build จะพังหลังถอด เว้นแต่ `--force`
3. ถาม `Continue? (y/N)` ตอบอย่างอื่น = ไม่แก้อะไร
4. ลบไฟล์และบรรทัด แล้วรัน `pnpm remove skilllane-monitoring` (เลือก pnpm / yarn / npm ตาม lockfile)

pnpm และ npm ไม่ให้ package ลบไฟล์เองตอนถูกถอด ถ้าถอดด้วย `pnpm remove skilllane-monitoring` ตรง ๆ โฟลเดอร์ `src/skilllane-monitoring/` จะค้าง (ไม่ทำให้ build พัง เพราะไม่มีใคร import) ลบเองได้
