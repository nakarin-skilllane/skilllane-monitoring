import { inspect } from 'util'
import { describe, expect, it } from 'vitest'
import { errorCode, isErrorCodeRef } from '../src/errors/error-code'

describe('ErrorCodeRef', () => {
  it('carries the code and the dependency that scopes it', () => {
    const ref = errorCode('ECONNREFUSED', 'redis')
    expect(ref.code).toBe('ECONNREFUSED')
    expect(ref.dependency).toBe('redis')
    expect(Object.isFrozen(ref)).toBe(true)
  })

  it('is told apart from a plain object with a code', () => {
    expect(isErrorCodeRef(errorCode('X'))).toBe(true)
    expect(isErrorCodeRef({ code: 'X' })).toBe(false)
    expect(isErrorCodeRef('X')).toBe(false)
    expect(isErrorCodeRef(null)).toBe(false)
  })

  it('is recognised across copies of the SDK (global symbol)', () => {
    const other = {
      [Symbol.for('skilllane-monitoring.error-code')]: true,
      code: 'X',
    }
    expect(isErrorCodeRef(other)).toBe(true)
  })

  it('prints as its code in strings, JSON and Nest ConsoleLogger', () => {
    const ref = errorCode('ECONNECTION')
    expect(`${ref}`).toBe('ECONNECTION')
    expect(JSON.stringify({ ref })).toBe('{"ref":"ECONNECTION"}')
    expect(inspect(ref)).toBe('ECONNECTION')
  })
})
