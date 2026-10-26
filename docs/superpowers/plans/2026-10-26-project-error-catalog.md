# Project Error Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้แอปมีตาราง error ของตัวเองในไฟล์เดียว (`src/skilllane-monitoring/errors.ts`) ที่ SDK โหลดเองตอน start แล้วใช้หา hint ก่อนตารางในตัว พร้อมคำสั่ง `skilllane-monitoring errors init|check`

**Architecture:** โมดูลใหม่ 2 ตัวใน `src/errors/`: `project-catalog.ts` (ตรวจ/ปรับรายการ เก็บสถานะ ให้ `codeOf`) และ `catalog-loader.ts` (หาไฟล์ โหลด เขียนบรรทัดสรุป) `hints.ts` ถามตารางของโปรเจคก่อนตารางในตัว `error-serializer.ts` ใช้ `codeOf` ก่อน adapter `register.ts` เรียก loader ครั้งเดียว CLI อยู่ใน `src/cli/` เป็น bin ของ package

**Tech Stack:** TypeScript (CommonJS, target es2021), vitest 3, Node ≥ 20, `typescript` ของโปรเจคปลายทาง (เฉพาะ `errors check` กับไฟล์ `.ts`)

**Spec:** `docs/superpowers/specs/2026-10-26-project-error-catalog-design.md`

## Global Constraints

- ทำงานใน `packages/monitoring/` ของ repo `skilllane-monitoring` · คำสั่งทั้งหมดรันจากโฟลเดอร์นั้น
- **repo มีงานของคนอื่นที่ยังไม่ commit** (ตอนเขียนแผน: `README.md`, `src/capture/{mask,processor}.ts`, `src/contract/mask/*`, `src/logger/{pretty,redact}.ts`, `test/{explain,pretty,redact,where}.test.ts`) ห้ามแก้หรือ `git add` ไฟล์ใดที่ `git status` แสดงว่าแก้อยู่ก่อนเริ่ม · ทุก commit ใช้ `git add <ไฟล์ของ task>` เท่านั้น (ห้าม `git add -A` / `.`)
- **ก่อน Task 1 วัด baseline:** `pnpm exec vitest run 2>&1 | tail -20` จดชื่อ test ที่ล้มอยู่แล้ว (จากงานค้างข้างบน) ทุกครั้งที่แผนสั่งรันทั้งชุด "ต้องเขียว" หมายถึง**ไม่มี test ล้มเพิ่มจาก baseline**
- ไม่เพิ่ม runtime dependency (`dependencies` ใน package.json ไม่เปลี่ยน)
- แอปต้องไม่ล้มเพราะตารางของโปรเจคในทุกกรณี (ไฟล์หาย, ผิดรูปแบบ, `codeOf` throw)
- กฎ: `hint` ≤ 30 ตัว (≤ 40 เมื่อมี `dependency`) · `hintDetail` ≤ 200 ตัว · `category` ∈ `bug|input|data|dependency|config` · `level` ∈ `warn|error` · ตัดแล้วต่อ `…`
- ตำแหน่งมาตรฐาน `src/skilllane-monitoring/errors.ts` · env override `LOG_CONFIG_FILE` · `LOGGING_ENGINE=legacy` = ไม่โหลด
- เวอร์ชันใหม่ `0.3.0` (เพิ่มความสามารถ ไม่ breaking)

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| Create `src/errors/project-catalog.ts` | type ของ config, `normalizeCatalog` (ตรวจ + ตัด + issues), สถานะ `setProjectCatalog` / `getProjectCatalog`, `projectCodeOf` |
| Create `src/errors/catalog-loader.ts` | `catalogCandidates`, `loadCatalogModule`, `startProjectCatalog` (โหลด + เขียนบรรทัดสรุป) |
| Modify `src/errors/hints.ts` | index แยก builtin / project · `findPattern` ถาม project ก่อน |
| Modify `src/errors/error-serializer.ts` | `code` = `projectCodeOf(error) ?? extracted.code` |
| Modify `src/errors/index.ts` | export โมดูลใหม่ |
| Modify `src/otel/register.ts` | เรียก `startProjectCatalog` หลัง `loadDotenv()` เมื่อไม่ใช่ legacy |
| Create `src/cli/index.ts` | bin: parse argv → `init` / `check` |
| Create `src/cli/scan.ts` | สแกน `src/` หา errorCode, ข้อความ throw ที่ซ้ำ, code ใน logger |
| Create `src/cli/template.ts` | สร้างเนื้อหาไฟล์ `errors.ts` |
| Create `src/cli/errors-init.ts`, `src/cli/errors-check.ts` | คำสั่งทั้งสอง (คืน exit code ไม่เรียก `process.exit` เอง) |
| Modify `package.json` | `bin`, `version` |
| Modify `README.md` | **ห้ามแก้** (มีงานค้าง) — เขียนคู่มือใน `docs/project-error-catalog.md` แทน |
| Tests | `test/project-catalog.test.ts`, `test/project-hints.test.ts`, `test/catalog-loader.test.ts`, `test/cli-errors.test.ts` |

---

### Task 1: `project-catalog.ts` — ตรวจและปรับรายการ

**Files:**
- Create: `src/errors/project-catalog.ts`
- Test: `test/project-catalog.test.ts`

**Interfaces:**
- Consumes: `ErrorPattern`, `ErrorCategory` จาก `src/errors/patterns/types.ts`; `DependencyType` จาก `src/types.ts`
- Produces:
  - `interface ProjectCatalogEntry { hint: string; hintDetail?: string; category?: ErrorCategory; level?: 'warn' | 'error'; dependency?: DependencyType; messageMatch?: RegExp }`
  - `interface MonitoringConfig { errors?: { codeOf?: (error: any) => unknown; catalog?: Record<string, ProjectCatalogEntry> } }`
  - `interface CatalogIssue { severity: 'error' | 'warning'; code: string; message: string }`
  - `interface NormalizedCatalog { patterns: ErrorPattern[]; codeOf?: (error: any) => unknown; issues: CatalogIssue[] }`
  - `function normalizeCatalog(raw: unknown): NormalizedCatalog`
  - `function setProjectCatalog(catalog: NormalizedCatalog | undefined): void`
  - `function getProjectCatalog(): NormalizedCatalog | undefined`
  - `function projectCodeOf(error: unknown): string | undefined`

- [ ] **Step 1: Write the failing test**

