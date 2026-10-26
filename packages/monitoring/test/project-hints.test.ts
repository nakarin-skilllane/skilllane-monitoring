import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common'
import { afterEach, describe, expect, it } from 'vitest'
import {
  normalizeCatalog,
  setProjectCatalog,
} from '../src/errors/project-catalog'
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
            hintDetail: 'Check the roster.',
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
      'error.hint_detail': 'Check the roster.',
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
    expect(line['error.hint_detail']).toContain('unique constraint')
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
