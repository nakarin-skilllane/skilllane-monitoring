import { Logger, NotFoundException } from '@nestjs/common'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { newScope, runInScope } from '../src/logger/context'
import { createJsonWriter } from '../src/logger/writer'
import { captureLogger, lastLine } from './helpers'

afterEach(() => {
  Logger.overrideLogger(false)
})

describe('AppLogger through the Nest Logger', () => {
  it('never loses the message nor replaces it with the class name', () => {
    const { logger, lines } = captureLogger()
    Logger.overrideLogger(logger)
    const nest = new Logger('ScoreService')
    const err = new Error(
      'ORA-01013: user requested cancel of current operation',
    )

    nest.log('Loaded report')
    nest.error(err)
    nest.error('Failed to load class report', err.stack)
    nest.error('Failed to load class report', err)

    expect(lines.map((l) => l.message)).toEqual([
      'Loaded report',
      'ORA-01013: user requested cancel of current operation',
      'Failed to load class report',
      'Failed to load class report',
    ])
    for (const line of lines) {
      expect(line['log.logger']).toBe('ScoreService')
      expect(line.message).not.toBe('ScoreService')
      expect(line.message).not.toBe('{}')
    }
    expect(lastLine(lines)).toMatchObject({
      'event.code': 'app.log',
      'log.level': 'error',
      'error.code': 'ORA-01013',
      'error.hint': 'Query cancelled',
      'service.name': 'test-api',
    })
  })

  it('downgrades a 4xx error line to warn', () => {
    const { logger, lines } = captureLogger()
    logger.error('Not found', new NotFoundException('missing'), 'Filter')
    expect(lastLine(lines)).toMatchObject({
      'log.level': 'warn',
      'error.code': 'HTTP_404',
    })
  })

  it('uses the developer hint over the table', () => {
    const { logger, lines } = captureLogger()
    logger.error(
      'Failed to import score row',
      {
        code: 'SCORE_OUT_OF_RANGE',
        hint: 'Score out of range',
        hintDetail: 'Max is 100',
      },
      'Import',
    )
    expect(lastLine(lines)).toMatchObject({
      'error.code': 'SCORE_OUT_OF_RANGE',
      'error.hint': 'Score out of range',
      'error.hint_detail': 'Max is 100',
    })
  })

  it('accepts catalog events and falls back to app.log for unknown ones', () => {
    const { logger, lines } = captureLogger({ devWarnings: true })
    logger.warn(
      'Authentication rejected',
      { event: 'auth.rejected', reason: 'token_expired' },
      'Auth',
    )
    expect(lastLine(lines)).toMatchObject({
      'event.code': 'auth.rejected',
      reason: 'token_expired',
    })
    logger.log('x', { event: 'made.up' }, 'Auth')
    expect(lines.some((l) => l['log.logger'] === '@skilllane/monitoring')).toBe(
      true,
    )
    expect(lastLine(lines)['event.code']).toBe('app.log')
  })

  it('filters by level', () => {
    const { logger, lines } = captureLogger({ level: 'warn' })
    logger.log('hidden')
    logger.debug('hidden')
    logger.warn('shown')
    expect(lines.map((l) => l.message)).toEqual(['shown'])
  })

  it('adds a correlation id, not a fake trace.id, when no span is active', () => {
    const { logger, lines } = captureLogger()
    const scope = newScope({ user: { id: 7 } })
    runInScope(scope, () => logger.log('in request'))
    expect(lastLine(lines)['trace.id']).toBeUndefined()
    expect(lastLine(lines).labels.correlation_id).toBe(scope.correlationId)
    expect(lastLine(lines)['user.id']).toBe('7')
  })

  it('truncates huge messages', () => {
    const { logger, lines } = captureLogger({ maxMessageLength: 10 })
    logger.log('x'.repeat(50))
    expect(lastLine(lines).message).toMatch(/^x{10}…\[truncated 40 chars\]$/)
  })

  it('writes library events with the catalog level and message', () => {
    const { logger, lines } = captureLogger()
    logger.event({
      event: 'dependency.up',
      logger: 'dep',
      fields: { 'dependency.type': 'redis', 'dependency.name': 'cache' },
    })
    expect(lastLine(lines)).toMatchObject({
      'log.level': 'info',
      message: 'Dependency is back up',
    })
  })
})

describe('JSON writer', () => {
  it('writes one valid JSON object per line, also for circular values', () => {
    const file = join(
      mkdtempSync(join(tmpdir(), 'skilllane-monitoring-log-')),
      'out.log',
    )
    const write = createJsonWriter(file)
    const cause: Record<string, unknown> = { message: 'root' }
    cause.self = cause
    write({ '@timestamp': 't', 'log.level': 'info', message: 'one' }, 'info')
    write({ message: 'two', 'error.cause': cause, n: BigInt(7) }, 'error')
    const lines = readFileSync(file, 'utf8').trimEnd().split('\n')
    expect(lines.map((line: string) => JSON.parse(line))).toEqual([
      { '@timestamp': 't', 'log.level': 'info', message: 'one' },
      {
        message: 'two',
        'error.cause': { message: 'root', self: '[Circular]' },
        n: '7',
      },
    ])
  })
})
