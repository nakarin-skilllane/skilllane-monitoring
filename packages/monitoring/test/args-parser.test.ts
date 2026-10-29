import { describe, expect, it } from 'vitest'
import { errorCode } from '../src/errors/error-code'
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

describe('error codes and overrides', () => {
  const ECONNECTION = errorCode('ECONNECTION')
  const REDIS_DOWN = errorCode('ECONNREFUSED', 'redis')

  it('takes the code from the first argument, with no message', () => {
    const parsed = parseArgs(ECONNECTION, ['MailService'])
    expect(parsed.options).toMatchObject({ code: 'ECONNECTION' })
    expect(parsed.message).toBeUndefined()
    expect(parsed.context).toBe('MailService')
  })

  it('takes the code from any argument and keeps the dependency', () => {
    const err = new Error('boom')
    const parsed = parseArgs('Cache read failed', [err, REDIS_DOWN, 'Cache'])
    expect(parsed.message).toBe('Cache read failed')
    expect(parsed.error).toBe(err)
    expect(parsed.options).toMatchObject({
      code: 'ECONNREFUSED',
      dependency: 'redis',
    })
  })

  it('reads the object next to a code as overrides; other keys become labels', () => {
    const parsed = parseArgs(ECONNECTION, [
      {
        howToFix: 'Check MAIL_HOST.',
        category: 'config',
        level: 'warn',
        target: 'MAIL_HOST',
        message: 'Send welcome mail failed',
        labels: { tenant: 'a' },
        orderId: 42,
      },
      'MailService',
    ])
    expect(parsed.options).toMatchObject({
      code: 'ECONNECTION',
      howToFix: 'Check MAIL_HOST.',
      category: 'config',
      level: 'warn',
      target: 'MAIL_HOST',
    })
    expect(parsed.message).toBe('Send welcome mail failed')
    expect(parsed.labels).toEqual({ tenant: 'a', orderId: '42' })
  })

  it('treats any object with a code as overrides', () => {
    const parsed = parseArgs('Import failed', [
      { code: 'PRICE_OUT_OF_RANGE', category: 'input', level: 'warn' },
      'Import',
    ])
    expect(parsed.options).toMatchObject({
      code: 'PRICE_OUT_OF_RANGE',
      category: 'input',
      level: 'warn',
    })
  })

  it('keeps an invalid category or level as a label', () => {
    const parsed = parseArgs('x', [
      { code: 'A', category: 'book', level: 3 },
      'Ctx',
    ])
    expect(parsed.options.category).toBeUndefined()
    expect(parsed.options.level).toBeUndefined()
    expect(parsed.labels).toMatchObject({ category: 'book', level: '3' })
  })

  it('leaves calls without a code as before', () => {
    const parsed = parseArgs('x', [{ category: 'book', level: 3 }, 'Ctx'])
    expect(parsed.options).toEqual({})
    expect(parsed.labels).toEqual({ category: 'book', level: '3' })
  })

  it('an empty string code is not overrides', () => {
    const parsed = parseArgs('x', [{ code: '', level: 'warn', userId: '7' }])
    expect(parsed.options).toEqual({})
    expect(parsed.labels).toMatchObject({ level: 'warn', userId: '7' })
  })

  it('a string code after an ErrorCode drops the dependency of the ref', () => {
    const parsed = parseArgs('x', [
      errorCode('ECONNREFUSED', 'redis'),
      { code: 'MINE' },
    ])
    expect(parsed.options.code).toBe('MINE')
    expect(parsed.options.dependency).toBeUndefined()
  })
})
