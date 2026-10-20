import { SpanKind, SpanStatusCode } from '@opentelemetry/api'
import { describe, expect, it } from 'vitest'
import { FailedStepSpanProcessor } from '../src/integrations/failed-step'
import { newScope, runInScope } from '../src/logger/context'
import { formatPretty } from '../src/logger/pretty'
import {
  currentUsecase,
  installCqrsWatch,
  runUsecase,
} from '../src/logger/usecase'
import { captureLogger, lastLine } from './helpers'

const cwd = process.cwd()

function handlerError(): TypeError {
  const error = new TypeError(
    "Cannot read properties of undefined (reading 'id')",
  )
  error.stack = [
    "TypeError: Cannot read properties of undefined (reading 'id')",
    `    at GetMyQuestionsHandler.execute (${cwd}/dist/src/domain/question-bank/get-my-questions.handler.js:31:27)`,
    `    at QueryBus.execute (${cwd}/node_modules/@nestjs/cqrs/dist/query-bus.js:70:22)`,
  ].join('\n')
  return error
}

const request = {
  method: 'GET',
  originalUrl: '/question-bank/my?statuses=DRAFT',
  route: { path: '/question-bank/my' },
}

describe('where an error happened', () => {
  it('names request, use case, function, file, target and category', async () => {
    const { logger, lines } = captureLogger()
    await runInScope(newScope(request), async () => {
      let caught: unknown
      try {
        await runUsecase('GetMyQuestionsQuery', async () => {
          throw handlerError()
        })
      } catch (error) {
        caught = error
      }
      // The exception filter logs after the use case has ended.
      expect(currentUsecase()).toBeUndefined()
      logger.error('Cannot read properties of undefined', { err: caught })
    })

    const line = lastLine(lines)
    expect(line).toMatchObject({
      'log.logger': 'GetMyQuestionsHandler',
      'log.origin.function': 'GetMyQuestionsHandler.execute',
      'log.origin.file.name':
        'src/domain/question-bank/get-my-questions.handler.ts',
      'http.request.method': 'GET',
      'http.route': '/question-bank/my',
      'url.path': '/question-bank/my',
      'error.type': 'TypeError',
      'error.code': 'NULL_READ',
      'error.hint': 'Read from undefined value',
      labels: {
        usecase: 'GetMyQuestionsQuery',
        error_category: 'bug',
        error_target: 'id',
      },
    })
    expect(line['error.location']).toBeUndefined()

    const text = formatPretty(line)
    expect(text.split('\n')[0]).toContain(
      'read from undefined value   method=GET path=/question-bank/my file=src/domain/question-bank/get-my-questions.handler.ts target=id',
    )
    expect(text).not.toMatch(/\.ts:\d/)
  })

  it('keeps the innermost use case when a command runs a query', async () => {
    const { logger, lines } = captureLogger()
    try {
      await runUsecase('CreateExamCommand', () =>
        runUsecase('GetExamQuery', async () => {
          throw new Error('boom')
        }),
      )
    } catch (error) {
      logger.error('failed', error)
    }
    expect(lastLine(lines).labels).toMatchObject({ usecase: 'GetExamQuery' })
  })

  it('labels every line written inside a use case', async () => {
    const { logger, lines } = captureLogger()
    await runUsecase('GetMyQuestionsQuery', async () => {
      logger.log('loading')
    })
    expect(lastLine(lines).labels).toMatchObject({
      usecase: 'GetMyQuestionsQuery',
    })
  })

  it('reads the constraint of an Oracle error as the target', () => {
    const { logger, lines } = captureLogger()
    logger.error(
      'Insert failed',
      Object.assign(
        new Error(
          'ORA-00001: unique constraint (APP.UQ_QUESTION_CODE) violated',
        ),
        { errorNum: 1 },
      ),
    )
    expect(lastLine(lines)).toMatchObject({
      'error.code': 'ORA-00001',
      labels: { error_category: 'data', error_target: 'UQ_QUESTION_CODE' },
    })
  })

  it('drops an error.code that only repeats the type', () => {
    const { logger, lines } = captureLogger()
    logger.error('odd', new RangeError('Some range problem'))
    expect(lastLine(lines)['error.type']).toBe('RangeError')
    expect(lastLine(lines)['error.code']).toBeUndefined()
  })
})

describe('installCqrsWatch', () => {
  it('runs each query as a use case named after its class', async () => {
    class QueryBus {
      async execute(query: unknown) {
        return { query, usecase: currentUsecase() }
      }
    }
    class GetMyQuestionsQuery {}
    installCqrsWatch({ QueryBus })
    installCqrsWatch({ QueryBus }) // idempotent

    const result = await new QueryBus().execute(new GetMyQuestionsQuery())
    expect(result.usecase).toBe('GetMyQuestionsQuery')
  })
})

describe('FailedStepSpanProcessor', () => {
  const span = (
    name: string,
    status: SpanStatusCode,
    start: number,
    kind = SpanKind.CLIENT,
  ) => ({
    name,
    kind,
    status: { code: status },
    startTime: [start, 0] as [number, number],
    endTime: [start + 1, 0] as [number, number],
  })

  it('reports the failed call, and forgets it once later work succeeds', () => {
    const processor = new FailedStepSpanProcessor()
    const scope = newScope()
    runInScope(scope, () => {
      processor.onEnd(
        span('oracle INSERT QUESTION_BANK', SpanStatusCode.ERROR, 10),
      )
      // The request's own span is not a step.
      processor.onEnd(span('GET /x', SpanStatusCode.ERROR, 1, SpanKind.SERVER))
      // A parent that started before the failure does not clear it.
      processor.onEnd(span('redis GET', SpanStatusCode.OK, 5))
    })
    expect(scope.failedStep?.name).toBe('oracle INSERT QUESTION_BANK')

    const { logger, lines } = captureLogger()
    runInScope(scope, () => logger.error('failed', new Error('x')))
    expect(lastLine(lines).labels).toMatchObject({
      failed_step: 'oracle INSERT QUESTION_BANK',
    })

    runInScope(scope, () =>
      processor.onEnd(span('oracle SELECT', SpanStatusCode.OK, 20)),
    )
    expect(scope.failedStep).toBeUndefined()
  })
})