```ts
// test/project-catalog.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import {
  normalizeCatalog,
  projectCodeOf,
  setProjectCatalog,
} from '../src/errors/project-catalog'

afterEach(() => setProjectCatalog(undefined))

describe('normalizeCatalog', () => {
  it('turns catalog entries into patterns keyed by code, numbers included', () => {
    const c = normalizeCatalog({
      default: {
        errors: {
          catalog: {
            STUDENT_LEAVE_SCHOOL: { hint: 'Student left school', hintDetail: 'Left.', category: 'input', level: 'warn' },
            1701: { hint: 'Role title exists' },
          },
        },
      },
    })
    expect(c.issues).toEqual([])
    expect(c.patterns).toEqual([
      { key: '1701', hint: 'Role title exists', hintDetail: '' },
      { key: 'STUDENT_LEAVE_SCHOOL', hint: 'Student left school', hintDetail: 'Left.', category: 'input', level: 'warn' },
    ])
  })

  it('accepts the config without a default export wrapper', () => {
    const c = normalizeCatalog({ errors: { catalog: { A: { hint: 'A' } } } })
    expect(c.patterns.map((p) => p.key)).toEqual(['A'])
  })

  it('keeps messageMatch entries with their key as the code', () => {
    const c = normalizeCatalog({ errors: { catalog: { USER_NOT_FOUND: { messageMatch: /^User not found$/, hint: 'User not found' } } } })
    expect(c.patterns[0]).toMatchObject({ key: 'USER_NOT_FOUND', messageMatch: /^User not found$/ })
  })

  it('cuts long hint / hintDetail and drops unknown fields with an issue each', () => {
    const c = normalizeCatalog({
      errors: {
        catalog: {
          LONG: { hint: 'x'.repeat(31), hintDetail: 'y'.repeat(201), category: 'oops', level: 'fatal', messageMatch: 'not a regexp' },
          DEP: { hint: 'd'.repeat(40), dependency: 'redis' },
          BAD_DEP: { hint: 'ok', dependency: 'mysql' },
        },
      },
    })
    const long = c.patterns.find((p) => p.key === 'LONG')!
    expect(long.hint).toBe(`${'x'.repeat(30)}…`)
    expect(long.hintDetail).toBe(`${'y'.repeat(200)}…`)
    expect(long.category).toBeUndefined()
    expect(long.level).toBeUndefined()
    expect(long.messageMatch).toBeUndefined()
    expect(c.patterns.find((p) => p.key === 'DEP')!.hint).toBe('d'.repeat(40))
    expect(c.patterns.find((p) => p.key === 'BAD_DEP')!.dependency).toBeUndefined()
    expect(c.issues.filter((i) => i.severity === 'error').map((i) => i.code)).toEqual([
      'BAD_DEP', 'LONG', 'LONG', 'LONG', 'LONG', 'LONG',
    ])
  })

  it('skips entries without a hint and warns about code names', () => {
    const c = normalizeCatalog({ errors: { catalog: { EMPTY: { hint: '' }, 'bad code': { hint: 'Fine' } } } })
    expect(c.patterns.map((p) => p.key)).toEqual(['bad code'])
    expect(c.issues).toEqual([
      { severity: 'warning', code: 'bad code', message: 'code should match [A-Z0-9_.-]+' },
      { severity: 'error', code: 'EMPTY', message: 'hint is required; entry skipped' },
    ])
  })

  it('reports a file whose export has no errors.catalog', () => {
    const c = normalizeCatalog({ something: 1 })
    expect(c.patterns).toEqual([])
    expect(c.issues).toEqual([{ severity: 'error', code: '*', message: 'export default { errors: { catalog } } expected' }])
  })
})

describe('projectCodeOf', () => {
  it('uses codeOf and turns numbers into strings', () => {
    setProjectCatalog(normalizeCatalog({ errors: { codeOf: (e: any) => e.errorCode, catalog: {} } }))
    expect(projectCodeOf({ errorCode: 1701 })).toBe('1701')
    expect(projectCodeOf({ errorCode: 'X' })).toBe('X')
    expect(projectCodeOf({})).toBeUndefined()
  })

  it('ignores a codeOf that throws or returns another type', () => {
    setProjectCatalog(normalizeCatalog({ errors: { codeOf: () => { throw new Error('boom') }, catalog: {} } }))
    expect(projectCodeOf({})).toBeUndefined()
    setProjectCatalog(normalizeCatalog({ errors: { codeOf: () => ({}), catalog: {} } }))
    expect(projectCodeOf({})).toBeUndefined()
  })

  it('returns undefined when no catalog is set', () => {
    expect(projectCodeOf({ errorCode: 'X' })).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/project-catalog.test.ts`
Expected: FAIL — `Failed to resolve import "../src/errors/project-catalog"`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/errors/project-catalog.ts
import type { DependencyType } from '../types'
import type { ErrorCategory, ErrorPattern } from './patterns/types'

/** One code of the app's own table (src/skilllane-monitoring/errors.ts). */
export interface ProjectCatalogEntry {
  hint: string
  hintDetail?: string
  category?: ErrorCategory
  level?: 'warn' | 'error'
  dependency?: DependencyType
  /** For errors that carry no code: the key becomes their `error.code`. */
  messageMatch?: RegExp
}

/** The default export of the app's file. */
export interface MonitoringConfig {
  errors?: {
    /** Reads the app's code off an error; unset = the SDK adapters' code. */
    codeOf?: (error: any) => unknown
    catalog?: Record<string, ProjectCatalogEntry>
  }
}

export interface CatalogIssue {
  /** error = the entry or a field was cut / dropped; warning = style only. */
  severity: 'error' | 'warning'
  code: string
  message: string
}

export interface NormalizedCatalog {
  patterns: ErrorPattern[]
  codeOf?: (error: any) => unknown
  issues: CatalogIssue[]
}

const CATEGORIES: readonly ErrorCategory[] = ['bug', 'input', 'data', 'dependency', 'config']
const DEPENDENCIES: readonly DependencyType[] = ['redis', 'oracle', 'kafka', 'rabbitmq', 'smtp', 'http', 's3', 'google']
const CODE_SHAPE = /^[A-Z0-9_.-]+$/
const HINT_MAX = 30
const HINT_MAX_DEPENDENCY = 40
const DETAIL_MAX = 200

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * Checks and trims the app's table. Never throws: a bad entry or field is
 * dropped or cut, and each change is reported as an issue.
 */
export function normalizeCatalog(raw: unknown): NormalizedCatalog {
  const config = ((raw as any)?.default ?? raw) as MonitoringConfig
  const catalog = config?.errors?.catalog
  if (!catalog || typeof catalog !== 'object') {
    return { patterns: [], issues: [{ severity: 'error', code: '*', message: 'export default { errors: { catalog } } expected' }] }
  }
  const issues: CatalogIssue[] = []
  const patterns: ErrorPattern[] = []
  for (const code of Object.keys(catalog).sort()) {
    const entry = (catalog as Record<string, any>)[code] ?? {}
    const problem = (message: string) => issues.push({ severity: 'error', code, message })
    if (!CODE_SHAPE.test(code)) issues.push({ severity: 'warning', code, message: 'code should match [A-Z0-9_.-]+' })
    if (typeof entry.hint !== 'string' || !entry.hint.trim()) {
      problem('hint is required; entry skipped')
      continue
    }
    const pattern: ErrorPattern = { key: code, hint: '', hintDetail: '' }
    if (entry.dependency !== undefined) {
      if (DEPENDENCIES.includes(entry.dependency)) pattern.dependency = entry.dependency
      else problem(`dependency "${entry.dependency}" is not one of ${DEPENDENCIES.join('|')}; ignored`)
    }
    const hintMax = pattern.dependency ? HINT_MAX_DEPENDENCY : HINT_MAX
    if (entry.hint.length > hintMax) problem(`hint is longer than ${hintMax} characters; cut`)
    pattern.hint = cut(entry.hint, hintMax)
    if (typeof entry.hintDetail === 'string') {
      if (entry.hintDetail.length > DETAIL_MAX) problem(`hintDetail is longer than ${DETAIL_MAX} characters; cut`)
      pattern.hintDetail = cut(entry.hintDetail, DETAIL_MAX)
    }
    if (entry.category !== undefined) {
      if (CATEGORIES.includes(entry.category)) pattern.category = entry.category
      else problem(`category "${entry.category}" is not one of ${CATEGORIES.join('|')}; ignored`)
    }
    if (entry.level !== undefined) {
      if (entry.level === 'warn' || entry.level === 'error') pattern.level = entry.level
      else problem(`level "${entry.level}" is not warn|error; ignored`)
    }
    if (entry.messageMatch !== undefined) {
      if (entry.messageMatch instanceof RegExp) pattern.messageMatch = entry.messageMatch
      else problem('messageMatch is not a RegExp; ignored')
    }
    patterns.push(pattern)
  }
  const codeOf = config.errors?.codeOf
  if (codeOf !== undefined && typeof codeOf !== 'function') {
    issues.push({ severity: 'error', code: '*', message: 'codeOf is not a function; ignored' })
  }
  issues.sort((a, b) => a.code.localeCompare(b.code) || a.severity.localeCompare(b.severity))
  return { patterns, codeOf: typeof codeOf === 'function' ? codeOf : undefined, issues }
}

