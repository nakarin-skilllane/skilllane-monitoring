import { describe, expect, it } from 'vitest'
import { parseArgs } from '../src/logger/args-parser'

const err = new Error('db down')

describe('parseArgs', () => {
  it('(msg) from the static Logger', () => {
    const parsed = parseArgs('hello', [])
    expect(parsed.message).toBe('hello')
    expect(parsed.context).toBeUndefined()
  })

  it('(msg, context)', () => {
    expect(parseArgs('hello', ['ScoreService'])).toMatchObject({
      message: 'hello',
      context: 'ScoreService',
    })
  })

  it('(msg, undefined, context) from Logger.error(msg)', () => {
    const parsed = parseArgs('failed', [undefined, 'ScoreService'])
    expect(parsed).toMatchObject({ message: 'failed', context: 'ScoreService' })
    expect(parsed.error).toBeUndefined()
  })

  it('(msg, err, context)', () => {
    expect(parseArgs('Failed to load', [err, 'ScoreService'])).toMatchObject({
      message: 'Failed to load',
      error: err,
      context: 'ScoreService',
    })
  })

  it('(err, context) keeps the error, not the class name, as the subject', () => {
    const parsed = parseArgs(err, ['ScoreService'])
    expect(parsed.error).toBe(err)
    expect(parsed.message).toBeUndefined()
    expect(parsed.context).toBe('ScoreService')
  })

  it('(msg, stack, context) legacy form turns the stack into an error', () => {
    const parsed = parseArgs('Failed', [err.stack, 'ScoreService'])
    expect(parsed.context).toBe('ScoreService')
    expect((parsed.error as Error).stack).toBe(err.stack)
    expect((parsed.error as Error).message).toBe('db down')
  })

  it('(msg, options, context)', () => {
    const parsed = parseArgs('Rejected', [
      { event: 'auth.rejected', reason: 'token_expired' },
      'Auth',
    ])
    expect(parsed.options).toEqual({
      event: 'auth.rejected',
      reason: 'token_expired',
    })
    expect(parsed.context).toBe('Auth')
  })

  it('(msg, legacyMetadata) maps known keys and drops personal data', () => {
    const parsed = parseArgs('Query failed', [
      {
        err,
        dbQuery: 'SELECT 1',
        dbParameters: ['1234567890123'],
        schoolId: 42,
        requestId: 'abc',
      },
      'AllExceptionsFilter',
    ])
    expect(parsed.error).toBe(err)
    expect(parsed.fields).toEqual({
      'db.statement': 'SELECT 1',
      'organization.id': '42',
    })
    expect(parsed.labels).toEqual({ requestId: 'abc' })
    expect(JSON.stringify(parsed)).not.toContain('1234567890123')
  })
})
