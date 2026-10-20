import type { ErrorPattern } from './types'

// TypeORM 0.3 errors, matched by class name (generic adapter) or message.
// school-core-api: findOneOrFail ×122, transactions/query runners ×318.
export const typeormPatterns: ErrorPattern[] = [
  {
    key: 'EntityNotFoundError',
    hint: 'Record not found',
    hintDetail:
      'findOneOrFail found no row. Usually a wrong or deleted id from the client; the filter answers 404.',
    level: 'warn',
    category: 'input',
    explain: ({ message }) => {
      const entity = message.match(/entity of type "([^"]+)"/)?.[1]
      if (!entity) return undefined
      // Criteria keys only; their values may be personal data.
      const keys = [
        ...new Set(
          [...message.matchAll(/"(\w+)"\s*:/g)].map((match) => match[1]),
        ),
      ]
      const by = keys.length ? ` by (${keys.join(', ')})` : ''
      return {
        target: entity,
        fix: `No ${entity} found${by}. Check the id the client sent, or whether the row was deleted.`,
      }
    },
  },
  {
    key: 'EntityPropertyNotFoundError',
    hint: 'Unknown entity property',
    hintDetail:
      'A where/order/select names a property the entity does not have: a typo, or a DB column name used instead of the property name.',
    category: 'bug',
    explain: ({ message }) => {
      const found = message.match(
        /Property "([^"]+)" was not found in "([^"]+)"/,
      )
      return found
        ? {
            target: `${found[2]}.${found[1]}`,
            fix: `${found[2]} has no property "${found[1]}". Use the entity property name, not the column name.`,
          }
        : undefined
    },
  },
  {
    key: 'EntityMetadataNotFoundError',
    hint: 'Entity not registered',
    hintDetail:
      'TypeORM has no metadata for this entity: it is missing from the entities list or TypeOrmModule.forFeature.',
    category: 'bug',
    target: /No metadata for "([^"]+)"/,
  },
  {
    key: 'QueryRunnerAlreadyReleasedError',
    hint: 'Query after transaction end',
    hintDetail:
      'A query ran on a released query runner: usually a missing await inside the transaction, or work left running after commit.',
    category: 'bug',
  },
  {
    key: 'TransactionNotStartedError',
    hint: 'Transaction not started',
    hintDetail:
      'commit/rollback was called without startTransaction, or twice. Check the try/catch/finally of the query runner.',
    category: 'bug',
  },
  {
    key: 'TransactionAlreadyStartedError',
    hint: 'Transaction already started',
    hintDetail:
      'startTransaction was called twice on one query runner. Nested work should reuse the manager, not start again.',
    category: 'bug',
  },
  {
    key: 'UpdateValuesMissingError',
    hint: 'Update with no values',
    hintDetail:
      'An update ran with an empty set of values, often a DTO whose fields were all undefined. Skip the update when nothing changed.',
    category: 'bug',
  },
  {
    key: 'CannotExecuteNotConnectedError',
    hint: 'DB not connected yet',
    hintDetail:
      'A query ran before the DataSource connected, or after it closed during shutdown.',
    category: 'dependency',
  },
  {
    key: 'TYPEORM_EMPTY_CRITERIA',
    messageMatch: /Empty criteria\(s\) are not allowed/,
    hint: 'Delete/update with no criteria',
    hintDetail:
      'delete/update was called with an empty id list or object. Guard empty input before calling it.',
    category: 'bug',
    explain: ({ message }) => {
      const method = message.match(/for the (\w+) method/)?.[1]
      return method
        ? {
            target: method,
            fix: `${method}() received empty criteria. Return early when the id list is empty.`,
          }
        : undefined
    },
  },
  {
    key: 'TYPEORM_MANY_TO_MANY_QUERY',
    messageMatch: /Cannot query across many-to-many for property/,
    hint: 'Where on many-to-many',
    hintDetail:
      'find() cannot filter by a many-to-many property. Use a QueryBuilder with a join.',
    category: 'bug',
    target: /for property (\S+)/,
  },
]