let current: NormalizedCatalog | undefined

export function setProjectCatalog(catalog: NormalizedCatalog | undefined): void {
  current = catalog
}

export function getProjectCatalog(): NormalizedCatalog | undefined {
  return current
}

/** The app's code for an error, from its `codeOf`; never throws. */
export function projectCodeOf(error: unknown): string | undefined {
  const codeOf = current?.codeOf
  if (!codeOf) return undefined
  try {
    const value = codeOf(error)
    if (typeof value === 'string' && value) return value
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  } catch {
    // a broken codeOf must not lose the log line
  }
  return undefined
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/project-catalog.test.ts`
Expected: PASS (11 tests) · ถ้าลำดับ issues ใน test "cuts long hint" ไม่ตรง ให้ดูลำดับที่ได้จริงแล้วแก้ที่ implementation ให้เรียงตาม `code` แล้ว `severity` (ห้ามแก้ test ให้ผ่านเอง)

- [ ] **Step 5: Commit**

```bash
git add src/errors/project-catalog.ts test/project-catalog.test.ts
git commit -m "feat(errors): normalize an app's own error catalog"
```

---

### Task 2: ใช้ตารางของโปรเจคในการหา code และ hint

**Files:**
- Modify: `src/errors/hints.ts` (ส่วน index และ `findPattern`)
- Modify: `src/errors/error-serializer.ts:87-118` (`serializeError`)
- Modify: `src/errors/index.ts`
- Test: `test/project-hints.test.ts`

**Interfaces:**
- Consumes: `getProjectCatalog`, `projectCodeOf`, `normalizeCatalog`, `setProjectCatalog` (Task 1)
- Produces: พฤติกรรมของ `lookupHint` / `serializeError` เปลี่ยน signature เดิม · `src/errors/index.ts` export `./project-catalog`

- [ ] **Step 1: Write the failing test**

```ts
// test/project-hints.test.ts
import { BadRequestException, HttpException } from '@nestjs/common'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeCatalog, setProjectCatalog } from '../src/errors/project-catalog'
import { captureLogger, lastLine } from './helpers'

class BaseException extends HttpException {
  constructor(message: string, status: number, readonly errorCode: string | number) {
    super(message, status)
  }
}

function useCatalog(config: unknown) {
  setProjectCatalog(normalizeCatalog(config))
}

afterEach(() => setProjectCatalog(undefined))

describe('project error catalog in log lines', () => {
  it('gives an app error code its hint, detail, category and level', () => {
    useCatalog({ errors: { catalog: { STUDENT_LEAVE_SCHOOL: { hint: 'Student left school', hintDetail: 'Check the roster.', category: 'input', level: 'warn' } } } })
    const { logger, lines } = captureLogger()
    logger.error('Request failed', new BaseException('Student left', 409, 'STUDENT_LEAVE_SCHOOL'))
    expect(lastLine(lines)).toMatchObject({
      'error.code': 'STUDENT_LEAVE_SCHOOL',
      'error.hint': 'Student left school',
      'error.hint_detail': 'Check the roster.',
      'labels.error_category': 'input',
      'log.level': 'warn',
    })
  })

  it('reads numeric codes through codeOf', () => {
    useCatalog({ errors: { codeOf: (e: any) => e.errorCode, catalog: { 1701: { hint: 'Role title exists' } } } })
    const { logger, lines } = captureLogger()
    logger.error('Request failed', new BaseException('dup', 409, 1701))
    expect(lastLine(lines)).toMatchObject({ 'error.code': '1701', 'error.hint': 'Role title exists' })
  })

  it('works for logger calls with only a code', () => {
    useCatalog({ errors: { catalog: { E1001: { hint: 'Score out of range' } } } })
    const { logger, lines } = captureLogger()
    logger.error('Import failed', { code: 'E1001' })
    expect(lastLine(lines)).toMatchObject({ 'error.code': 'E1001', 'error.hint': 'Score out of range' })
  })

  it('matches messages of errors without a code and names them with the key', () => {
    useCatalog({ errors: { catalog: { USER_NOT_FOUND: { messageMatch: /^User not found$/, hint: 'User not found' } } } })
    const { logger, lines } = captureLogger()
    logger.error('Request failed', new Error('User not found'))
    expect(lastLine(lines)).toMatchObject({ 'error.code': 'USER_NOT_FOUND', 'error.hint': 'User not found' })
  })

  it('overrides a built-in hint for the same code', () => {
    useCatalog({ errors: { catalog: { 'ORA-00001': { hint: 'Duplicate exam code' } } } })
    const { logger, lines } = captureLogger()
    logger.error('Insert failed', Object.assign(new Error('ORA-00001: unique constraint (APP.UQ) violated'), { errorNum: 1 }))
    expect(lastLine(lines)['error.hint']).toBe('Duplicate exam code')
  })

  it('keeps the developer hint above the app table', () => {
    useCatalog({ errors: { catalog: { E1001: { hint: 'From the table' } } } })
    const { logger, lines } = captureLogger()
    logger.error('Import failed', { code: 'E1001', hint: 'From the call' })
    expect(lastLine(lines)['error.hint']).toBe('From the call')
  })

  it('falls back to the built-in table when the app table has no match', () => {
    useCatalog({ errors: { catalog: { OTHER: { hint: 'Other' } } } })
    const { logger, lines } = captureLogger()
    logger.error('Bad', new BadRequestException('bad'))
    expect(lastLine(lines)['error.hint']).not.toBe('Other')
  })
})
```

กฎ "`level: 'warn'` ยังกลับเป็น error เมื่อ request ตอบ 5xx" ใช้กลไกเดิมใน `src/logger/held-lines.ts` ซึ่งมี test ของตัวเองอยู่แล้ว (`test/app-logger.test.ts`) task นี้ไม่ต้องเพิ่ม เพราะรายการจากตารางของโปรเจคผ่านทาง `level` ของ pattern เหมือนตารางในตัว

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/project-hints.test.ts`
Expected: FAIL — `error.hint` เป็น `undefined` (ยังไม่ได้ต่อตารางของโปรเจค)
ถ้า test "overrides a built-in hint" ให้ `error.code` ไม่ใช่ `ORA-00001` ให้ดูวิธีที่ `test/patterns-libraries.test.ts` สร้าง error ของ Oracle แล้วสร้างแบบเดียวกัน

- [ ] **Step 3: Write minimal implementation**

ใน `src/errors/hints.ts` แทนส่วน index เดิม (`const byKey = …` ถึงลูป `for (const pattern of ALL_PATTERNS)`) และ `findPattern` ด้วย:

