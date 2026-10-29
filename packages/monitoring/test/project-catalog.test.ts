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
            STUDENT_LEAVE_SCHOOL: {
              hint: 'Student left school',
              detail: 'Left.',
              howToFix: 'Check the roster.',
              category: 'input',
              level: 'warn',
            },
            1701: { hint: 'Role title exists' },
          },
        },
      },
    })
    expect(c.issues).toEqual([])
    expect(c.patterns).toEqual([
      { key: '1701', hint: 'Role title exists', detail: '', howToFix: '' },
      {
        key: 'STUDENT_LEAVE_SCHOOL',
        hint: 'Student left school',
        detail: 'Left.',
        howToFix: 'Check the roster.',
        category: 'input',
        level: 'warn',
      },
    ])
  })

  it('accepts the config without a default export wrapper', () => {
    const c = normalizeCatalog({ errors: { catalog: { A: { hint: 'A' } } } })
    expect(c.patterns.map((p) => p.key)).toEqual(['A'])
  })

  it('keeps messageMatch entries with their key as the code', () => {
    const c = normalizeCatalog({
      errors: {
        catalog: {
          USER_NOT_FOUND: {
            messageMatch: /^User not found$/,
            hint: 'User not found',
          },
        },
      },
    })
    expect(c.patterns[0]).toMatchObject({
      key: 'USER_NOT_FOUND',
      messageMatch: /^User not found$/,
    })
  })

  it('cuts long hint / detail / howToFix and drops unknown fields with an issue each', () => {
    const c = normalizeCatalog({
      errors: {
        catalog: {
          LONG: {
            hint: 'x'.repeat(31),
            detail: 'y'.repeat(201),
            howToFix: 'z'.repeat(201),
            category: 'oops',
            level: 'fatal',
            messageMatch: 'not a regexp',
          },
          DEP: { hint: 'd'.repeat(40), dependency: 'redis' },
          BAD_DEP: { hint: 'ok', dependency: 'mysql' },
        },
      },
    })
    const long = c.patterns.find((p) => p.key === 'LONG')!
    expect(long.hint).toBe(`${'x'.repeat(30)}…`)
    expect(long.detail).toBe(`${'y'.repeat(200)}…`)
    expect(long.howToFix).toBe(`${'z'.repeat(200)}…`)
    expect(long.category).toBeUndefined()
    expect(long.level).toBeUndefined()
    expect(long.messageMatch).toBeUndefined()
    expect(c.patterns.find((p) => p.key === 'DEP')!.hint).toBe('d'.repeat(40))
    expect(
      c.patterns.find((p) => p.key === 'BAD_DEP')!.dependency,
    ).toBeUndefined()
    expect(
      c.issues.filter((i) => i.severity === 'error').map((i) => i.code),
    ).toEqual(['BAD_DEP', 'LONG', 'LONG', 'LONG', 'LONG', 'LONG', 'LONG'])
  })

  it('skips entries without a hint and warns about code names', () => {
    const c = normalizeCatalog({
      errors: {
        catalog: { EMPTY: { hint: '' }, 'bad code': { hint: 'Fine' } },
      },
    })
    expect(c.patterns.map((p) => p.key)).toEqual(['bad code'])
    expect(c.issues).toEqual([
      {
        severity: 'warning',
        code: 'bad code',
        message: 'code should match [A-Z0-9_.-]+',
      },
      {
        severity: 'error',
        code: 'EMPTY',
        message: 'hint is required; entry skipped',
      },
    ])
  })

  it('reports a file whose export has no errors.catalog', () => {
    const c = normalizeCatalog({ something: 1 })
    expect(c.patterns).toEqual([])
    expect(c.issues).toEqual([
      {
        severity: 'error',
        code: '*',
        message: 'export default { errors: { catalog } } expected',
      },
    ])
  })
})

describe('projectCodeOf', () => {
  it('uses codeOf and turns numbers into strings', () => {
    setProjectCatalog(
      normalizeCatalog({
        errors: { codeOf: (e: any) => e.errorCode, catalog: {} },
      }),
    )
    expect(projectCodeOf({ errorCode: 1701 })).toBe('1701')
    expect(projectCodeOf({ errorCode: 'X' })).toBe('X')
    expect(projectCodeOf({})).toBeUndefined()
  })

  it('ignores a codeOf that throws or returns another type', () => {
    setProjectCatalog(
      normalizeCatalog({
        errors: {
          codeOf: () => {
            throw new Error('boom')
          },
          catalog: {},
        },
      }),
    )
    expect(projectCodeOf({})).toBeUndefined()
    setProjectCatalog(
      normalizeCatalog({ errors: { codeOf: () => ({}), catalog: {} } }),
    )
    expect(projectCodeOf({})).toBeUndefined()
  })

  it('returns undefined when no catalog is set', () => {
    expect(projectCodeOf({ errorCode: 'X' })).toBeUndefined()
  })
})
