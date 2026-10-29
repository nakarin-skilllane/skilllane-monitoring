import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EVENT_CATALOG, templatePlaceholders } from '../src/catalog'
import { lookupHint } from '../src/errors/hints'
import {
  ALL_PATTERNS,
  ALLOWED_PLACEHOLDERS,
  DEPENDENCY_HINT_MAX,
  DETAIL_MAX,
  HINT_MAX,
  HOW_TO_FIX_MAX,
} from '../src/errors/patterns'
import { ALLOWED_FIELDS } from '../src/types'

const PATTERN_DIR = join(__dirname, '../src/errors/patterns')
const PATTERN_FILES = readdirSync(PATTERN_DIR).filter(
  (file) =>
    file.endsWith('.ts') &&
    !['index.ts', 'types.ts', 'explain-helpers.ts'].includes(file),
)

describe('error patterns', () => {
  it.each(PATTERN_FILES)('%s lists the sources of its texts', (file) => {
    const text = readFileSync(join(PATTERN_DIR, file), 'utf8')
    expect(text).toMatch(/^\/\/ Sources:\n(\/\/ - https:\/\/\S+.*\n)+/m)
  })

  it('has unique (dependency, key) pairs', () => {
    const seen = new Set<string>()
    for (const pattern of ALL_PATTERNS) {
      const id = `${pattern.dependency ?? '*'}|${pattern.key}`
      expect(seen.has(id), `duplicate ${id}`).toBe(false)
      seen.add(id)
    }
  })

  it.each(ALL_PATTERNS.map((p) => [p.key, p] as const))(
    '%s respects length and placeholder rules',
    (_, pattern) => {
      const max = pattern.dependency ? DEPENDENCY_HINT_MAX : HINT_MAX
      // Placeholders count at their name length; filled values may be longer.
      expect(pattern.hint.length, pattern.hint).toBeLessThanOrEqual(max)
      expect(pattern.detail.length, pattern.detail).toBeLessThanOrEqual(
        DETAIL_MAX,
      )
      expect(pattern.howToFix.length, pattern.howToFix).toBeLessThanOrEqual(
        HOW_TO_FIX_MAX,
      )
      expect(pattern.detail, 'detail').not.toBe('')
      expect(pattern.howToFix, 'howToFix').not.toBe('')
      for (const text of [pattern.hint, pattern.detail, pattern.howToFix]) {
        const placeholders = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
        if (!pattern.dependency) expect(placeholders, text).toEqual([])
        for (const name of placeholders)
          expect(ALLOWED_PLACEHOLDERS).toContain(name)
      }
    },
  )

  it('prefers the dependency-specific hint', () => {
    expect(
      lookupHint(
        { code: 'ECONNREFUSED', dependency: 'redis' },
        {
          name: 'cache',
          host: '10.0.0.1',
          port: 6379,
          configKeys: ['REDIS_HOST', 'REDIS_PORT'],
        },
      ),
    ).toMatchObject({
      hint: 'Redis "cache" unreachable',
      detail:
        'Nothing is listening at 10.0.0.1:6379. Redis may be stopped or restarting, or REDIS_HOST/REDIS_PORT is wrong.',
      howToFix:
        'Check that Redis is running and that REDIS_HOST/REDIS_PORT points to it.',
    })
    expect(lookupHint({ code: 'ECONNREFUSED' })?.hint).toBe(
      'Connection refused',
    )
  })

  it('falls back to a message pattern and reports its key as code', () => {
    expect(
      lookupHint({ message: 'Error putting file: Access Denied' }),
    ).toMatchObject({
      code: 'S3_WRAPPED_ERROR',
      hint: 'Storage operation failed',
    })
  })

  it('returns nothing for an unknown code', () => {
    expect(
      lookupHint({ code: 'SOMETHING_NEW', message: 'boom' }),
    ).toBeUndefined()
  })
})

describe('event catalog', () => {
  it.each(Object.entries(EVENT_CATALOG))(
    '%s template uses known fields',
    (_, definition) => {
      for (const field of templatePlaceholders(definition.template)) {
        expect(ALLOWED_FIELDS.has(field), field).toBe(true)
      }
    },
  )
})