```ts
import { getProjectCatalog, type NormalizedCatalog } from './project-catalog'

interface PatternIndex {
  byKey: Map<string, ErrorPattern>
  byMessage: ErrorPattern[]
}

/** Built-in patterns are scoped by dependency; an app's code matches whatever the dependency. */
function indexPatterns(patterns: readonly ErrorPattern[], scoped: boolean): PatternIndex {
  const index: PatternIndex = { byKey: new Map(), byMessage: [] }
  for (const pattern of patterns) {
    index.byKey.set(scopedKey(scoped ? pattern.dependency : undefined, pattern.key), pattern)
    if (pattern.messageMatch) index.byMessage.push(pattern)
  }
  return index
}

const BUILTIN = indexPatterns(ALL_PATTERNS, true)

let projectIndex: { source: NormalizedCatalog; index: PatternIndex } | undefined

function projectPatterns(): PatternIndex | undefined {
  const catalog = getProjectCatalog()
  if (!catalog) return undefined
  if (projectIndex?.source !== catalog) {
    projectIndex = { source: catalog, index: indexPatterns(catalog.patterns, false) }
  }
  return projectIndex.index
}

function findIn(index: PatternIndex, query: HintQuery): ErrorPattern | undefined {
  const { code, dependency, message } = query
  if (code) {
    const scoped = dependency ? index.byKey.get(scopedKey(dependency, code)) : undefined
    const found = scoped ?? index.byKey.get(scopedKey(undefined, code))
    if (found) return found
  }
  if (!message) return undefined
  return index.byMessage.find(
    (pattern) =>
      (!pattern.dependency || pattern.dependency === dependency) &&
      pattern.messageMatch!.test(message),
  )
}

/** The app's table first, then the built-in one. */
function findPattern(query: HintQuery): ErrorPattern | undefined {
  const project = projectPatterns()
  return (project && findIn(project, query)) ?? findIn(BUILTIN, query)
}
```

(ถ้า `findPattern` เดิมมีเงื่อนไขเพิ่มจากที่เห็นในบรรทัด 128–140 ให้ย้ายเงื่อนไขนั้นเข้า `findIn` ทั้งหมด ห้ามตัดทิ้ง)

ใน `src/errors/error-serializer.ts` เพิ่ม import และแก้ `code` ใน `serializeError`:

```ts
import { projectCodeOf } from './project-catalog'
// …ใน serializeError:
      code: projectCodeOf(error) ?? extracted.code,
```

ใน `src/errors/index.ts` เพิ่ม:

```ts
export * from './project-catalog'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/project-hints.test.ts && pnpm exec vitest run`
Expected: PASS ทั้งไฟล์ใหม่และ test เดิมทั้งหมด (`pnpm exec vitest run` ต้องเขียวทั้งชุด)

- [ ] **Step 5: Commit**

```bash
git add src/errors/hints.ts src/errors/error-serializer.ts src/errors/index.ts test/project-hints.test.ts
git commit -m "feat(errors): look up an app's own catalog before the built-in table"
```

---

### Task 3: `catalog-loader.ts` — หาไฟล์ โหลด และบรรทัดสรุปตอน start

**Files:**
- Create: `src/errors/catalog-loader.ts`
- Modify: `src/errors/index.ts`
- Modify: `src/otel/register.ts:341` (หลัง `const legacy = …`)
- Test: `test/catalog-loader.test.ts`

**Interfaces:**
- Consumes: `normalizeCatalog`, `setProjectCatalog`, `NormalizedCatalog` (Task 1); `getLogger` จาก `src/logger`
- Produces:
  - `interface CandidateOptions { configFile?: string; entry?: string; cwd: string; tsLoadable?: boolean }`
  - `interface Candidate { path: string; shown: string }` (`shown` = path ที่ผู้ใช้เขียน เช่น `.ts`)
  - `function catalogCandidates(o: CandidateOptions): Candidate[]`
  - `type LoadOutcome = { status: 'not-found'; looked: string[] } | { status: 'failed'; path: string; reason: string } | { status: 'loaded'; path: string; shown: string; catalog: NormalizedCatalog; duplicates: string[] }`
  - `function loadProjectCatalog(o: CandidateOptions): LoadOutcome`
  - `function startProjectCatalog(o?: Partial<CandidateOptions>): LoadOutcome` (ตั้งค่า + เขียนบรรทัดสรุป)

- [ ] **Step 1: Write the failing test**

```ts
// test/catalog-loader.test.ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { catalogCandidates, loadProjectCatalog, startProjectCatalog } from '../src/errors/catalog-loader'
import { getProjectCatalog, setProjectCatalog } from '../src/errors/project-catalog'
import { captureLogger, lastLine } from './helpers'

const CATALOG_JS = `exports.default = { errors: { catalog: { E1: { hint: 'One' }, E2: { hint: 'Two' } } } }\n`

function app(): string {
  const root = mkdtempSync(join(tmpdir(), 'slm-catalog-'))
  writeFileSync(join(root, 'package.json'), '{"name":"app"}')
  mkdirSync(join(root, 'dist'), { recursive: true })
  writeFileSync(join(root, 'dist', 'main.js'), '')
  return root
}

function put(root: string, rel: string, body = CATALOG_JS): void {
  mkdirSync(join(root, rel, '..'), { recursive: true })
  writeFileSync(join(root, rel), body)
}

afterEach(() => setProjectCatalog(undefined))

describe('catalogCandidates', () => {
  it('maps a src .ts path to dist and dist/src', () => {
    const root = app()
    const found = catalogCandidates({ configFile: 'src/common/config/errors.ts', entry: join(root, 'dist/main.js'), cwd: root })
    expect(found.map((c) => c.path)).toEqual([
      join(root, 'dist/common/config/errors.js'),
      join(root, 'dist/src/common/config/errors.js'),
    ])
    expect(found[0].shown).toBe('src/common/config/errors.ts')
  })

  it('tries the .ts file first when the runtime can load it', () => {
    const root = app()
    const found = catalogCandidates({ configFile: 'src/x.ts', entry: join(root, 'dist/main.js'), cwd: root, tsLoadable: true })
    expect(found[0].path).toBe(join(root, 'src/x.ts'))
  })

  it('uses the two standard places next to the entry file', () => {
    const root = app()
    expect(catalogCandidates({ entry: join(root, 'dist/main.js'), cwd: root }).map((c) => c.path)).toEqual([
      join(root, 'dist/skilllane-monitoring/errors.js'),
      join(root, 'dist/config/skilllane-monitoring.js'),
    ])
  })
})

describe('loadProjectCatalog', () => {
  it('loads the standard file', () => {
    const root = app()
    put(root, 'dist/skilllane-monitoring/errors.js')
    const out = loadProjectCatalog({ entry: join(root, 'dist/main.js'), cwd: root })
    expect(out.status).toBe('loaded')
    if (out.status === 'loaded') expect(out.catalog.patterns.map((p) => p.key)).toEqual(['E1', 'E2'])
  })

  it('loads LOG_CONFIG_FILE given as a src .ts path from the dist/src layout', () => {
    const root = app()
    put(root, 'dist/src/common/config/monitoring-errors.js')
    const out = loadProjectCatalog({ configFile: 'src/common/config/monitoring-errors.ts', entry: join(root, 'dist/main.js'), cwd: root })
    expect(out).toMatchObject({ status: 'loaded', shown: 'src/common/config/monitoring-errors.ts' })
  })

  it('reports the second standard file as a duplicate', () => {
    const root = app()
    put(root, 'dist/skilllane-monitoring/errors.js')
    put(root, 'dist/config/skilllane-monitoring.js')
    const out = loadProjectCatalog({ entry: join(root, 'dist/main.js'), cwd: root })
    expect(out).toMatchObject({ status: 'loaded', duplicates: [join(root, 'dist/config/skilllane-monitoring.js')] })
  })

  it('says where it looked when nothing is there', () => {
    const root = app()
    const out = loadProjectCatalog({ entry: join(root, 'dist/main.js'), cwd: root })
    expect(out).toEqual({ status: 'not-found', looked: [join(root, 'dist/skilllane-monitoring/errors.js'), join(root, 'dist/config/skilllane-monitoring.js')] })
  })

  it('fails without throwing when the file throws', () => {
    const root = app()
    put(root, 'dist/skilllane-monitoring/errors.js', 'throw new Error("broken file")')
    const out = loadProjectCatalog({ entry: join(root, 'dist/main.js'), cwd: root })
    expect(out).toMatchObject({ status: 'failed', reason: 'broken file' })
  })
})

describe('startProjectCatalog', () => {
  it('sets the catalog and writes one summary line', () => {
    const root = app()
    put(root, 'dist/skilllane-monitoring/errors.js')
    const { lines } = captureLogger()
    startProjectCatalog({ entry: join(root, 'dist/main.js'), cwd: root })
    expect(getProjectCatalog()?.patterns).toHaveLength(2)
    expect(lastLine(lines)).toMatchObject({
      'log.level': 'info',
      message: `custom error catalog: 2 codes from ${join(root, 'dist/skilllane-monitoring/errors.js')}`,
    })
  })

  it('warns once with every adjusted entry', () => {
    const root = app()
    put(root, 'dist/skilllane-monitoring/errors.js', `exports.default = { errors: { catalog: { E1: { hint: '' }, E2: { hint: 'ok', level: 'fatal' } } } }`)
    const { lines } = captureLogger()
    startProjectCatalog({ entry: join(root, 'dist/main.js'), cwd: root })
    expect(lastLine(lines)).toMatchObject({ 'log.level': 'warn', message: 'custom error catalog: 2 entries adjusted' })
    expect(lastLine(lines).reason).toContain('E1: hint is required; entry skipped')
  })

  it('logs not found at info level and leaves the catalog unset', () => {
    const root = app()
    const { lines } = captureLogger()
    startProjectCatalog({ entry: join(root, 'dist/main.js'), cwd: root })
    expect(getProjectCatalog()).toBeUndefined()
    expect(lastLine(lines)).toMatchObject({ 'log.level': 'info', message: 'custom error catalog: not found' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/catalog-loader.test.ts`
