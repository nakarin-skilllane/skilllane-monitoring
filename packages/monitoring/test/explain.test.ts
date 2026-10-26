import { BadRequestException } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { registerTypeormSchema, resetSchema } from '../src/errors/schema'
import { formatPretty } from '../src/logger/pretty'
import { captureLogger, lastLine } from './helpers'

// The shape of TypeORM's DataSource.entityMetadatas, as read by the library.
const dataSource = {
  entityMetadatas: [
    {
      name: 'QuestionBankEntity',
      tableName: 'question_bank',
      columns: [
        { databaseName: 'school_id', propertyPath: 'schoolId' },
        { databaseName: 'code', propertyPath: 'code' },
        { databaseName: 'title', propertyPath: 'title' },
      ],
      uniques: [
        {
          name: 'UQ_QUESTION_CODE',
          columns: [{ propertyPath: 'schoolId' }, { propertyPath: 'code' }],
        },
      ],
      indices: [],
      foreignKeys: [
        {
          name: 'FK_9aac039515e82d599e803f24c4b',
          columns: [{ propertyPath: 'schoolId' }],
          referencedEntityMetadata: { name: 'SchoolEntity' },
        },
      ],
      relations: [{ propertyName: 'school' }],
    },
  ],
}

beforeAll(() => registerTypeormSchema(dataSource))
afterAll(() => resetSchema())

/** A node-oracledb error as TypeORM rethrows it. */
function oracle(message: string): Error {
  const errorNum = Number(message.match(/ORA-(\d+)/)![1])
  return Object.assign(new Error(message), { errorNum })
}

function logged(error: unknown): Record<string, any> {
  const { logger, lines } = captureLogger()
  logger.error('failed', error)
  return lastLine(lines)
}

describe('Oracle: names mapped to Entity.property', () => {
  it('ORA-12899 gives the column, actual and maximum', () => {
    const line = logged(
      oracle(
        'ORA-12899: value too large for column "PROD_RE"."question_bank"."title" (actual: 312, maximum: 255)',
      ),
    )
    expect(line.labels.error_target).toBe('QuestionBankEntity.title')
    expect(line['error.fix']).toBe(
      'QuestionBankEntity.title got 312 (max 255). Validate the length in the DTO or import before saving.',
    )
  })

  it('ORA-01400 names the null column', () => {
    const line = logged(
      oracle(
        'ORA-01400: cannot insert NULL into ("PROD_RE"."question_bank"."school_id")',
      ),
    )
    expect(line.labels.error_target).toBe('QuestionBankEntity.schoolId')
  })

  it('ORA-00001 turns the constraint into entity + columns', () => {
    const line = logged(
      oracle(
        'ORA-00001: unique constraint (PROD_RE.UQ_QUESTION_CODE) violated',
      ),
    )
    expect(line.labels).toMatchObject({
      error_target: 'QuestionBankEntity(schoolId, code)',
      error_category: 'data',
    })
    expect(line['error.fix']).toContain('(schoolId, code)')
  })

  it('ORA-02291 resolves a TypeORM hash FK name', () => {
    const line = logged(
      oracle(
        'ORA-02291: integrity constraint (PROD_RE.FK_9aac039515e82d599e803f24c4b) violated - parent key not found',
      ),
    )
    expect(line.labels.error_target).toBe('QuestionBankEntity.schoolId')
    expect(line['error.fix']).toContain('SchoolEntity that does not exist')
  })

  it('ORA-02292 says who still references the record', () => {
    const line = logged(
      oracle(
        'ORA-02292: integrity constraint (PROD_RE.FK_9aac039515e82d599e803f24c4b) violated - child record found',
      ),
    )
    expect(line['error.fix']).toContain(
      'SchoolEntity is still referenced by QuestionBankEntity.schoolId',
    )
  })

  it('ORA-00904 tells a missing migration from a query typo', () => {
    expect(
      logged(oracle('ORA-00904: "Q"."SCHOOL_ID": invalid identifier'))[
        'error.fix'
      ],
    ).toContain('a migration has not run')
    expect(
      logged(oracle('ORA-00904: "Q"."SCHOLL_ID": invalid identifier'))[
        'error.fix'
      ],
    ).toContain('a typo or a wrong alias (Q.SCHOLL_ID)')
  })

  it('ORA-00932 recognises a CLOB in the wrong clause', () => {
    const line = logged(
      oracle('ORA-00932: inconsistent datatypes: expected - got CLOB'),
    )
    expect(line['error.fix']).toMatch(/^A CLOB column/)
  })

  it('falls back to the raw name without a schema', () => {
    resetSchema()
    const line = logged(
      oracle('ORA-00001: unique constraint (PROD_RE.UQ_OTHER) violated'),
    )
    expect(line.labels.error_target).toBe('UQ_OTHER')
    registerTypeormSchema(dataSource)
  })
})

