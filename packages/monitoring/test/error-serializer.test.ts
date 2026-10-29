import { BadRequestException, NotFoundException } from '@nestjs/common'
import { AxiosError } from 'axios'
import { ReplyError } from 'ioredis'
import { KafkaJSConnectionError, KafkaJSProtocolError } from 'kafkajs'
import { describe, expect, it } from 'vitest'
import { AppError } from '../src/errors/app-error'
import { ErrorCode } from '../src/errors/error-codes'
import { serializeError } from '../src/errors/error-serializer'
import { originOf, sourcePath } from '../src/errors/origin'

// Shapes copied from real errors of libraries the lib does not depend on.
function oracleDriverError() {
  return Object.assign(
    new Error('ORA-00001: unique constraint (APP.UQ_ENROLL) violated'),
    {
      errorNum: 1,
      code: 'ORA-00001',
      offset: 0,
    },
  )
}

function typeormQueryFailed() {
  const driverError = oracleDriverError()
  return Object.assign(new Error(driverError.message), {
    name: 'QueryFailedError',
    query: 'INSERT INTO "STUDENT" ("CITIZEN_ID") VALUES (:1)',
    parameters: ['1101500001219'],
    driverError,
    code: 'ORA-00001',
    errorNum: 1,
  })
}

describe('serializeError adapters', () => {
  it('oracle: code from TypeORM QueryFailedError without query or parameters', () => {
    const out = serializeError(typeormQueryFailed())
    expect(out).toMatchObject({
      type: 'QueryFailedError',
      code: 'ORA-00001',
      dependency: 'oracle',
    })
    expect(JSON.stringify(out)).not.toContain('1101500001219')
    expect(JSON.stringify(out)).not.toContain('INSERT INTO')
  })

  it('oracle: pads errorNum into ORA-xxxxx', () => {
    expect(
      serializeError(Object.assign(new Error('x'), { errorNum: 60 })).code,
    ).toBe('ORA-00060')
  })

  it('oracle: thin driver NJS codes', () => {
    expect(
      serializeError(
        Object.assign(
          new Error('NJS-500: connection to the Oracle Database was broken'),
          { code: 'NJS-500' },
        ),
      ).code,
    ).toBe('NJS-500')
  })

  it('ioredis ReplyError: first word of the reply', () => {
    expect(
      serializeError(new ReplyError('NOAUTH Authentication required.')),
    ).toMatchObject({ code: 'NOAUTH', dependency: 'redis' })
  })

  it('kafkajs: protocol type, else class name', () => {
    const protocol = new KafkaJSProtocolError({
      type: 'REBALANCE_IN_PROGRESS',
      code: 27,
      retriable: true,
      message: 'rebalancing',
    } as any)
    expect(serializeError(protocol)).toMatchObject({
      code: 'REBALANCE_IN_PROGRESS',
      dependency: 'kafka',
    })
    expect(
      serializeError(
        new KafkaJSConnectionError('Connection error: ECONNREFUSED'),
      ).code,
    ).toBe('KafkaJSConnectionError')
  })

  it('axios: code, status and host only — never headers', () => {
    const error = new AxiosError(
      'Request failed with status code 401',
      'ERR_BAD_REQUEST',
      {
        url: '/token?code=secret',
        baseURL: 'https://imauth.example.go.th',
        headers: { Authorization: 'Bearer super-secret' } as any,
        data: '{"password":"x"}',
      } as any,
      undefined,
      {
        status: 401,
        data: {},
        headers: {},
        statusText: 'Unauthorized',
        config: {} as any,
      },
    )
    const out = serializeError(error)
    expect(out).toMatchObject({
      code: 'ERR_BAD_REQUEST',
      status: 401,
      dependency: 'http',
      domain: 'imauth.example.go.th',
    })
    expect(JSON.stringify(out)).not.toContain('super-secret')
  })

  it('gaxios (Google): reason from the error body', () => {
    const error = Object.assign(new Error('Rate Limit Exceeded'), {
      config: { url: 'https://www.googleapis.com/drive/v3/files' },
      response: {
        status: 403,
        data: { error: { errors: [{ reason: 'rateLimitExceeded' }] } },
      },
    })
    expect(serializeError(error)).toMatchObject({
      code: 'rateLimitExceeded',
      status: 403,
      dependency: 'google',
    })
  })

  it('aws-sdk: error name and status', () => {
    const error = Object.assign(
      new Error('The specified key does not exist.'),
      { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } },
    )
    expect(serializeError(error)).toMatchObject({
      code: 'NoSuchKey',
      status: 404,
      dependency: 's3',
    })
  })

  it('amqplib: close code', () => {
    const error = Object.assign(
      new Error(
        'Channel closed by server: 406 (PRECONDITION-FAILED) with message "inequivalent arg"',
      ),
      { code: 406, classId: 50 },
    )
    expect(serializeError(error)).toMatchObject({
      code: 'AMQP_406',
      dependency: 'rabbitmq',
    })
  })

  it('nodemailer: SMTP code, or reply code', () => {
    expect(
      serializeError(
        Object.assign(new Error('Invalid login'), {
          code: 'EAUTH',
          responseCode: 535,
          command: 'AUTH PLAIN',
        }),
      ).code,
    ).toBe('EAUTH')
    expect(
      serializeError(
        Object.assign(new Error('Mailbox unavailable'), {
          code: 'EENVELOPE2',
          responseCode: 550,
          command: 'RCPT TO',
        }),
      ).code,
    ).toBe('SMTP_550')
  })

  it('nest: HTTP_<status>, or the errorCode', () => {
    expect(serializeError(new NotFoundException('nope'))).toMatchObject({
      code: 'HTTP_404',
      status: 404,
    })
    expect(
      serializeError(
        new BadRequestException({ errorCode: 'FILE_EMPTY', message: 'x' }),
      ).code,
    ).toBe('FILE_EMPTY')
  })

  it('AggregateError: code of the first inner error', () => {
    const inner = Object.assign(
      new Error('connect ECONNREFUSED 10.0.0.1:6379'),
      { code: 'ECONNREFUSED' },
    )
    expect(serializeError(new AggregateError([inner, inner], '')).code).toBe(
      'ECONNREFUSED',
    )
  })

  it('non-Error throws', () => {
    expect(serializeError('boom')).toMatchObject({
      type: 'NonError',
      message: 'boom',
    })
    expect(serializeError({ a: 1 })).toMatchObject({
      type: 'NonError',
      message: '{"a":1}',
    })
  })

  it('AppError carries its own hint and cause chain (depth ≤ 3, no cycles)', () => {
    const root: any = new Error('root')
    root.cause = root
    const error = new AppError('SCORE_OUT_OF_RANGE', 'Score out of range', {
      hint: 'Score out of range',
      cause: root,
    })
    const out = serializeError(error)
    expect(out).toMatchObject({
      code: 'SCORE_OUT_OF_RANGE',
      hint: 'Score out of range',
      cause: { message: 'root' },
    })
    expect(out.cause?.cause).toBeUndefined()
  })
})