Expected: FAIL — `Failed to resolve import "../src/errors/catalog-loader"`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/errors/catalog-loader.ts
import { existsSync } from 'fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import { getLogger } from '../logger'
import { type NormalizedCatalog, normalizeCatalog, setProjectCatalog } from './project-catalog'

export interface CandidateOptions {
  /** LOG_CONFIG_FILE: a src/…/x.ts path or a built .js path. */
  configFile?: string
  /** The script that started the app (process.argv[1]). */
  entry?: string
  cwd: string
  /** The runtime can require .ts (ts-node, tsx). */
  tsLoadable?: boolean
}

export interface Candidate {
  path: string
  /** As the user wrote it, for the summary line. */
  shown: string
}

export type LoadOutcome =
  | { status: 'not-found'; looked: string[] }
  | { status: 'failed'; path: string; reason: string }
  | { status: 'loaded'; path: string; shown: string; catalog: NormalizedCatalog; duplicates: string[] }

/** Nearest folder holding a package.json, from `from` upwards; `fallback` when none. */
function appRoot(from: string, fallback: string): string {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return fallback
    dir = parent
  }
}

export function catalogCandidates(o: CandidateOptions): Candidate[] {
  const entryDir = o.entry ? dirname(resolve(o.cwd, o.entry)) : o.cwd
  if (o.configFile) {
    const shown = o.configFile
    const full = isAbsolute(shown) ? shown : resolve(o.cwd, shown)
    if (!full.endsWith('.ts')) return [{ path: full, shown }]
    const root = appRoot(entryDir, o.cwd)
    const underRoot = relative(root, full)
    const underSrc = underRoot.startsWith(`src${sep}`) ? underRoot.slice(4) : underRoot
    const built = underSrc.replace(/\.ts$/, '.js')
    const list: Candidate[] = []
    if (o.tsLoadable) list.push({ path: full, shown })
    list.push({ path: join(root, 'dist', built), shown }, { path: join(root, 'dist', 'src', built), shown })
    return list
  }
  const ext = o.tsLoadable && o.entry?.endsWith('.ts') ? '.ts' : '.js'
  return [
    { path: join(entryDir, 'skilllane-monitoring', `errors${ext}`), shown: join(entryDir, 'skilllane-monitoring', `errors${ext}`) },
    { path: join(entryDir, 'config', `skilllane-monitoring${ext}`), shown: join(entryDir, 'config', `skilllane-monitoring${ext}`) },
  ]
}

export function loadProjectCatalog(o: CandidateOptions): LoadOutcome {
  const candidates = catalogCandidates(o)
  const present = candidates.filter((c) => existsSync(c.path))
  if (!present.length) return { status: 'not-found', looked: candidates.map((c) => c.path) }
  const [first, ...rest] = present
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raw = require(first.path)
    return {
      status: 'loaded',
      path: first.path,
      shown: first.shown,
      catalog: normalizeCatalog(raw),
      duplicates: o.configFile ? [] : rest.map((c) => c.path),
    }
  } catch (error) {
    return { status: 'failed', path: first.path, reason: error instanceof Error ? error.message : String(error) }
  }
}

function summary(outcome: Extract<LoadOutcome, { status: 'loaded' }>): string {
  const built = outcome.shown !== outcome.path ? `${outcome.shown} (${outcome.path})` : outcome.path
  return `custom error catalog: ${outcome.catalog.patterns.length} codes from ${built}`
}

/** Loads the app's table once at start and writes what happened. Never throws. */
export function startProjectCatalog(options: Partial<CandidateOptions> = {}): LoadOutcome {
  const o: CandidateOptions = {
    configFile: options.configFile ?? (process.env.LOG_CONFIG_FILE?.trim() || undefined),
    entry: options.entry ?? process.argv[1],
    cwd: options.cwd ?? process.cwd(),
    tsLoadable: options.tsLoadable ?? Boolean(require.extensions?.['.ts']),
  }
  const outcome = loadProjectCatalog(o)
  const log = (level: 'info' | 'warn', message: string, reason?: string) =>
    getLogger().event({ event: 'app.log', level, logger: 'skilllane-monitoring', message, fields: reason ? { reason } : undefined })
  try {
    if (outcome.status === 'not-found') {
      log('info', 'custom error catalog: not found', `looked in ${outcome.looked.join(', ')}`)
    } else if (outcome.status === 'failed') {
      log('warn', `custom error catalog: failed to load ${outcome.path}`, outcome.reason)
    } else {
      setProjectCatalog(outcome.catalog)
      log('info', summary(outcome))
      const errors = outcome.catalog.issues.filter((i) => i.severity === 'error')
      if (errors.length) {
        log('warn', `custom error catalog: ${errors.length} entries adjusted`, errors.map((i) => `${i.code}: ${i.message}`).join('; '))
      }
      if (outcome.duplicates.length) {
        log('warn', 'custom error catalog: more than one file found; the first is used', outcome.duplicates.join(', '))
      }
    }
  } catch {
    // reporting must never stop the app
  }
  return outcome
}
```

หมายเหตุ test `warns once with every adjusted entry`: ข้อความที่คาด `2 entries adjusted` นับ issue ระดับ error (E1 ไม่มี hint, E2 level ผิด) ถ้า `lastLine` เป็นบรรทัด duplicates ให้ตรวจว่าไม่ได้วางไฟล์ซ้ำในการทดสอบนั้น

ใน `src/errors/index.ts` เพิ่ม `export * from './catalog-loader'`

ใน `src/otel/register.ts` เพิ่ม import และเรียกหลังบรรทัด `const legacy = env('LOGGING_ENGINE') === 'legacy'`:

```ts
import { startProjectCatalog } from '../errors/catalog-loader'
// …
  if (!legacy) startProjectCatalog()
