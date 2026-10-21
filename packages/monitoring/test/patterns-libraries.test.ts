import { AxiosError } from 'axios'
import { ReplyError } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serializeError } from '../src/errors/error-serializer'
import { lookupHint } from '../src/errors/hints'
import { registerTypeormSchema, resetSchema } from '../src/errors/schema'
import { captureLogger, lastLine } from './helpers'

beforeAll(() =>
  registerTypeormSchema({
    entityMetadatas: [
      {
        name: 'EnrollmentEntity',
        tableName: 'enrollment',
        columns: [{ databaseName: 'student_id', propertyPath: 'studentId' }],
        uniques: [
          { name: 'UQ_ENROLL', columns: [{ propertyPath: 'studentId' }] },
        ],
        indices: [],
        foreignKeys: [],
        relations: [],
      },
    ],
  }),
)
afterAll(() => resetSchema())

function logged(error: unknown): Record<string, any> {
  const { logger, lines } = captureLogger()
  logger.error('failed', error)
  return lastLine(lines)
}

describe('adapters added for the wider pattern table', () => {
  it('fetch: lifts the code and cause out of "fetch failed"', () => {
    const cause = Object.assign(
      new Error('connect ECONNREFUSED 10.0.0.9:443'),
      {
        code: 'ECONNREFUSED',
      },
    )
    const error = Object.assign(new TypeError('fetch failed'), { cause })
    expect(serializeError(error)).toMatchObject({
      type: 'TypeError',
      code: 'ECONNREFUSED',
      dependency: 'http',
      cause: { code: 'ECONNREFUSED' },
    })
    expect(lookupHint({ code: 'ECONNREFUSED', dependency: 'http' })?.hint).toBe(
      '"{name}" API unreachable'.replace('{name}', 'http'),
    )
  })

  it('fetch: undici timeout codes get their own hint', () => {
    const cause = Object.assign(new Error('Connect Timeout Error'), {
      code: 'UND_ERR_CONNECT_TIMEOUT',
    })
    const line = logged(Object.assign(new TypeError('fetch failed'), { cause }))
    expect(line['error.code']).toBe('UND_ERR_CONNECT_TIMEOUT')
    expect(line['error.hint']).toBe('Connect timed out')
  })

  it('body-parser: uses error.type as the code and keeps the status', () => {
    const error = Object.assign(new Error('request entity too large'), {
      name: 'PayloadTooLargeError',
      type: 'entity.too.large',
      status: 413,
      statusCode: 413,
      expose: true,
    })
    expect(serializeError(error)).toMatchObject({
      code: 'entity.too.large',
      status: 413,
    })
    expect(lookupHint({ code: 'entity.too.large' })).toMatchObject({
      hint: 'Request body too large',
      level: 'warn',
    })
  })

  it('mongodb: numeric server codes become MONGO_<code>', () => {
    const error = Object.assign(
      new Error(
        'E11000 duplicate key error collection: app.users index: email_1 dup key',
      ),
      { name: 'MongoServerError', code: 11000 },
    )
    expect(serializeError(error).code).toBe('MONGO_11000')
    expect(
      lookupHint({ code: 'MONGO_11000', message: error.message }),
    ).toMatchObject({ hint: 'Duplicate record', target: 'email_1' })
  })

  it('typeorm: a pg QueryFailedError keeps the SQLSTATE and no oracle dependency', () => {
    const driverError = Object.assign(
      new Error('duplicate key value violates unique constraint "UQ_ENROLL"'),
      { code: '23505', constraint: 'UQ_ENROLL', table: 'enrollment' },
    )
    const error = Object.assign(new Error(driverError.message), {
      name: 'QueryFailedError',
      driverError,
      code: '23505',
    })
    const out = serializeError(error)
    expect(out.code).toBe('23505')
    expect(out.dependency).toBeUndefined()
    const line = logged(error)
    expect(line['error.hint']).toBe('Duplicate record')
    expect(line.labels.error_target).toBe('enrollment.UQ_ENROLL')
  })

  it('nodemailer: ETLS is an SMTP code', () => {
    const error = Object.assign(new Error('Unexpected socket close'), {
      code: 'ETLS',
      command: 'CONN',
    })
    expect(serializeError(error)).toMatchObject({
      code: 'ETLS',
      dependency: 'smtp',
    })
    expect(lookupHint({ code: 'ETLS', dependency: 'smtp' })?.hint).toBe(
      'SMTP TLS failed',
    )
  })

  it('amqplib: "Operation failed" and handshake messages carry the reply code', () => {
    const error = Object.assign(
      new Error(
        "Operation failed: QueueDeclare; 406 (PRECONDITION-FAILED) with message \"PRECONDITION_FAILED - inequivalent arg 'x-dead-letter-exchange' for queue 'exam.grade' in vhost '/'\"",
      ),
      { code: 406, classId: 50, methodId: 10 },
    )
    const line = logged(error)
    expect(line['error.code']).toBe('AMQP_406')
    expect(line.labels.error_target).toBe('queue exam.grade')
    expect(line['error.fix']).toContain('x-dead-letter-exchange')
  })
})

