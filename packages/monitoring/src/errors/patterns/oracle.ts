import {
  constraintIn,
  constraintTarget,
  quotedColumn,
  quotedPath,
} from './explain-helpers'
import type { ErrorPattern } from './types'

// Codes referenced by school-core-api (oracle-error-code.ts, exception.filter.ts,
// repository comments) plus connection/pool errors of node-oracledb thin mode.
export const oraclePatterns: ErrorPattern[] = [
  {
    key: 'ORA-00001',
    hint: 'Duplicate record',
    hintDetail:
      'A unique constraint rejected the row. Often two concurrent requests inserted the same data, or the same request was sent twice.',
    level: 'warn',
    category: 'data',
    explain: ({ message, schema }) => {
      const name = constraintIn(message)
      const info = name ? schema.constraint(name) : undefined
      const target = constraintTarget(name, info)
      return {
        target,
        fix: info?.properties.length
          ? `${info.entity} already has a row with the same (${info.properties.join(', ')}). Check for an existing row first, or upsert.`
          : undefined,
      }
    },
  },
  {
    key: 'ORA-00054',
    hint: 'Row or table is locked',
    hintDetail:
      'Another session holds a lock and NOWAIT was used. Common during migrations or long transactions; retry after the other session commits.',
    retryable: true,
    category: 'data',
  },
  {
    key: 'ORA-30006',
    hint: 'Lock wait timed out',
    hintDetail:
      'SELECT ... FOR UPDATE WAIT gave up because another transaction kept the row locked. Usually load-related; retry or shorten the transaction.',
    retryable: true,
    category: 'data',
  },
  {
    key: 'ORA-00060',
    hint: 'DB deadlock',
    hintDetail:
      'Two transactions locked each other. Usually solved by retry; if frequent, make both code paths update rows in the same order.',
    retryable: true,
    category: 'data',
  },
  {
    key: 'ORA-01400',
    hint: 'Required column is null',
    hintDetail:
      'An insert left a NOT NULL column empty. Check the entity default and the request data that should fill it.',
    category: 'data',
    explain: ({ message, schema }) => {
      const target = quotedColumn(schema, message)
      return target
        ? {
            target,
            fix: `${target} was null on insert. Set it in the DTO/mapper, or give the column a default.`,
          }
        : undefined
    },
  },
  {
    key: 'ORA-01407',
    hint: 'Cannot set column to null',
    hintDetail:
      'An update tried to clear a NOT NULL column. Check the transformer or mapper that produced the null value.',
    category: 'data',
    explain: ({ message, schema }) => {
      const target = quotedColumn(schema, message)
      return target
        ? {
            target,
            fix: `An update set ${target} to null. Check the mapper or the partial update that produced it.`,
          }
        : undefined
    },
  },
  {
    key: 'ORA-02291',
    hint: 'Parent record not found',
    hintDetail:
      'A foreign key points to a row that does not exist. The referenced record may be deleted, or the id in the request is wrong.',
    level: 'warn',
    category: 'data',
    explain: ({ message, schema }) => {
      const name = constraintIn(message)
      const info = name ? schema.constraint(name) : undefined
      if (!info) return { target: name }
      const from = `${info.entity}.${info.properties.join(', ')}`
      return {
        target: from,
        fix: `${from} points to a ${info.referenced ?? 'record'} that does not exist: deleted, or a wrong id from the client.`,
      }
    },
  },
  {
    key: 'ORA-02292',
    hint: 'Record is still referenced',
    hintDetail:
      'Delete blocked because child rows still reference this record. Remove or reassign the children first.',
    level: 'warn',
    category: 'data',
    explain: ({ message, schema }) => {
      const name = constraintIn(message)
      const info = name ? schema.constraint(name) : undefined
      if (!info) return { target: name }
      return {
        target: `${info.entity}.${info.properties.join(', ')}`,
        fix: `This ${info.referenced ?? 'record'} is still referenced by ${info.entity}.${info.properties.join(', ')}. Delete or reassign those rows first.`,
      }
    },
  },
  {
    key: 'ORA-12899',
    hint: 'Value too long for column',
    hintDetail:
      'A text value exceeds the column size. Common in Excel imports; validate length before saving.',
    level: 'warn',
    category: 'data',
    explain: ({ message, schema }) => {
      const target = quotedColumn(schema, message)
      const sizes = message.match(/actual: (\d+), maximum: (\d+)/)
      if (!target) return undefined
      return {
        target,
        fix: sizes
          ? `${target} got ${sizes[1]} (max ${sizes[2]}). Validate the length in the DTO or import before saving.`
          : `${target} is too long. Validate the length before saving.`,
      }
    },
  },
  {
    key: 'ORA-01438',
    hint: 'Number too large for column',
    hintDetail:
      'A numeric value exceeds the column precision. Check the input range or the column definition.',
    category: 'data',
  },
  {
    key: 'ORA-01722',
    hint: 'Invalid number',
    hintDetail:
      'Oracle could not convert text to a number. Often bind parameters are in the wrong order or a string id was compared to a number column.',
    category: 'bug',
  },
  {
    key: 'ORA-01795',
    hint: 'IN list over 1000 items',
    hintDetail:
      'Oracle allows at most 1000 values in one IN list. Split the list into chunks (see oracle-in-list helper).',
    category: 'bug',
  },
  {
    key: 'ORA-00904',
    hint: 'Unknown column name',
    hintDetail:
      'The SQL references a column that does not exist. A migration may not have run, or the query uses a wrong alias.',
    category: 'bug',
    explain: ({ message, schema }) => {
      const path = quotedPath(message.split(':')[1] ?? message)
      const column = path[path.length - 1]
      if (!column) return undefined
      const owners = schema.columnOwners(column)
      const shown = path.join('.')
      return {
        target: shown,
        fix: owners.length
          ? `${owners.join(', ')} maps column ${column} but the database has none: a migration has not run in this environment.`
          : `No entity maps column ${column}: a typo or a wrong alias (${shown}) in the query.`,
      }
    },
  },
  {
    key: 'ORA-00936',
    hint: 'Malformed SQL expression',
    hintDetail:
      'The SQL is missing an expression, often an empty IN () list built from an empty array. Guard empty inputs before querying.',
    category: 'bug',
  },
  {
    key: 'ORA-00942',
    hint: 'Table or view not found',
    hintDetail:
      'The table does not exist or the schema user lacks access. Check that migrations ran and CURRENT_SCHEMA is set.',
    category: 'config',
  },
  {
    key: 'ORA-01013',
    hint: 'Query cancelled',
    hintDetail:
      'The query ran longer than the call timeout and was cancelled. Check query performance and indexes.',
  },
  {
    key: 'ORA-04068',
    hint: 'Package state discarded',
    hintDetail:
      'A PL/SQL package was recompiled while sessions held its state. Usually clears on retry after a deployment.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'ORA-01017',
    hint: 'Wrong DB username or password',
    hintDetail:
      'The database rejected the login. Check the DB username and password in env.',
    category: 'config',
  },
  {
    key: 'ORA-28001',
    hint: 'DB password expired',
    hintDetail:
      'The database account password has expired. Ask the DBA to reset it and update env.',
    category: 'config',
  },
  {
    key: 'ORA-12541',
    hint: 'Oracle listener unreachable',
    hintDetail:
      'Nothing answered at the DB host and port. Oracle may be down or restarting, or the connection string is wrong.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'ORA-12514',
    hint: 'Oracle service name unknown',
    hintDetail:
      'The listener is up but does not know the service name. Check the service name in the connection string.',
    category: 'config',
  },
  {
    key: 'ORA-12170',
    hint: 'Oracle connect timeout',
    hintDetail:
      'Connecting to the database timed out. The network or firewall may be blocking, or the DB host is overloaded.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'ORA-03113',
    hint: 'DB connection lost',
    hintDetail:
      'The database closed the connection mid-call (restart, idle timeout or network). The pool reconnects; retry the operation.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'ORA-03114',
    hint: 'DB connection lost',
    hintDetail:
      'The connection was already closed when the call started. The pool should replace it; retry the operation.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'ORA-03135',
    hint: 'DB connection lost',
    hintDetail:
      'The connection was dropped, often by a firewall closing idle sockets. Retry; if frequent, check pool idle settings.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'NJS-098',
    hint: 'Bind count mismatch',
    hintDetail:
      'The SQL and its bind values do not line up, often a bind name reused in positional mode. Use distinct bind names.',
    category: 'bug',
  },
  {
    key: 'NJS-040',
    hint: 'DB pool queue timed out',
    hintDetail:
      'Waited too long for a free DB connection. The pool is exhausted by slow queries or long transactions.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'NJS-076',
    hint: 'DB pool queue is full',
    hintDetail:
      'Too many requests are waiting for a DB connection. Check for slow queries or a burst of traffic.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'NJS-500',
    hint: 'DB connection dropped',
    hintDetail:
      'The connection to Oracle was closed unexpectedly. The database may have restarted or the network dropped.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'NJS-503',
    hint: 'Cannot connect to Oracle',
    hintDetail:
      'The driver could not open a connection. Oracle may be down, restarting, or the host/port in env is wrong.',
    retryable: true,
    category: 'dependency',
  },
  // Seen in repository comments and TypeORM-on-Oracle queries.
  {
    key: 'ORA-00932',
    hint: 'Incompatible SQL data types',
    hintDetail:
      'Two values of different types were compared or combined; with CLOB it means a CLOB used in WHERE, DISTINCT, ORDER BY or GROUP BY.',
    category: 'bug',
    explain: ({ message }) => {
      const types = message.match(/expected (\S+) got (\S+)/)
      if (!types) return undefined
      return {
        target: `${types[1]} vs ${types[2]}`,
        fix: /LOB/.test(message)
          ? 'A CLOB column is compared, sorted, grouped or DISTINCT-ed. Exclude it from that clause or use DBMS_LOB.SUBSTR.'
          : `The query compares ${types[1]} with ${types[2]}. Check bind types and column types.`,
      }
    },
  },
  {
    key: 'ORA-01791',
    hint: 'ORDER BY not in DISTINCT list',
    hintDetail:
      'With DISTINCT every ORDER BY column must be selected. Common with TypeORM skip/take + orderBy on a joined column: addSelect it.',
    category: 'bug',
  },
  {
    key: 'ORA-00918',
    hint: 'Ambiguous column in join',
    hintDetail:
      'A column name exists in several joined tables. Prefix it with the table alias in select, where or orderBy.',
    category: 'bug',
    explain: ({ message }) => {
      const column = quotedPath(message)[0]
      return column ? { target: column } : undefined
    },
  },
  {
    key: 'ORA-00979',
    hint: 'Column missing from GROUP BY',
    hintDetail:
      'A selected or ordered column is neither grouped nor aggregated. Add it to groupBy or wrap it in an aggregate.',
    category: 'bug',
  },
  {
    key: 'ORA-01427',
    hint: 'Subquery returned many rows',
    hintDetail:
      'A subquery used as a single value returned more than one row. Add a condition that makes it unique, or use IN / ROWNUM = 1.',
    category: 'data',
  },
  {
    key: 'ORA-30926',
    hint: 'MERGE source has duplicates',
    hintDetail:
      'Several source rows of a MERGE matched the same target row. Remove duplicate keys from the input before merging.',
    category: 'data',
  },
  {
    key: 'ORA-01861',
    hint: 'Date text in wrong format',
    hintDetail:
      'A date string does not match the TO_DATE format. Check the value format, and Buddhist vs Gregorian year conversion.',
    category: 'bug',
  },
  {
    key: 'ORA-01843',
    hint: 'Invalid month in date',
    hintDetail:
      'A date string has a month Oracle cannot read. Pass a Date object or an ISO string with an explicit format.',
    category: 'bug',
  },
  {
    key: 'ORA-01000',
    hint: 'Too many open DB cursors',
    hintDetail:
      'A session opened more cursors than allowed: a stream or query runner was not closed. Check release() in finally blocks.',
    category: 'bug',
  },
  {
    key: 'ORA-01408',
    hint: 'Column list already indexed',
    hintDetail:
      'A migration creates an index on columns that already have one (often from a constraint). Drop the duplicate index from the migration.',
    category: 'bug',
  },
  {
    key: 'ORA-00955',
    hint: 'DB object name already used',
    hintDetail:
      'A migration creates a table, index or sequence that already exists: it ran partially before. Check the migrations table and the schema.',
    category: 'bug',
  },
]