```

การโหลดแบบ ES module (`import()`) **ไม่ทำในแผนนี้**: SDK เป็น CommonJS และแอปที่ใช้อยู่ (Nest) build เป็น CommonJS ทั้งหมด ถ้า `require` ล้มด้วย `ERR_REQUIRE_ESM` บรรทัด `failed to load` จะบอกเหตุผล (บันทึกไว้ในคู่มือ Task 6)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/catalog-loader.test.ts && pnpm exec vitest run`
Expected: PASS ทั้งหมด · test ของ register เดิม (`register-http.test.ts`, `register-otlp.test.ts`) ต้องยังผ่าน (ไม่มีไฟล์ catalog = บรรทัด info เพิ่ม 1 บรรทัด ถ้า test ใดนับจำนวนบรรทัด ให้แก้ test นั้นให้ข้ามบรรทัดที่ message ขึ้นต้นด้วย `custom error catalog:`)

- [ ] **Step 5: Commit**

```bash
git add src/errors/catalog-loader.ts src/errors/index.ts src/otel/register.ts test/catalog-loader.test.ts
# รวมไฟล์ test ของ register ถ้าต้องแก้ใน Step 4
git commit -m "feat(errors): load the app's catalog at start and report it"
```

---

### Task 4: CLI `errors init`

**Files:**
- Create: `src/cli/scan.ts`, `src/cli/template.ts`, `src/cli/errors-init.ts`
- Test: `test/cli-errors.test.ts` (ส่วน init + scan)

**Interfaces:**
- Produces:
  - `interface ScanResult { errorCodes: string[]; repeatedMessages: { message: string; count: number }[]; loggerCodes: string[] }`
  - `function scanSource(srcDir: string, minRepeat: number): ScanResult`
  - `function renderCatalogFile(scan: ScanResult): string`
  - `function errorsInit(o: { cwd: string; path?: string; minRepeat?: number; out?: (line: string) => void }): number` (exit code)

- [ ] **Step 1: Write the failing test**