describe('explain for the new patterns', () => {
  it('axios 4xx: names the status the API answered', () => {
    const error = new AxiosError(
      'Request failed with status code 404',
      'ERR_BAD_REQUEST',
      {
        url: 'https://partner.example.com/v1/users/1',
        headers: {} as any,
      } as any,
    )
    ;(error as any).response = { status: 404, data: {} }
    const line = logged(error)
    expect(line['error.code']).toBe('ERR_BAD_REQUEST')
    expect(line.labels.error_target).toBe('HTTP 404')
    expect(line['error.fix']).toContain('404')
    expect(JSON.stringify(line)).not.toContain('/v1/users/1')
  })

  it('Nest DI: names the consumer, the missing provider and the module', () => {
    const line = logged(
      new Error(
        "Nest can't resolve dependencies of the ExamService (ExamRepository, ?). Please make sure that the argument CacheService at index [1] is available in the ExamModule context.",
      ),
    )
    expect(line['error.code']).toBe('NEST_UNRESOLVED_DEPENDENCY')
    expect(line.labels.error_target).toBe('ExamService ← CacheService')
    expect(line['error.fix']).toContain('ExamModule')
  })

  it('Redis ERR: tells max clients from a generic reply', () => {
    const error = new ReplyError('ERR max number of clients reached')
    ;(error as any).command = { name: 'get', args: ['exam:123:state'] }
    const line = logged(error)
    expect(line['error.code']).toBe('ERR')
    expect(line.labels.error_target).toBe('GET exam:*:state')
    expect(line['error.fix']).toContain('too many clients')
  })

  it('BullMQ: job not in state names the command and the expected state', () => {
    const line = logged(
      new Error('Job 42 is not in the active state. moveToFinished'),
    )
    expect(line['error.code']).toBe('BULLMQ_JOB_NOT_IN_STATE')
    expect(line.labels.error_target).toBe('moveToFinished needs active')
  })

  it('JWT: the message says which check failed', () => {
    const error = Object.assign(new Error('invalid signature'), {
      name: 'JsonWebTokenError',
    })
    const line = logged(error)
    expect(line['error.hint']).toBe('Invalid token')
    expect(line.labels.error_target).toBe('signature')
    expect(line['error.fix']).toContain('JWT_SECRET')
  })

  it('Node: ERR_INVALID_ARG_TYPE names the argument and the received type', () => {
    const error = Object.assign(
      new TypeError(
        'The "path" argument must be of type string or an instance of Buffer or URL. Received undefined',
      ),
      { code: 'ERR_INVALID_ARG_TYPE' },
    )
    const line = logged(error)
    expect(line.labels.error_target).toBe('path')
    expect(line['error.fix']).toContain(
      'Received undefined'.replace('Received ', 'was '),
    )
  })

  it('Oracle: a RAISE_APPLICATION_ERROR code falls back to the message pattern', () => {
    const error = Object.assign(
      new Error('ORA-20001: Student already enrolled'),
      {
        errorNum: 20001,
      },
    )
    const line = logged(error)
    expect(line['error.code']).toBe('ORA-20001')
    expect(line['error.hint']).toBe('PL/SQL raised an error')
    expect(line.labels.error_target).toBe('ORA-20001')
  })

  it('TLS: certificate codes are config problems', () => {
    expect(lookupHint({ code: 'CERT_HAS_EXPIRED' })).toMatchObject({
      hint: 'Certificate expired',
      category: 'config',
    })
    expect(
      lookupHint({ code: 'SELF_SIGNED_CERT_IN_CHAIN' })?.hintDetail,
    ).toContain('NODE_EXTRA_CA_CERTS')
  })

  it('Kafka: protocol error types and client messages both resolve', () => {
    expect(
      lookupHint({ code: 'TOPIC_AUTHORIZATION_FAILED', dependency: 'kafka' }),
    ).toMatchObject({ category: 'config' })
    expect(
      lookupHint({
        code: 'KafkaJSError',
        dependency: 'kafka',
        message: 'The producer is disconnected',
      })?.fix,
    ).toContain('connect()')
  })
})
