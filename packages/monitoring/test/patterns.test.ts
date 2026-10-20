import { describe, expect, it } from 'vitest'
import { EVENT_CATALOG, templatePlaceholders } from '../src/catalog'
import { lookupHint } from '../src/errors/hints'
import {
  ALL_PATTERNS,
  ALLOWED_PLACEHOLDERS,
  DEPENDENCY_HINT_MAX,
  HINT_DETAIL_MAX,
  HINT_MAX,
} from '../src/errors/patterns'
import { ALLOWED_FIELDS } from '../src/types'

describe('error patterns', () => {
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
      expect(pattern.hintDetail.length, pattern.hintDetail).toBeLessThanOrEqual(
        HINT_DETAIL_MAX,
      )
      for (const text of [pattern.hint, pattern.hintDetail]) {
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
      hintDetail:
        'Nothing is listening at 10.0.0.1:6379. Redis may be stopped or restarting, or REDIS_HOST/REDIS_PORT is wrong.',
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