```ts
// test/cli-errors.test.ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { errorsInit } from '../src/cli/errors-init'
import { scanSource } from '../src/cli/scan'

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'slm-cli-'))
  writeFileSync(join(root, 'package.json'), '{"name":"app"}')
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), body)
  }
  return root
}

const SOURCES = {
  'src/a.exception.ts': `export class A extends BaseException { readonly errorCode = 'STUDENT_LEAVE_SCHOOL' }`,
  'src/b.exception.ts': `super(message, 409, { errorCode: 'EXAM_SHARE_REQUIRES_QUESTION_CASCADE' })`,
  'src/users.service.ts': [
    `throw new NotFoundException('User not found')`,
    `throw new NotFoundException('User not found')`,
    `throw new BadRequestException("User not found")`,
    `throw new BadRequestException('Once only')`,
    `this.logger.error('Import failed', { code: 'E1001' })`,
  ].join('\n'),
  'src/users.service.spec.ts': `throw new NotFoundException('User not found')`,
}

describe('scanSource', () => {
  it('finds errorCode literals, repeated throw messages and logger codes, skipping tests', () => {
    const root = project(SOURCES)
    expect(scanSource(join(root, 'src'), 3)).toEqual({
      errorCodes: ['EXAM_SHARE_REQUIRES_QUESTION_CASCADE', 'STUDENT_LEAVE_SCHOOL'],
      repeatedMessages: [{ message: 'User not found', count: 3 }],
      loggerCodes: ['E1001'],
    })
  })
})

describe('errors init', () => {
  it('writes the catalog with the rules, the found codes and messages', () => {
    const root = project(SOURCES)
    const out: string[] = []
    expect(errorsInit({ cwd: root, minRepeat: 3, out: (l) => out.push(l) })).toBe(0)
    const file = readFileSync(join(root, 'src/skilllane-monitoring/errors.ts'), 'utf8')
    expect(file).toContain('hint: ≤ 30')
    expect(file).toContain(`STUDENT_LEAVE_SCHOOL: { hint: '', hintDetail: '' },`)
    expect(file).toContain(`E1001: { hint: '', hintDetail: '' },`)
    expect(file).toContain(`USER_NOT_FOUND: { messageMatch: /^User not found$/, hint: '', hintDetail: '' }, // seen 3 times`)
    expect(file).toContain('export default {')
    expect(out.join('\n')).toContain('src/skilllane-monitoring/errors.ts')
  })

  it('never overwrites an existing file', () => {
    const root = project({ 'src/skilllane-monitoring/errors.ts': 'keep me' })
    expect(errorsInit({ cwd: root, out: () => {} })).toBe(0)
    expect(readFileSync(join(root, 'src/skilllane-monitoring/errors.ts'), 'utf8')).toBe('keep me')
  })

  it('writes to --path', () => {
    const root = project({ 'src/main.ts': '' })
    errorsInit({ cwd: root, path: 'src/common/config/monitoring-errors.ts', out: () => {} })
    expect(existsSync(join(root, 'src/common/config/monitoring-errors.ts'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/cli-errors.test.ts`
Expected: FAIL — `Failed to resolve import "../src/cli/errors-init"`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/cli/scan.ts
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

export interface ScanResult {
  errorCodes: string[]
  repeatedMessages: { message: string; count: number }[]
  loggerCodes: string[]
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage'])
const ERROR_CODE = /errorCode\s*[:=]\s*['"`]([A-Za-z0-9_.-]+)['"`]/g
const THROW_MESSAGE = /throw new [A-Za-z]+Exception\(\s*(['"])((?:(?!\1)[^\\\n]){4,120})\1/g
const LOGGER_CODE = /\.(?:error|warn|log|fatal)\([^;]*?\bcode:\s*['"]([A-Za-z0-9_.-]+)['"]/g

function sourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) files.push(...sourceFiles(full))
    } else if (/\.(ts|js)$/.test(name) && !/\.(spec|test)\.(ts|js)$/.test(name) && !name.endsWith('.d.ts')) {
      files.push(full)
    }
  }
  return files
}

/** Codes and messages an app already uses, read from its source text. */
export function scanSource(srcDir: string, minRepeat: number): ScanResult {
  const codes = new Set<string>()
  const loggerCodes = new Set<string>()
  const messages = new Map<string, number>()
  for (const file of sourceFiles(srcDir)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(ERROR_CODE)) codes.add(m[1])
    for (const m of text.matchAll(LOGGER_CODE)) loggerCodes.add(m[1])
    for (const m of text.matchAll(THROW_MESSAGE)) messages.set(m[2], (messages.get(m[2]) ?? 0) + 1)
  }
  return {
    errorCodes: [...codes].sort(),
    repeatedMessages: [...messages]
      .filter(([, count]) => count >= minRepeat)
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count || a.message.localeCompare(b.message)),
    loggerCodes: [...loggerCodes].filter((c) => !codes.has(c)).sort(),
  }
}
```

```ts
// src/cli/template.ts
import type { ScanResult } from './scan'

const RULES = `/*
 * Error catalog of this app for skilllane-monitoring. The SDK reads this file at start
 * (no import needed) and looks here before its built-in table.
 *
 * Rules
 *  - key: the app's error code (string or number), or a name for messageMatch entries
 *  - hint: ≤ 30 characters (≤ 40 with dependency), English, constant: it groups errors,
 *          so never put changing values in it. Required: entries without a hint are skipped.
 *  - hintDetail: ≤ 200 characters: likely causes and what to check
 *  - category: bug | input | data | dependency | config   (who has to act)
 *  - level: warn | error   (warn for the caller's mistakes; a 5xx response still logs error)
 *  - messageMatch: RegExp for errors that carry no code
 *  - no personal data anywhere in this file
 *  Breaking a rule never stops the app: a long text is cut with "…", an unknown value is
 *  ignored, and one warning at start lists what was changed. Run
 *  \`pnpm skilllane-monitoring errors check\` to see it before deploying.
 *
 * Removing skilllane-monitoring: delete this file (nothing imports it).
 */
`

function constantName(message: string, used: Set<string>): string {
  const base = message.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'MESSAGE'
  let name = /^[0-9]/.test(base) ? `M_${base}` : base
  for (let i = 2; used.has(name); i++) name = `${base}_${i}`
  used.add(name)
  return name
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

export function renderCatalogFile(scan: ScanResult): string {
  const used = new Set<string>([...scan.errorCodes, ...scan.loggerCodes])
  const lines: string[] = []
  for (const code of [...scan.errorCodes, ...scan.loggerCodes]) {
    lines.push(`      ${/^[A-Za-z_][A-Za-z0-9_]*$/.test(code) ? code : `'${code}'`}: { hint: '', hintDetail: '' },`)
  }
  for (const { message, count } of scan.repeatedMessages) {
    const name = constantName(message, used)
    lines.push(`      ${name}: { messageMatch: /^${escapeRegExp(message)}$/, hint: '', hintDetail: '' }, // seen ${count} times`)
  }
  return `${RULES}export default {
  errors: {
    // Where the app keeps its code on an error. Unset: the SDK reads err.code and Nest's errorCode.
    // codeOf: (err: any) => err.errorCode,
    catalog: {
${lines.join('\n')}
    },
  },
}
`
}
```

```ts
// src/cli/errors-init.ts
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { scanSource } from './scan'
import { renderCatalogFile } from './template'

export const DEFAULT_PATH = 'src/skilllane-monitoring/errors.ts'

export function errorsInit(o: { cwd: string; path?: string; minRepeat?: number; out?: (line: string) => void }): number {
  const out = o.out ?? ((line: string) => console.log(line))
  const rel = o.path ?? DEFAULT_PATH
  const target = resolve(o.cwd, rel)
  if (existsSync(target)) {
    out(`${rel} already exists; not overwritten`)
    return 0
  }
  const srcDir = join(o.cwd, 'src')
  const scan = existsSync(srcDir) ? scanSource(srcDir, o.minRepeat ?? 5) : { errorCodes: [], repeatedMessages: [], loggerCodes: [] }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, renderCatalogFile(scan))
  out(`created ${rel}: ${scan.errorCodes.length + scan.loggerCodes.length} codes, ${scan.repeatedMessages.length} repeated messages to fill in`)
  if (rel !== DEFAULT_PATH) out(`set LOG_CONFIG_FILE=${rel} so the SDK finds it`)
  out('the file is compiled with the app (keep it under src/); remove it to stop using it')
  return 0
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/cli-errors.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/cli/scan.ts src/cli/template.ts src/cli/errors-init.ts test/cli-errors.test.ts
git commit -m "feat(cli): errors init drafts the app's catalog from its source"
```

---

### Task 5: CLI `errors check` + bin

**Files:**
- Create: `src/cli/errors-check.ts`, `src/cli/index.ts`
- Modify: `package.json` (`bin`, `version`)
- Test: `test/cli-errors.test.ts` (เพิ่ม describe `errors check` และ `cli`)

**Interfaces:**
- Consumes: `normalizeCatalog` (Task 1), `scanSource` (Task 4), `DEFAULT_PATH` (Task 4)
- Produces:
  - `function loadCatalogSource(file: string, projectRoot: string): unknown` (`.ts` แปลงด้วย `typescript` ของโปรเจค)
  - `function errorsCheck(o: { cwd: string; path?: string; out?: (line: string) => void }): number` (0 = ผ่าน/มีแค่คำเตือน, 1 = ผิดกฎหรือโหลดไม่ได้)
  - `function runCli(argv: string[], cwd: string, out?: (line: string) => void): number`

- [ ] **Step 1: Write the failing test** (เพิ่ม import 3 บรรทัดนี้ไว้ด้านบนของ `test/cli-errors.test.ts` แล้วต่อท้ายไฟล์ด้วยส่วนที่เหลือ)

```ts
import { symlinkSync } from 'fs'
import { errorsCheck } from '../src/cli/errors-check'
import { runCli } from '../src/cli/index'
```

```ts
function linkTypescript(root: string): void {
  // the project under test needs its own typescript, like a real app (tests run from packages/monitoring)
  mkdirSync(join(root, 'node_modules'), { recursive: true })
  symlinkSync(join(process.cwd(), 'node_modules/typescript'), join(root, 'node_modules/typescript'), 'dir')
}

describe('errors check', () => {
  it('passes a valid catalog and warns about codes the source uses but the catalog lacks', () => {
    const root = project({
      ...SOURCES,
      'src/skilllane-monitoring/errors.ts': `export default { errors: { catalog: { STUDENT_LEAVE_SCHOOL: { hint: 'Student left school' } } } }`,
    })
    linkTypescript(root)
    const out: string[] = []
    expect(errorsCheck({ cwd: root, out: (l) => out.push(l) })).toBe(0)
    expect(out.join('\n')).toContain('warning EXAM_SHARE_REQUIRES_QUESTION_CASCADE: used in src/ but not in the catalog')
    expect(out.join('\n')).toContain('warning E1001: used in src/ but not in the catalog')
  })

  it('fails on rule errors', () => {
    const root = project({ 'src/skilllane-monitoring/errors.ts': `export default { errors: { catalog: { E1: { hint: '${'x'.repeat(31)}' } } } }` })
    linkTypescript(root)
    const out: string[] = []
    expect(errorsCheck({ cwd: root, out: (l) => out.push(l) })).toBe(1)
    expect(out.join('\n')).toContain('error E1: hint is longer than 30 characters; cut')
  })

  it('fails when the file is missing', () => {
    const root = project({})
    expect(errorsCheck({ cwd: root, out: () => {} })).toBe(1)
  })
})

describe('cli', () => {
  it('routes errors init / check and rejects unknown commands', () => {
    const root = project({})
    expect(runCli(['errors', 'init'], root, () => {})).toBe(0)
    expect(runCli(['nope'], root, () => {})).toBe(64)
  })

  it('reads --path and --min-repeat', () => {
    const root = project({})
    expect(runCli(['errors', 'init', '--path', 'src/x/errors.ts', '--min-repeat', '2'], root, () => {})).toBe(0)
    expect(existsSync(join(root, 'src/x/errors.ts'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/cli-errors.test.ts`
Expected: FAIL — `Failed to resolve import "../src/cli/errors-check"`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/cli/errors-check.ts
import { existsSync, readFileSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join, relative, resolve } from 'path'
import { Script, createContext } from 'vm'
import { normalizeCatalog } from '../errors/project-catalog'
import { DEFAULT_PATH } from './errors-init'
import { scanSource } from './scan'

/** Evaluates the catalog file; .ts goes through the project's own typescript. */
export function loadCatalogSource(file: string, projectRoot: string): unknown {
  if (!file.endsWith('.ts')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(file)
  }
  const projectRequire = createRequire(join(projectRoot, 'package.json'))
  const ts = projectRequire('typescript') as typeof import('typescript')
  const js = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText
  const module = { exports: {} as unknown }
  const context = createContext({ module, exports: module.exports, require: createRequire(file), __filename: file, __dirname: dirname(file) })
  new Script(js, { filename: file }).runInContext(context)
  return module.exports
}

export function errorsCheck(o: { cwd: string; path?: string; out?: (line: string) => void }): number {
  const out = o.out ?? ((line: string) => console.log(line))
  const rel = o.path ?? process.env.LOG_CONFIG_FILE?.trim() ?? DEFAULT_PATH
  const file = resolve(o.cwd, rel)
  if (!existsSync(file)) {
    out(`error ${rel}: not found (run: pnpm skilllane-monitoring errors init)`)
    return 1
  }
  let raw: unknown
  try {
    raw = loadCatalogSource(file, o.cwd)
  } catch (error) {
    out(`error ${rel}: cannot load: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
  const catalog = normalizeCatalog(raw)
  for (const issue of catalog.issues) out(`${issue.severity} ${issue.code}: ${issue.message}`)
  const known = new Set(catalog.patterns.map((p) => p.key))
  const srcDir = join(o.cwd, 'src')
  if (existsSync(srcDir)) {
    const scan = scanSource(srcDir, Number.POSITIVE_INFINITY)
    for (const code of [...scan.errorCodes, ...scan.loggerCodes]) {
      if (!known.has(code)) out(`warning ${code}: used in src/ but not in the catalog`)
    }
  }
  const errors = catalog.issues.filter((i) => i.severity === 'error').length
  out(`${relative(o.cwd, file)}: ${catalog.patterns.length} codes, ${errors} errors`)
  return errors ? 1 : 0
}
```

ไฟล์ `src/cli/index.ts` (บรรทัดแรกต้องเป็น shebang ห้ามมีอะไรก่อน):

```ts
#!/usr/bin/env node
import { errorsCheck } from './errors-check'
import { errorsInit } from './errors-init'

const USAGE = `usage:
  skilllane-monitoring errors init  [--path src/skilllane-monitoring/errors.ts] [--min-repeat 5]
  skilllane-monitoring errors check [--path src/skilllane-monitoring/errors.ts]`

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

export function runCli(argv: string[], cwd: string, out: (line: string) => void = (l) => console.log(l)): number {
  const [group, command] = argv
  const path = flag(argv, '--path')
  if (group === 'errors' && command === 'init') {
    const minRepeat = Number(flag(argv, '--min-repeat') ?? 5)
    return errorsInit({ cwd, path, minRepeat: Number.isFinite(minRepeat) && minRepeat > 0 ? minRepeat : 5, out })
  }
  if (group === 'errors' && command === 'check') return errorsCheck({ cwd, path, out })
  out(USAGE)
  return 64
}

if (require.main === module) {
  process.exitCode = runCli(process.argv.slice(2), process.cwd())
}
```

ใน `package.json` เพิ่ม (หลัง `"files"`) และเปลี่ยนเวอร์ชัน:

```json
  "bin": { "skilllane-monitoring": "dist/cli/index.js" },
```

```json
  "version": "0.3.0",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/cli-errors.test.ts && pnpm run build && node dist/cli/index.js nope; echo "exit=$?" && head -1 dist/cli/index.js`
Expected: test PASS · คำสั่งพิมพ์ usage และ `exit=64` · บรรทัดแรกของ `dist/cli/index.js` คือ `#!/usr/bin/env node`

- [ ] **Step 5: Commit**

```bash
git add src/cli/errors-check.ts src/cli/index.ts package.json test/cli-errors.test.ts
git commit -m "feat(cli): errors check and the skilllane-monitoring bin"
```

---

### Task 6: คู่มือ + ตรวจทั้งชุด + ทดลองกับแอปจริง

**Files:**
- Create: `docs/project-error-catalog.md` (คู่มือภาษาไทย ไม่แตะ `README.md` ที่มีงานค้าง)

- [ ] **Step 1: เขียนคู่มือ** `docs/project-error-catalog.md` มีหัวข้อ: ทำอะไรได้ · `pnpm skilllane-monitoring errors init` · ตัวอย่างไฟล์ (จาก spec) · กฎและผลเมื่อใส่ผิด (ตารางจาก spec) · ตำแหน่งไฟล์และ `LOG_CONFIG_FILE` (รวมการแปลง `src/…ts` → `dist/…js` และ `dist/src/…js`) · บรรทัดตอน start 4 แบบ · `errors check` ใน CI · ข้อจำกัด: ไฟล์แบบ ES module โหลดไม่ได้ (บรรทัด `failed to load`), `outDir` ที่ไม่ใช่ `dist` ต้องตั้ง `LOG_CONFIG_FILE` เป็น `.js` · การถอด: ลบไฟล์

- [ ] **Step 2: ตรวจทั้งชุด**

Run: `pnpm run typecheck && pnpm run lint && pnpm exec vitest run && pnpm run build`
Expected: ไม่มี error ทุกคำสั่ง

- [ ] **Step 3: ทดลองกับ school-core-api (ไม่ commit ใน pluton-monorepo)**

```bash
cd ../../../pluton-monorepo/packages/school-core-api
node ../../../skilllane-monitoring/packages/monitoring/dist/cli/index.js errors init --min-repeat 10
node ../../../skilllane-monitoring/packages/monitoring/dist/cli/index.js errors check; echo "exit=$?"
git status --short src/skilllane-monitoring && git diff --stat
```
Expected: สร้าง `src/skilllane-monitoring/errors.ts` มี `errorCode` ของคลาสลูก `BaseException` (ราว 26 code) และข้อความซ้ำ ≥ 10 ที่ (`User not found`, `Invalid token`, `User is not a student`, `Token expired`, `School not found`, `Exam room not found`, `School context is required`) · `check` exit 1 (hint ยังว่าง) และรายการ error ว่า `hint is required` · `git diff --stat` ไม่มีไฟล์อื่นเปลี่ยน
จากนั้น **ลบไฟล์ที่ทดลองสร้าง** (`rm -r src/skilllane-monitoring`) และรายงานผลให้ผู้ใช้ ตัดสินใจเองว่าจะเก็บไว้ใน pluton-monorepo หรือไม่

- [ ] **Step 4: Commit**

```bash
cd ../../../skilllane-monitoring/packages/monitoring
git add ../../docs/project-error-catalog.md
git commit -m "docs: project error catalog guide"
```

---

## หลังจบแผน (ไม่อยู่ในแผนนี้ ต้องถามผู้ใช้ก่อน)
- push และ `pnpm publish` เวอร์ชัน 0.3.0
- อัปเดต `skilllane-monitoring` ใน school-core-api เป็น `^0.3.0` และเติม hint ในตาราง
