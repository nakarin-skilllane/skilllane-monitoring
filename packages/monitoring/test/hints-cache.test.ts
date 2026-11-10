import { afterEach, describe, expect, it } from 'vitest'
import { lookupHint } from '../src/errors/hints'
import {
  normalizeCatalog,
  setProjectCatalog,
} from '../src/errors/project-catalog'

afterEach(() => setProjectCatalog(undefined))

describe('lookupHint asked the same message again', () => {
  it('gives the same answer, found or not', () => {
    const found = 'Missing lock for job 42. moveToFinished'
    const missing = 'Something nobody has a pattern for'
    const first = lookupHint({ message: found })
    expect(first?.key).toBeDefined()
    expect(lookupHint({ message: found })).toEqual(first)
    expect(lookupHint({ message: missing })).toBeUndefined()
    expect(lookupHint({ message: missing })).toBeUndefined()
  })

  it('still scopes a pattern by its dependency', () => {
    // A Redis-only pattern: the same text from another dependency is not it.
    const message = 'Connection is closed.'
    expect(lookupHint({ message, dependency: 'redis' })?.key).toBe(
      'REDIS_CONNECTION_CLOSED',
    )
    expect(lookupHint({ message, dependency: 'oracle' })?.key).not.toBe(
      'REDIS_CONNECTION_CLOSED',
    )
    expect(lookupHint({ message, dependency: 'redis' })?.key).toBe(
      'REDIS_CONNECTION_CLOSED',
    )
  })

  it('sees a new app catalog for a message that missed before', () => {
    const message = 'Student 42 left the school'
    expect(lookupHint({ message })).toBeUndefined()
    setProjectCatalog(
      normalizeCatalog({
        errors: {
          catalog: {
            STUDENT_LEFT: {
              hint: 'Student left school',
              messageMatch: /^Student \d+ left the school$/,
            },
          },
        },
      }),
    )
    expect(lookupHint({ message })?.key).toBe('STUDENT_LEFT')
    setProjectCatalog(undefined)
    expect(lookupHint({ message })).toBeUndefined()
  })
})