describe('originOf', () => {
  it('names the first function and file of our code, without a line', () => {
    const stack = [
      'Error: x',
      '    at Parser.parse (/app/node_modules/oracledb/lib/x.js:10:5)',
      '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
      `    at async ScoreRepository.classScores (${process.cwd()}/src/score.repository.ts:118:11)`,
    ].join('\n')
    expect(originOf(stack)).toEqual({
      function: 'ScoreRepository.classScores',
      file: 'src/score.repository.ts',
    })
  })

  it('maps compiled output back to the source file', () => {
    expect(
      sourcePath(
        '/prod/school-core-api/dist/src/domain/q/get.handler.js',
        '/prod/school-core-api',
      ),
    ).toBe('src/domain/q/get.handler.ts')
  })

  it('handles constructors and frames without a function name', () => {
    expect(
      originOf(
        `Error: x\n    at new ScoreService (${process.cwd()}/src/a.ts:1:1)`,
      ),
    ).toEqual({ function: 'ScoreService.constructor', file: 'src/a.ts' })
    expect(originOf(`Error: x\n    at ${process.cwd()}/src/b.ts:2:3`)).toEqual({
      function: undefined,
      file: 'src/b.ts',
    })
  })

  it('returns nothing when every frame is a library', () => {
    expect(
      originOf('Error: x\n    at f (/app/node_modules/typeorm/q.js:1:1)'),
    ).toBeUndefined()
  })
})

describe('words carried by an error', () => {
  it('reads them from an AppError', () => {
    const err = new AppError(ErrorCode.redis.ECONNREFUSED, 'cache down', {
      howToFix: 'Start Redis.',
      category: 'config',
      level: 'warn',
      status: 503,
    })
    expect(serializeError(err)).toMatchObject({
      code: 'ECONNREFUSED',
      codeDependency: 'redis',
      howToFix: 'Start Redis.',
      category: 'config',
      level: 'warn',
      status: 503,
    })
  })

  it('ignores hint and detail on other errors (a Postgres error has both)', () => {
    const pg = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      hint: 'Try another value.',
      detail: 'Key (email)=(a@b.c) already exists.',
    })
    const serialized = serializeError(pg)
    expect(serialized.hint).toBeUndefined()
    expect(serialized.detail).toBeUndefined()
  })
})
