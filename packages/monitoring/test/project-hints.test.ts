import {
  BadRequestException,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { inspect } from 'util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  normalizeCatalog,
  setProjectCatalog,
} from '../src/errors/project-catalog'
import { AppError } from '../src/errors/app-error'
import { ErrorCode } from '../src/errors/error-codes'
import { captureLogger, lastLine } from './helpers'

class BaseException extends HttpException {
  constructor(
    message: string,
    status: number,
    readonly errorCode: string | number,
  ) {
    super(message, status)
  }
}

function useCatalog(config: unknown) {
  setProjectCatalog(normalizeCatalog(config))
}

afterEach(() => setProjectCatalog(undefined))

describe('project error catalog in log lines', () => {
  it('gives an app error code its hint, detail, category and level', () => {
    useCatalog({
      errors: {
        catalog: {
          STUDENT_LEAVE_SCHOOL: {
            hint: 'Student left school',
            detail: 'The student is no longer enrolled.',
            howToFix: 'Check the roster.',
            category: 'input',
            level: 'warn',
          },
        },
      },
    })
    const { logger, lines } = captureLogger()
    logger.error(
      'Request failed',
      new BaseException('Student left', 409, 'STUDENT_LEAVE_SCHOOL'),
    )
    expect(lastLine(lines)).toMatchObject({
      'error.code': 'STUDENT_LEAVE_SCHOOL',
      'error.hint': 'Student left school',
      'error.detail': 'The student is no longer enrolled.',
      'error.how_to_fix': 'Check the roster.',
      labels: { error_category: 'input' },
      'log.level': 'warn',
    })
  })

  it('lets the call replace detail and how to fix, keeping the rest of the entry', () => {
    useCatalog({
      errors: {
        catalog: {
          STUDENT_LEAVE_SCHOOL: {
            hint: 'Student left school',
            detail: 'The student is no longer enrolled.',
            howToFix: 'Check the roster.',
            category: 'input',
            level: 'warn',
          },
        },
      },
    })
    const { logger, lines } = captureLogger()
    logger.error('Request failed', {
      code: 'STUDENT_LEAVE_SCHOOL',
      howToFix: 'Re-enrol the student first.',
    })
    expect(lastLine(lines)).toMatchObject({
      'error.hint': 'Student left school',
      'error.detail': 'The student is no longer enrolled.',
      'error.how_to_fix': 'Re-enrol the student first.',
      labels: { error_category: 'input' },
      'log.level': 'warn',
    })
  })

  it('reads numeric codes through codeOf', () => {
    useCatalog({
      errors: {
        codeOf: (e: any) => e.errorCode,
        catalog: { 1701: { hint: 'Role title exists' } },
      },
    })
    const { logger, lines } = captureLogger()
    logger.error('Request failed', new BaseException('dup', 409, 1701))
    expect(lastLine(lines)).toMatchObject({
      'error.code': '1701',
      'error.hint': 'Role title exists',
    })
  })

  it('works for logger calls with only a code', () => {
    useCatalog({
      errors: { catalog: { E1001: { hint: 'Score out of range' } } },
    })
    const { logger, lines } = captureLogger()
    logger.error('Import failed', { code: 'E1001' })
    expect(lastLine(lines)).toMatchObject({
      'error.code': 'E1001',
      'error.hint': 'Score out of range',
    })
  })

  it('matches messages of errors without a code and names them with the key', () => {
    useCatalog({
      errors: {
        catalog: {
          USER_NOT_FOUND: {
            messageMatch: /^User not found$/,
            hint: 'User not found',
          },
        },
      },
    })
    const { logger, lines } = captureLogger()
    logger.error('Request failed', new Error('User not found'))
    expect(lastLine(lines)).toMatchObject({
      'error.code': 'USER_NOT_FOUND',
      'error.hint': 'User not found',
    })
  })

  it('names a Nest exception matched by message with the key instead of HTTP_404', () => {
    useCatalog({
      errors: {
        catalog: {
          USER_NOT_FOUND: {
            messageMatch: /^User not found$/,
            hint: 'User not found',
          },
        },
      },
    })
    const { logger, lines } = captureLogger()
    logger.error('Request failed', new NotFoundException('User not found'))
    expect(lastLine(lines)).toMatchObject({
      'error.code': 'USER_NOT_FOUND',
      'error.hint': 'User not found',
    })
  })

  it('overrides a built-in hint for the same code and keeps its explain, category and level', () => {
    useCatalog({
      errors: { catalog: { 'ORA-00001': { hint: 'Duplicate exam code' } } },
    })
    const { logger, lines } = captureLogger()
    logger.error(
      'Insert failed',
      Object.assign(
        new Error(
          'ORA-00001: unique constraint (PROD_RE.UQ_EXAM_CODE) violated',
        ),
        { errorNum: 1 },
      ),
    )
    const line = lastLine(lines)
    expect(line['error.hint']).toBe('Duplicate exam code')
    // inherited from the built-in pattern
    expect(line['error.detail']).toContain('unique constraint')
    expect(line['error.how_to_fix']).toContain('upsert')
    // the built-in explain still runs
    expect(line.labels.error_target).toBe('UQ_EXAM_CODE')
    expect(line.labels.error_category).toBe('data')
    expect(line['log.level']).toBe('warn')
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

describe('ErrorCode in log calls', () => {
  it('fills every field from the built-in table and uses the hint as message', () => {
    const { logger, lines } = captureLogger()
    logger.error(ErrorCode.smtp.ECONNECTION)
    expect(lastLine(lines)).toMatchObject({
      message: 'Cannot reach SMTP server',
      'error.code': 'ECONNECTION',
      'error.hint': 'Cannot reach SMTP server',
    })
    expect(lastLine(lines)['error.detail']).toBeTruthy()
    expect(lastLine(lines)['error.how_to_fix']).toBeTruthy()
  })

  it('replaces only the fields given', () => {
    const { logger, lines } = captureLogger()
    logger.error('Send welcome mail failed', ErrorCode.smtp.ECONNECTION, {
      howToFix: 'Check MAIL_HOST.',
      category: 'config',
    })
    const line = lastLine(lines)
    expect(line).toMatchObject({
      message: 'Send welcome mail failed',
      'error.hint': 'Cannot reach SMTP server',
      'error.how_to_fix': 'Check MAIL_HOST.',
      labels: { error_category: 'config' },
    })
    expect(line['error.detail']).toContain('mail server')
  })

  it('uses the dependency-scoped pattern of the code', () => {
    const { logger, lines } = captureLogger()
    logger.error(ErrorCode.redis.ECONNREFUSED)
    expect(lastLine(lines)['error.hint']).toContain('unreachable')
  })

  it('a hint from the call keeps the rest of the entry', () => {
    useCatalog({
      errors: {
        catalog: {
          STUDENT_LEAVE_SCHOOL: {
            hint: 'Student left school',
            detail: 'The student is no longer enrolled.',
            category: 'input',
            level: 'warn',
          },
        },
      },
    })
    const { logger, lines } = captureLogger()
    logger.error('x', { code: 'STUDENT_LEAVE_SCHOOL', hint: 'Left school' })
    expect(lastLine(lines)).toMatchObject({
      'error.hint': 'Left school',
      'error.detail': 'The student is no longer enrolled.',
      labels: { error_category: 'input' },
      'log.level': 'warn',
    })
  })

  it('a hint from the call on an error without a code keeps the table entry', () => {
    const { logger, lines } = captureLogger()
    const err = Object.assign(
      new Error('ORA-00001: unique constraint (X.UQ_A) violated'),
      { errorNum: 1 },
    )
    logger.error('x', err, { hint: 'Custom hint' })
    const line = lastLine(lines)
    expect(line['error.hint']).toBe('Custom hint')
    expect(line['error.detail']).toBeTruthy()
    expect(line['error.how_to_fix']).toBeTruthy()
    expect(line.labels.error_category).toBe('data')
    expect(line['log.level']).toBe('warn')
  })

  it('a level from the call is kept when the method level is not enabled', () => {
    useCatalog({
      errors: { catalog: { NOISY: { hint: 'Noisy', level: 'warn' } } },
    })
    const { logger, lines } = captureLogger({ level: 'error' })
    logger.warn('x', { code: 'NOISY', level: 'error' })
    expect(lines).toHaveLength(1)
    expect(lastLine(lines)['log.level']).toBe('error')
  })

  it('still drops a warn call whose override is below the level', () => {
    const { logger, lines } = captureLogger({ level: 'error' })
    logger.error('x', { code: 'NOISY', level: 'warn' })
    expect(lines).toHaveLength(0)
  })

  it('an error and a code without a message keep the error message', () => {
    const { logger, lines } = captureLogger()
    logger.error(new Error('db is down'), { code: ErrorCode.smtp.ECONNECTION })
    expect(lastLine(lines)).toMatchObject({
      message: 'db is down',
      'error.message': 'db is down',
      'error.code': 'ECONNECTION',
    })
  })

  it('a level from the call is final', () => {
    useCatalog({
      errors: { catalog: { NOISY: { hint: 'Noisy', level: 'warn' } } },
    })
    const { logger, lines } = captureLogger()
    logger.warn('x', { code: 'NOISY', level: 'error' })
    expect(lastLine(lines)['log.level']).toBe('error')
  })
})

describe('AppError thrown to Nest', () => {
  afterEach(() => {
    // the filter logs through Nest's static Logger: put it back
    Logger.overrideLogger(false)
  })

  function throwToNest(err: unknown) {
    const replies: [number, unknown][] = []
    const ref = {
      isHeadersSent: () => false,
      reply: (_res: unknown, body: unknown, status: number) =>
        replies.push([status, body]),
      end() {},
    }
    new BaseExceptionFilter(ref as any).catch(err, {
      getArgByIndex: () => ({}),
    } as any)
    return replies[0]
  }

  it('answers with its status and logs its code and words (Nest 11)', () => {
    const { logger, lines } = captureLogger()
    // the filter logs through Nest's static Logger
    Logger.overrideLogger(logger)
    const [status] = throwToNest(
      new AppError(ErrorCode.smtp.ECONNECTION, 'Mail is down', {
        status: 503,
        howToFix: 'Check MAIL_HOST.',
      }),
    )
    expect(status).toBe(503)
    expect(lastLine(lines)).toMatchObject({
      'error.code': 'ECONNECTION',
      'error.how_to_fix': 'Check MAIL_HOST.',
      'http.response.status_code': 503,
    })
  })

  it('keeps the name a subclass sets in the stack header', () => {
    class OrderError extends AppError {
      constructor() {
        super('ORDER_FAILED', 'Order failed')
        this.name = 'OrderError'
      }
    }
    expect(new OrderError().stack?.split('\n')[0]).toBe(
      'OrderError: Order failed',
    )
  })

  it('finds a subclass again from its stack', () => {
    class OrderError extends AppError {
      constructor() {
        super('ORDER_FAILED', 'Order failed')
        this.name = 'OrderError'
      }
    }
    const { logger, lines } = captureLogger()
    const err = new OrderError()
    logger.error(err.message, err.stack, 'ExceptionsHandler')
    expect(lastLine(lines)['error.code']).toBe('ORDER_FAILED')
  })

  it('does not show its mark when printed', () => {
    const err = new AppError('X', 'boom')
    expect(Object.getOwnPropertySymbols({ ...err })).toEqual([])
    expect(inspect(err)).not.toContain('skilllane-monitoring.app-error')
  })

  it('finds the AppError again from its stack (Nest 9/10 log message, stack)', () => {
    const { logger, lines } = captureLogger()
    const err = new AppError('ACCOUNT_INACTIVATED', 'Inactive', {
      hint: 'Account is inactivated',
    })
    logger.error(err.message, err.stack, 'ExceptionsHandler')
    expect(lastLine(lines)).toMatchObject({
      'error.code': 'ACCOUNT_INACTIVATED',
      'error.hint': 'Account is inactivated',
    })
  })
})
