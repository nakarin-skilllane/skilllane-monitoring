import { Logger, type LoggerService } from '@nestjs/common'
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { ErrorCode } from '../src/errors/error-codes'
import { reconfigureLogger } from '../src/logger'
import { log } from '../src/logger/log'
import { captureLogger, lastLine } from './helpers'

class ExamEvaluationService {
  evaluate() {
    log.log('Evaluated')
  }

  async afterAwait() {
    await null
    log.warn('Evaluated late')
  }

  inForEach() {
    ;[1].forEach(() => log.log('Evaluated one'))
  }

  inThen() {
    return Promise.resolve().then(() => log.log('Evaluated later'))
  }

  paid(orderId: string) {
    log.log('Order paid', orderId)
  }

  fail(err: unknown) {
    log.error('Evaluate failed', err)
  }

  cacheDown() {
    log.error(ErrorCode.redis.ECONNREFUSED)
  }
}

function gradeAll() {
  log.log('Graded')
}

afterEach(() => {
  delete process.env.LOGGING_ENGINE
  Logger.overrideLogger(false)
})

describe('log', () => {
  it('names the line after the calling class, without new Logger(Class.name)', () => {
    const { lines } = captureLogger()
    new ExamEvaluationService().evaluate()
    expect(lastLine(lines)).toMatchObject({
      'log.level': 'info',
      'log.logger': 'ExamEvaluationService',
      'log.origin.function': 'ExamEvaluationService.evaluate',
      'log.origin.file.name': 'test/log.test.ts',
      'service.name': 'test-api',
      message: 'Evaluated',
    })
  })

  it('finds the class after an await', async () => {
    const { lines } = captureLogger()
    await new ExamEvaluationService().afterAwait()
    expect(lastLine(lines)).toMatchObject({
      'log.level': 'warn',
      'log.logger': 'ExamEvaluationService',
      'log.origin.function': 'ExamEvaluationService.afterAwait',
    })
  })

  it('takes the method around an arrow callback in the same file', () => {
    const { lines } = captureLogger()
    new ExamEvaluationService().inForEach()
    expect(lastLine(lines)).toMatchObject({
      'log.logger': 'ExamEvaluationService',
      'log.origin.function': 'ExamEvaluationService.inForEach',
    })
  })

  it('falls back to the file name when no function is named', async () => {
    const { lines } = captureLogger()
    await new ExamEvaluationService().inThen()
    expect(lastLine(lines)['log.logger']).toBe('log.test')
    expect(lastLine(lines)['log.origin.file.name']).toBe('test/log.test.ts')
    expect(lastLine(lines)['log.origin.function']).toBeUndefined()
  })

  it('names a plain function after itself', () => {
    const { lines } = captureLogger()
    gradeAll()
    expect(lastLine(lines)).toMatchObject({
      'log.logger': 'gradeAll',
      'log.origin.function': 'gradeAll',
    })
  })

  it('keeps a trailing string as a value, not as the logger name', () => {
    const { lines } = captureLogger()
    new ExamEvaluationService().paid('ORD-1')
    expect(lastLine(lines)).toMatchObject({
      'log.logger': 'ExamEvaluationService',
      message: 'Order paid',
      labels: { arg0: 'ORD-1' },
    })
  })

  it('keeps where the error was thrown in log.origin', () => {
    const { lines } = captureLogger()
    function loadAnswers() {
      throw new Error('answers table missing')
    }
    let err: unknown
    try {
      loadAnswers()
    } catch (e) {
      err = e
    }
    new ExamEvaluationService().fail(err)
    expect(lastLine(lines)).toMatchObject({
      'log.level': 'error',
      'log.logger': 'ExamEvaluationService',
      'log.origin.function': 'loadAnswers',
      'error.message': 'answers table missing',
    })
  })

  it('takes a code like this.logger does, with the caller in log.origin', () => {
    const { lines } = captureLogger()
    new ExamEvaluationService().cacheDown()
    const line = lastLine(lines)
    expect(line).toMatchObject({
      'log.logger': 'ExamEvaluationService',
      'log.origin.function': 'ExamEvaluationService.cacheDown',
      'error.code': 'ECONNREFUSED',
    })
    expect(line.message).toBe(line['error.hint'])
  })

  it('maps every Nest method to its level', () => {
    const { lines } = captureLogger()
    log.verbose('v')
    log.debug('d')
    log.log('l')
    log.warn('w')
    log.fatal('f')
    expect(lines.map((l) => l['log.level'])).toEqual([
      'debug',
      'debug',
      'info',
      'warn',
      'fatal',
    ])
  })

  it('skips a disabled level', () => {
    const { lines } = captureLogger({ level: 'info' })
    log.debug('Not written')
    expect(lines).toEqual([])
  })

  it('writes with the logger as configured later (forRoot)', () => {
    const { lines } = captureLogger()
    reconfigureLogger({ service: 'exam-api' })
    gradeAll()
    expect(lastLine(lines)['service.name']).toBe('exam-api')
  })

  it("is the same log from 'skilllane-monitoring/log'", async () => {
    expect((await import('../src/log')).log).toBe(log)
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '../package.json'), 'utf8'),
    )
    expect(pkg.exports['./log']).toEqual({
      types: './dist/log.d.ts',
      require: './dist/log.js',
      default: './dist/log.js',
    })
    expect(pkg.typesVersions['*'].log).toEqual(['./dist/log.d.ts'])
  })

  it("goes to Nest's logger with the class as context when LOGGING_ENGINE=legacy", () => {
    const { lines } = captureLogger()
    const calls: unknown[][] = []
    const legacy: LoggerService = {
      log: (...args) => calls.push(['log', ...args]),
      error: (...args) => calls.push(['error', ...args]),
      warn: (...args) => calls.push(['warn', ...args]),
    }
    Logger.overrideLogger(legacy)
    process.env.LOGGING_ENGINE = 'legacy'
    new ExamEvaluationService().paid('ORD-1')
    expect(calls).toEqual([
      ['log', 'Order paid', 'ORD-1', 'ExamEvaluationService'],
    ])
    expect(lines).toEqual([])
  })
})