describe('TypeORM', () => {
  it('EntityNotFoundError keeps criteria keys, never values', () => {
    const error = Object.assign(
      new Error(
        'Could not find any entity of type "QuestionBankEntity" matching: {\n    "id": 42,\n    "schoolId": "s-1"\n}',
      ),
      { name: 'EntityNotFoundError' },
    )
    const line = logged(error)
    expect(line['log.level']).toBe('warn')
    expect(line['error.fix']).toBe(
      'No QuestionBankEntity found by (id, schoolId). Check the id the client sent, or whether the row was deleted.',
    )
    expect(line['error.fix']).not.toContain('42')
  })

  it('names the empty criteria method', () => {
    const error = Object.assign(
      new Error('Empty criteria(s) are not allowed for the delete method.'),
      { name: 'TypeORMError' },
    )
    expect(logged(error)).toMatchObject({
      'error.code': 'TYPEORM_EMPTY_CRITERIA',
      labels: { error_target: 'delete' },
    })
  })
})

describe('runtime', () => {
  const typeError = (message: string) => logged(new TypeError(message))

  it('reading an array member means a missing list', () => {
    expect(
      typeError("Cannot read properties of undefined (reading 'map')")[
        'error.fix'
      ],
    ).toMatch(/^Expected an array/)
  })

  it('reading a relation name points at relation loading', () => {
    expect(
      typeError("Cannot read properties of undefined (reading 'school')")[
        'error.fix'
      ],
    ).toContain('relation of QuestionBankEntity')
  })

  it('destructuring names both the variable and the property', () => {
    const line = typeError(
      "Cannot destructure property 'items' of 'payload' as it is undefined.",
    )
    expect(line.labels.error_target).toBe('payload.items')
  })

  it('circular JSON names the object and the closing property', () => {
    const line = typeError(
      "Converting circular structure to JSON\n    --> starting at object with constructor 'ExamEntity'\n    |     property 'questions' -> object with constructor 'Array'\n    --- property 'exam' closes the circle",
    )
    expect(line.labels.error_target).toBe('ExamEntity.exam')
  })
})

describe('Redis', () => {
  it('WRONGTYPE names the command and the key shape without ids', () => {
    const error = Object.assign(
      new Error(
        'WRONGTYPE Operation against a key holding the wrong kind of value',
      ),
      {
        name: 'ReplyError',
        command: { name: 'hget', args: ['exam:12345:state', 'field'] },
      },
    )
    expect(logged(error).labels.error_target).toBe('HGET exam:*:state')
  })
})

describe('validation 400', () => {
  it('lists the rejected fields, not their values', () => {
    const error = new BadRequestException({
      message: [
        'statuses must be one of the following values: DRAFT, PUBLISHED',
        'items.0.score must not be greater than 100',
        'items.1.score must not be greater than 100',
      ],
      error: 'Bad Request',
    })
    const line = logged(error)
    expect(line['log.level']).toBe('warn')
    expect(line.labels.error_target).toBe('statuses, items.*.score')
  })
})

describe('pretty', () => {
  it('shows the specific fix under the headline', () => {
    const line = logged(
      oracle(
        'ORA-12899: value too large for column "PROD_RE"."question_bank"."title" (actual: 312, maximum: 255)',
      ),
    )
    const [, where, detail] = formatPretty(line).split('\n')
    expect(where).toContain('target=QuestionBankEntity.title')
    expect(detail).toBe(
      '    error detail: QuestionBankEntity.title got 312 (max 255). Validate the length in the DTO or import before saving.',
    )
  })
})
