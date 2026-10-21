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
  // --- more ORA- codes (Oracle Database Error Messages reference) ---
  {
    key: 'ORA-01403',
    dependency: 'oracle',
    hint: 'No data found',
    hintDetail:
      'A PL/SQL SELECT INTO returned no row. The id passed to the procedure does not exist.',
    level: 'warn',
  },
  {
    key: 'ORA-01422',
    dependency: 'oracle',
    hint: 'Query returned several rows',
    hintDetail:
      'A SELECT INTO (or exact fetch) got more than one row. The lookup key is not unique; add a filter.',
    category: 'bug',
  },
  {
    key: 'ORA-01476',
    dependency: 'oracle',
    hint: 'Division by zero',
    hintDetail: 'A divisor in the SQL is zero. Guard it with NULLIF(x, 0).',
    category: 'bug',
  },
  {
    key: 'ORA-01830',
    dependency: 'oracle',
    hint: 'Date format mismatch',
    hintDetail:
      'The date string has more characters than the format model consumed (a timestamp where a date format was given). Check TO_DATE format.',
    level: 'warn',
  },
  {
    key: 'ORA-01839',
    dependency: 'oracle',
    hint: 'Invalid day for month',
    hintDetail:
      'A date like 31 April or 30 February was given. Validate the day before the conversion.',
    level: 'warn',
  },
  {
    key: 'ORA-01840',
    dependency: 'oracle',
    hint: 'Date string too short',
    hintDetail:
      'The input is shorter than the TO_DATE format expects. Validate the date format.',
    level: 'warn',
  },
  {
    key: 'ORA-01841',
    dependency: 'oracle',
    hint: 'Year out of range',
    hintDetail:
      'The year must be between -4713 and +9999 and not 0. A Buddhist year (25xx) plus an offset, or an empty year.',
    level: 'warn',
  },
  {
    key: 'ORA-01847',
    dependency: 'oracle',
    hint: 'Invalid day of month',
    hintDetail: 'The day is outside 1-31 for TO_DATE. Validate the input.',
    level: 'warn',
  },
  {
    key: 'ORA-01858',
    dependency: 'oracle',
    hint: 'Non-numeric in date',
    hintDetail:
      'A non-numeric character appeared where TO_DATE expected a number. The input is not a date in the expected format.',
    level: 'warn',
  },
  {
    key: 'ORA-01873',
    dependency: 'oracle',
    hint: 'Interval precision too small',
    hintDetail:
      'An interval value exceeds its leading precision. Check the interval arithmetic.',
    category: 'bug',
  },
  {
    key: 'ORA-01882',
    dependency: 'oracle',
    hint: 'Time zone region unknown',
    hintDetail:
      'The client time zone (TZ env / sessionTimeZone) is not in the Oracle time zone file. Set TZ to a known region such as Asia/Bangkok.',
    category: 'config',
  },
  {
    key: 'ORA-01810',
    dependency: 'oracle',
    hint: 'Date format code repeated',
    hintDetail:
      'The TO_DATE/TO_CHAR format uses the same element twice (MM for minutes instead of MI).',
    category: 'bug',
  },
  {
    key: 'ORA-01821',
    dependency: 'oracle',
    hint: 'Date format unrecognized',
    hintDetail: 'The TO_DATE/TO_CHAR format model is invalid.',
    category: 'bug',
  },
  {
    key: 'ORA-00903',
    dependency: 'oracle',
    hint: 'Table name invalid',
    hintDetail:
      'The SQL names a table incorrectly (empty, quoted wrong, or a keyword). Usually a raw query with a template value missing.',
    category: 'bug',
  },
  {
    key: 'ORA-00907',
    dependency: 'oracle',
    hint: 'Missing right parenthesis',
    hintDetail:
      'The SQL has unbalanced parentheses, often a raw query with an empty IN () list or Oracle-unsupported syntax (LIMIT, AS on tables).',
    category: 'bug',
  },
  {
    key: 'ORA-00909',
    dependency: 'oracle',
    hint: 'Wrong argument count in SQL',
    hintDetail: 'A SQL function was called with the wrong number of arguments.',
    category: 'bug',
  },
  {
    key: 'ORA-00911',
    dependency: 'oracle',
    hint: 'Invalid character in SQL',
    hintDetail:
      'The SQL text contains a character Oracle does not accept: a trailing semicolon, a smart quote, or a name with a hyphen.',
    category: 'bug',
  },
  {
    key: 'ORA-00913',
    dependency: 'oracle',
    hint: 'Too many values',
    hintDetail:
      'An INSERT/subquery supplies more values than columns, or a comparison has mismatched tuple sizes.',
    category: 'bug',
  },
  {
    key: 'ORA-00917',
    dependency: 'oracle',
    hint: 'Missing comma in SQL',
    hintDetail:
      'The SQL is missing a comma, usually a raw query built by string concatenation.',
    category: 'bug',
  },
  {
    key: 'ORA-00920',
    dependency: 'oracle',
    hint: 'Invalid relational operator',
    hintDetail:
      'A WHERE clause has an invalid operator, often an empty IN () or "= undefined" from an unbound parameter.',
    category: 'bug',
  },
  {
    key: 'ORA-00923',
    dependency: 'oracle',
    hint: 'FROM keyword missing',
    hintDetail:
      'The SELECT list is malformed (an alias with AS before a table, a missing comma).',
    category: 'bug',
  },
  {
    key: 'ORA-00933',
    dependency: 'oracle',
    hint: 'SQL not properly ended',
    hintDetail:
      'Extra text after the statement: a trailing semicolon, LIMIT/OFFSET (not Oracle syntax), or a JOIN in an UPDATE.',
    category: 'bug',
  },
  {
    key: 'ORA-00934',
    dependency: 'oracle',
    hint: 'Group function misplaced',
    hintDetail: 'An aggregate (COUNT, SUM) is used in WHERE instead of HAVING.',
    category: 'bug',
  },
  {
    key: 'ORA-00937',
    dependency: 'oracle',
    hint: 'Not a single-group function',
    hintDetail:
      'The SELECT mixes aggregates with non-aggregated columns without GROUP BY.',
    category: 'bug',
  },
  {
    key: 'ORA-00947',
    dependency: 'oracle',
    hint: 'Not enough values',
    hintDetail: 'An INSERT supplies fewer values than columns.',
    category: 'bug',
  },
  {
    key: 'ORA-00957',
    dependency: 'oracle',
    hint: 'Duplicate column name',
    hintDetail:
      'The same column appears twice in an INSERT/UPDATE list, often from a DTO mapped twice.',
    category: 'bug',
  },
  {
    key: 'ORA-00972',
    dependency: 'oracle',
    hint: 'Identifier too long',
    hintDetail:
      'A column, alias or constraint name exceeds 30 characters (pre-12.2) or 128. Shorten the generated alias.',
    category: 'bug',
  },
  {
    key: 'ORA-00984',
    dependency: 'oracle',
    hint: 'Column not allowed here',
    hintDetail:
      'A column name appears in a VALUES list, usually an unquoted string value in a raw INSERT.',
    category: 'bug',
  },
  {
    key: 'ORA-00997',
    dependency: 'oracle',
    hint: 'LONG column misused',
    hintDetail:
      'A LONG column was used in a WHERE/GROUP BY/CTAS. Convert the column to CLOB.',
    category: 'bug',
  },
  {
    key: 'ORA-01002',
    dependency: 'oracle',
    hint: 'Fetch out of sequence',
    hintDetail:
      'A cursor was fetched after it closed (a COMMIT inside a FOR UPDATE loop, or a ResultSet used after the connection was released).',
    category: 'bug',
  },
  {
    key: 'ORA-01031',
    dependency: 'oracle',
    hint: 'DB privilege missing',
    hintDetail:
      'The DB user lacks the privilege for this operation (CREATE, ALTER, a grant on another schema). Ask the DBA.',
    category: 'config',
  },
  {
    key: 'ORA-01033',
    dependency: 'oracle',
    hint: 'Oracle starting or stopping',
    hintDetail:
      'The database is being started or shut down. Retry in a minute.',
    retryable: true,
  },
  {
    key: 'ORA-01034',
    dependency: 'oracle',
    hint: 'Oracle not available',
    hintDetail: 'The instance is down. Alert the DBA; retry when it is back.',
    retryable: true,
  },
  {
    key: 'ORA-01089',
    dependency: 'oracle',
    hint: 'Oracle shutting down',
    hintDetail:
      'An immediate shutdown is in progress. Reconnect once the database is back.',
    retryable: true,
  },
  {
    key: 'ORA-01092',
    dependency: 'oracle',
    hint: 'Oracle instance terminated',
    hintDetail:
      'The instance terminated and disconnected the session. Reconnect once it is back.',
    retryable: true,
  },
  {
    key: 'ORA-01109',
    dependency: 'oracle',
    hint: 'Database not open',
    hintDetail:
      'The database is mounted but not open (restore, maintenance). Retry later.',
    retryable: true,
  },
  {
    key: 'ORA-01401',
    dependency: 'oracle',
    hint: 'Value too long',
    hintDetail:
      'An inserted value is larger than the column (older message form of ORA-12899). Validate the length.',
    level: 'warn',
  },
  {
    key: 'ORA-01405',
    dependency: 'oracle',
    hint: 'NULL fetched into non-null',
    hintDetail:
      'A NULL column was fetched into a variable without an indicator. Driver/host variable issue.',
    category: 'bug',
  },
  {
    key: 'ORA-01410',
    dependency: 'oracle',
    hint: 'Invalid ROWID',
    hintDetail:
      'A ROWID that no longer exists was used (the row was deleted or the table rebuilt).',
    category: 'data',
  },
  {
    key: 'ORA-01430',
    dependency: 'oracle',
    hint: 'Column already exists',
    hintDetail:
      'ALTER TABLE ADD for an existing column. A migration ran twice.',
    category: 'config',
  },
  {
    key: 'ORA-01435',
    dependency: 'oracle',
    hint: 'Schema does not exist',
    hintDetail:
      'The user/schema named in the query does not exist. Check the schema prefix and the DB env.',
    category: 'config',
  },
  {
    key: 'ORA-01436',
    dependency: 'oracle',
    hint: 'CONNECT BY loop',
    hintDetail:
      'A hierarchical query met a cycle in the data (a node whose parent chain returns to itself). Use NOCYCLE or fix the rows.',
    category: 'data',
  },
  {
    key: 'ORA-01439',
    dependency: 'oracle',
    hint: 'Column must be empty',
    hintDetail:
      'ALTER TABLE MODIFY datatype needs an empty column. The migration must copy the data first.',
    category: 'config',
  },
  {
    key: 'ORA-01450',
    dependency: 'oracle',
    hint: 'Index key too long',
    hintDetail:
      'The index key exceeds the maximum length for the block size. Shorten the indexed columns.',
    category: 'config',
  },
  {
    key: 'ORA-01451',
    dependency: 'oracle',
    hint: 'Column already nullable',
    hintDetail:
      'ALTER TABLE MODIFY NULL on a column that is already nullable. A migration ran twice.',
    category: 'config',
  },
  {
    key: 'ORA-01452',
    dependency: 'oracle',
    hint: 'Duplicate keys for unique',
    hintDetail:
      'CREATE UNIQUE INDEX found duplicate values already in the table. Clean the duplicates before the migration.',
    category: 'data',
  },
  {
    key: 'ORA-01453',
    dependency: 'oracle',
    hint: 'SET TRANSACTION too late',
    hintDetail:
      'SET TRANSACTION must be the first statement of the transaction. Check the isolation level setup.',
    category: 'bug',
  },
  {
    key: 'ORA-01481',
    dependency: 'oracle',
    hint: 'Invalid number format',
    hintDetail: 'The TO_NUMBER/TO_CHAR format model is invalid.',
    category: 'bug',
  },
  {
    key: 'ORA-01555',
    dependency: 'oracle',
    hint: 'Snapshot too old',
    hintDetail:
      'A long-running query needed undo data that was overwritten. The query or export ran too long; split it or ask the DBA about undo retention.',
    retryable: true,
  },
  {
    key: 'ORA-01652',
    dependency: 'oracle',
    hint: 'TEMP tablespace full',
    hintDetail:
      'A sort/hash join exhausted the TEMP tablespace. The query sorts too much data; add an index or split the work. The DBA can grow TEMP.',
    category: 'dependency',
  },
  {
    key: 'ORA-01653',
    dependency: 'oracle',
    hint: 'Tablespace full (table)',
    hintDetail:
      'A table cannot extend: the tablespace is full. Ask the DBA to add a datafile.',
    category: 'dependency',
  },
  {
    key: 'ORA-01654',
    dependency: 'oracle',
    hint: 'Tablespace full (index)',
    hintDetail:
      'An index cannot extend: the tablespace is full. Ask the DBA to add a datafile.',
    category: 'dependency',
  },
  {
    key: 'ORA-01658',
    dependency: 'oracle',
    hint: 'Tablespace full (segment)',
    hintDetail:
      'A new segment cannot be created: the tablespace is full. Ask the DBA.',
    category: 'dependency',
  },
  {
    key: 'ORA-01720',
    dependency: 'oracle',
    hint: 'Grant option missing',
    hintDetail:
      'Creating a view over another schema table needs the GRANT OPTION. Ask the DBA.',
    category: 'config',
  },
  {
    key: 'ORA-01723',
    dependency: 'oracle',
    hint: 'Zero-length column',
    hintDetail:
      'A CTAS/ALTER produced a column with no length (CAST of NULL). Specify the type.',
    category: 'bug',
  },
  {
    key: 'ORA-01732',
    dependency: 'oracle',
    hint: 'View not updatable',
    hintDetail:
      'An INSERT/UPDATE/DELETE hit a view that cannot be modified (joins, aggregates). Write to the base table.',
    category: 'bug',
  },
  {
    key: 'ORA-01747',
    dependency: 'oracle',
    hint: 'Invalid column reference',
    hintDetail:
      'An UPDATE SET uses a column name Oracle rejects: a reserved word (e.g. "level", "comment", "date") unquoted. Quote or rename it.',
    category: 'bug',
  },
  {
    key: 'ORA-01756',
    dependency: 'oracle',
    hint: 'Quoted string not ended',
    hintDetail:
      'A string literal is missing its closing quote: a raw query concatenating a value with an apostrophe. Use bind parameters.',
    category: 'bug',
  },
  {
    key: 'ORA-01779',
    dependency: 'oracle',
    hint: 'Key-preserved table',
    hintDetail:
      'An UPDATE through a join view touches a non-key-preserved table. Update the base table directly or use MERGE.',
    category: 'bug',
  },
  {
    key: 'ORA-01789',
    dependency: 'oracle',
    hint: 'UNION column mismatch',
    hintDetail: 'The queries in a UNION have a different number of columns.',
    category: 'bug',
  },
  {
    key: 'ORA-01790',
    dependency: 'oracle',
    hint: 'UNION type mismatch',
    hintDetail:
      'A column in a UNION has different types across the queries. CAST them to one type.',
    category: 'bug',
  },
  {
    key: 'ORA-01917',
    dependency: 'oracle',
    hint: 'User or role missing',
    hintDetail: 'A GRANT names a user or role that does not exist.',
    category: 'config',
  },
  {
    key: 'ORA-01920',
    dependency: 'oracle',
    hint: 'User already exists',
    hintDetail: 'CREATE USER for an existing user/role name.',
    category: 'config',
  },
  {
    key: 'ORA-01927',
    dependency: 'oracle',
    hint: 'Privilege not granted',
    hintDetail: 'REVOKE of a privilege the user never had.',
    category: 'config',
  },
  {
    key: 'ORA-01930',
    dependency: 'oracle',
    hint: 'Object type not grantable',
    hintDetail: 'The object type cannot receive this grant.',
    category: 'config',
  },
  {
    key: 'ORA-01950',
    dependency: 'oracle',
    hint: 'No tablespace quota',
    hintDetail:
      'The user has no quota on the tablespace, so inserts fail. Ask the DBA for a quota.',
    category: 'config',
  },
  {
    key: 'ORA-02049',
    dependency: 'oracle',
    hint: 'Distributed lock timeout',
    hintDetail:
      'A statement over a DB link waited too long for a lock on the remote database. Retry.',
    retryable: true,
  },
  {
    key: 'ORA-02264',
    dependency: 'oracle',
    hint: 'Constraint name taken',
    hintDetail:
      'A constraint with this name already exists. A migration ran twice or names collide.',
    category: 'config',
  },
  {
    key: 'ORA-02266',
    dependency: 'oracle',
    hint: 'Table referenced by FKs',
    hintDetail:
      'TRUNCATE/DROP on a table whose primary key is referenced by enabled foreign keys. Disable them first.',
    category: 'config',
  },
  {
    key: 'ORA-02270',
    dependency: 'oracle',
    hint: 'FK target not a key',
    hintDetail:
      'A foreign key references columns without a primary/unique key. Fix the migration.',
    category: 'config',
  },
  {
    key: 'ORA-02275',
    dependency: 'oracle',
    hint: 'FK already exists',
    hintDetail:
      'A referential constraint with these columns already exists. A migration ran twice.',
    category: 'config',
  },
  {
    key: 'ORA-02287',
    dependency: 'oracle',
    hint: 'Sequence not allowed here',
    hintDetail:
      'NEXTVAL is used in a place Oracle forbids (DISTINCT, GROUP BY, subquery). Fetch the value first.',
    category: 'bug',
  },
  {
    key: 'ORA-02289',
    dependency: 'oracle',
    hint: 'Sequence does not exist',
    hintDetail:
      'The sequence is missing (see target): a migration not run, or the wrong schema. Check the entity generation strategy.',
    category: 'config',
  },
  {
    key: 'ORA-02290',
    dependency: 'oracle',
    hint: 'Check constraint violated',
    hintDetail:
      'A CHECK constraint rejected the value: outside the allowed set/range. Validate the field in the DTO.',
    level: 'warn',
    explain: ({ message, schema }) => {
      const name = message
        .match(/constraint \(([^)]+)\)/)?.[1]
        ?.split('.')
        .pop()
      if (!name) return undefined
      const info = schema.constraint(name)
      return {
        target: info?.entity ?? name,
        fix: `CHECK constraint ${name} rejected the value. Validate the field against the allowed values before saving.`,
      }
    },
  },
  {
    key: 'ORA-02293',
    dependency: 'oracle',
    hint: 'Check constraint violated',
    hintDetail:
      'Enabling a CHECK constraint failed because existing rows violate it. Clean the data first.',
    category: 'data',
  },
  {
    key: 'ORA-02296',
    dependency: 'oracle',
    hint: 'Cannot enable constraint',
    hintDetail:
      'Existing rows violate the constraint being enabled (NOT NULL on a column with nulls). Fix the data in the migration.',
    category: 'data',
  },
  {
    key: 'ORA-02298',
    dependency: 'oracle',
    hint: 'Orphan rows block FK',
    hintDetail:
      'Enabling a foreign key found child rows without a parent. Clean the orphans first.',
    category: 'data',
  },
  {
    key: 'ORA-02303',
    dependency: 'oracle',
    hint: 'Type has dependents',
    hintDetail:
      'A type cannot be dropped/replaced because tables depend on it.',
    category: 'config',
  },
  {
    key: 'ORA-02429',
    dependency: 'oracle',
    hint: 'Index backs a constraint',
    hintDetail:
      'DROP INDEX on an index that enforces a unique/primary key. Drop the constraint instead.',
    category: 'config',
  },
  {
    key: 'ORA-02449',
    dependency: 'oracle',
    hint: 'Keys referenced by FKs',
    hintDetail:
      'DROP TABLE failed because foreign keys reference it. Drop them first (or CASCADE CONSTRAINTS).',
    category: 'config',
  },
  {
    key: 'ORA-04021',
    dependency: 'oracle',
    hint: 'Timeout locking object',
    hintDetail:
      'A DDL/compile waited for a lock on an object in use (a package being executed). Retry when idle.',
    retryable: true,
  },
  {
    key: 'ORA-04030',
    dependency: 'oracle',
    hint: 'Oracle process out of memory',
    hintDetail:
      'The server process could not allocate PGA memory (huge sort, collection). Simplify the query or ask the DBA.',
    category: 'dependency',
  },
  {
    key: 'ORA-04031',
    dependency: 'oracle',
    hint: 'Oracle shared pool full',
    hintDetail:
      'The shared pool is exhausted, often by unbound literal SQL. Use bind parameters; the DBA may flush/grow the pool.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ORA-04036',
    dependency: 'oracle',
    hint: 'PGA limit exceeded',
    hintDetail:
      'The instance PGA_AGGREGATE_LIMIT was hit. A query uses too much memory; simplify it.',
    category: 'dependency',
  },
  {
    key: 'ORA-04043',
    dependency: 'oracle',
    hint: 'Object does not exist',
    hintDetail:
      'The named object is missing (see target). Check the name and schema.',
    category: 'config',
    target: /object ([^\s]+) does not exist/,
  },
  {
    key: 'ORA-04061',
    dependency: 'oracle',
    hint: 'Package state invalidated',
    hintDetail:
      'A package was recompiled while the session had state. Retry the call; the next execution succeeds.',
    retryable: true,
  },
  {
    key: 'ORA-04063',
    dependency: 'oracle',
    hint: 'Package has errors',
    hintDetail:
      'A package/view is invalid (compile errors) (see target). Recompile it; check the DBA_ERRORS view.',
    category: 'config',
    target: /^ORA-04063: (.+) has errors/,
  },
  {
    key: 'ORA-04088',
    dependency: 'oracle',
    hint: 'Trigger failed',
    hintDetail:
      'A trigger raised an error (see target). The real cause is the next ORA- line in the message.',
    category: 'bug',
    target: /trigger '([^']+)'/,
  },
  {
    key: 'ORA-04091',
    dependency: 'oracle',
    hint: 'Mutating table in trigger',
    hintDetail:
      'A row trigger queried or modified the table that fired it (see target). Use a compound trigger or move the logic.',
    category: 'bug',
    target: /table ([^\s]+) is mutating/,
  },
  {
    key: 'ORA-04098',
    dependency: 'oracle',
    hint: 'Trigger invalid',
    hintDetail:
      'A trigger is invalid and could not be revalidated (see target). Recompile it.',
    category: 'config',
    target: /trigger '([^']+)'/,
  },
  {
    key: 'ORA-06502',
    dependency: 'oracle',
    hint: 'PL/SQL value error',
    hintDetail:
      'A PL/SQL variable got a value too long, non-numeric, or NULL where not allowed. Check the inputs to the procedure.',
    level: 'warn',
  },
  {
    key: 'ORA-06508',
    dependency: 'oracle',
    hint: 'PL/SQL unit not found',
    hintDetail:
      'A called package/procedure is missing or invalid. Deploy or recompile it.',
    category: 'config',
  },
  {
    key: 'ORA-06512',
    dependency: 'oracle',
    hint: 'PL/SQL error location',
    hintDetail:
      'The error came from PL/SQL (see target for the unit and line). The real cause is the first ORA- line in the message.',
    category: 'bug',
    target: /at "([^"]+)", line (\d+)/,
  },
  {
    key: 'ORA-06530',
    dependency: 'oracle',
    hint: 'Uninitialized object',
    hintDetail:
      'A PL/SQL object type variable was used before being initialized.',
    category: 'bug',
  },
  {
    key: 'ORA-06531',
    dependency: 'oracle',
    hint: 'Uninitialized collection',
    hintDetail:
      'A PL/SQL nested table/varray was used before being initialized.',
    category: 'bug',
  },
  {
    key: 'ORA-06533',
    dependency: 'oracle',
    hint: 'Collection index too big',
    hintDetail:
      'A PL/SQL collection subscript is beyond its count. Extend the collection first.',
    category: 'bug',
  },
  {
    key: 'ORA-06550',
    dependency: 'oracle',
    hint: 'PL/SQL compile error',
    hintDetail:
      'The PL/SQL block has a syntax or semantic error (see the PLS- line in the message). Usually a raw block with a wrong identifier.',
    category: 'bug',
  },
  {
    key: 'ORA-06553',
    dependency: 'oracle',
    hint: 'PL/SQL call invalid',
    hintDetail:
      'A PL/SQL function was called with the wrong arguments from SQL (see the PLS- line).',
    category: 'bug',
  },
  {
    key: 'ORA-00600',
    dependency: 'oracle',
    hint: 'Oracle internal error',
    hintDetail:
      'An Oracle kernel internal error (ORA-00600). Collect the arguments and alert the DBA; retry may succeed.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ORA-07445',
    dependency: 'oracle',
    hint: 'Oracle process crashed',
    hintDetail:
      'An Oracle server process hit an OS exception (ORA-07445). Alert the DBA; the session is gone.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ORA-00604',
    dependency: 'oracle',
    hint: 'Recursive SQL error',
    hintDetail:
      'An error inside Oracle recursive SQL (data dictionary, a logon trigger). The real cause is the next ORA- line.',
    category: 'dependency',
  },
  {
    key: 'ORA-00028',
    dependency: 'oracle',
    hint: 'Session killed',
    hintDetail:
      'A DBA killed this session (ALTER SYSTEM KILL SESSION). Reconnect; check why it was killed (long query, lock).',
    retryable: true,
  },
  {
    key: 'ORA-00030',
    dependency: 'oracle',
    hint: 'Session id invalid',
    hintDetail: 'The session referenced no longer exists.',
    retryable: true,
  },
  {
    key: 'ORA-00257',
    dependency: 'oracle',
    hint: 'Archive log destination full',
    hintDetail:
      'Oracle cannot archive redo logs (disk full), so all writes block. Alert the DBA immediately.',
    category: 'dependency',
  },
  {
    key: 'ORA-00020',
    dependency: 'oracle',
    hint: 'Oracle max processes',
    hintDetail:
      'The instance PROCESSES limit is reached: too many connections across pods. Shrink pools or ask the DBA to raise it.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ORA-00018',
    dependency: 'oracle',
    hint: 'Oracle max sessions',
    hintDetail:
      'The instance SESSIONS limit is reached. Shrink connection pools or ask the DBA to raise it.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ORA-00059',
    dependency: 'oracle',
    hint: 'Max DB_FILES exceeded',
    hintDetail: 'The database cannot add more datafiles. Ask the DBA.',
    category: 'dependency',
  },
  {
    key: 'ORA-08002',
    dependency: 'oracle',
    hint: 'CURRVAL before NEXTVAL',
    hintDetail:
      'sequence.CURRVAL was read before NEXTVAL in this session. Use NEXTVAL or RETURNING.',
    category: 'bug',
  },
  {
    key: 'ORA-08004',
    dependency: 'oracle',
    hint: 'Sequence exhausted',
    hintDetail:
      'The sequence reached MAXVALUE. Alter the sequence (NOMAXVALUE or a larger max).',
    category: 'config',
  },
  {
    key: 'ORA-08006',
    dependency: 'oracle',
    hint: 'Row already deleted',
    hintDetail:
      'The row to update/delete was deleted by another session. Reload before acting.',
    level: 'warn',
    category: 'data',
  },
  {
    key: 'ORA-08103',
    dependency: 'oracle',
    hint: 'Object no longer exists',
    hintDetail:
      'The object was dropped or truncated while the query ran (a global temp table, a rebuilt index). Retry.',
    retryable: true,
  },
  {
    key: 'ORA-08177',
    dependency: 'oracle',
    hint: 'Serializable conflict',
    hintDetail:
      'A SERIALIZABLE transaction met a row changed by another transaction. Retry the transaction.',
    retryable: true,
    category: 'data',
  },
  {
    key: 'ORA-12154',
    dependency: 'oracle',
    hint: 'TNS name not resolved',
    hintDetail:
      'The connect string alias is not in tnsnames.ora, or TNS_ADMIN is wrong. Use an Easy Connect string (host:port/service) in {env}.',
    category: 'config',
  },
  {
    key: 'ORA-12505',
    dependency: 'oracle',
    hint: 'Oracle SID unknown',
    hintDetail:
      'The listener does not know the SID in {env}. Use the service name instead (host:port/service).',
    category: 'config',
  },
  {
    key: 'ORA-12516',
    dependency: 'oracle',
    hint: 'Oracle handler unavailable',
    hintDetail:
      'The listener found no handler with a free slot: the database reached its PROCESSES/SESSIONS limit. Shrink pools; retry.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ORA-12518',
    dependency: 'oracle',
    hint: 'Oracle handoff failed',
    hintDetail:
      'The listener could not hand the connection to a server process (database overloaded or restarting). Retry.',
    retryable: true,
  },
  {
    key: 'ORA-12519',
    dependency: 'oracle',
    hint: 'Oracle no free handler',
    hintDetail:
      'The listener has no handler with free capacity (PROCESSES limit, or the listener status is stale). Retry; shrink pools.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ORA-12520',
    dependency: 'oracle',
    hint: 'Oracle handler type missing',
    hintDetail:
      'No listener handler for the requested service type (dedicated/shared). Check the connect string.',
    category: 'config',
  },
  {
    key: 'ORA-12528',
    dependency: 'oracle',
    hint: 'Oracle blocking connections',
    hintDetail:
      'The instance is starting (restricted mode) and blocks new connections. Retry in a minute.',
    retryable: true,
  },
  {
    key: 'ORA-12537',
    dependency: 'oracle',
    hint: 'Oracle connection closed',
    hintDetail:
      'The listener closed the connection at once: a firewall, a listener restart, or an invalid connect string. Check {env}.',
    retryable: true,
  },
  {
    key: 'ORA-12543',
    dependency: 'oracle',
    hint: 'Oracle host unreachable',
    hintDetail:
      'No route to {host}: network policy, VPN or a wrong host in {env}.',
    retryable: true,
  },
  {
    key: 'ORA-12545',
    dependency: 'oracle',
    hint: 'Oracle host not found',
    hintDetail:
      'The host in {env} does not resolve. Check the DB host env var.',
    category: 'config',
  },
  {
    key: 'ORA-12547',
    dependency: 'oracle',
    hint: 'Oracle connection lost',
    hintDetail:
      'The connection got end-of-file during connect: the server process died or the listener is misconfigured. Retry.',
    retryable: true,
  },
  {
    key: 'ORA-12560',
    dependency: 'oracle',
    hint: 'Oracle protocol adapter',
    hintDetail:
      'No database was reachable through the configured protocol (empty connect string, service down). Check {env}.',
    category: 'config',
  },
  {
    key: 'ORA-12571',
    dependency: 'oracle',
    hint: 'Oracle packet write failed',
    hintDetail:
      'The network dropped mid-request (firewall idle timeout, server crash). Retry.',
    retryable: true,
  },
  {
    key: 'ORA-12801',
    dependency: 'oracle',
    hint: 'Parallel query failed',
    hintDetail:
      'A parallel query slave hit an error. The real cause is the next ORA- line in the message.',
    category: 'dependency',
  },
  {
    key: 'ORA-12838',
    dependency: 'oracle',
    hint: 'Read after parallel DML',
    hintDetail:
      'A table modified by parallel/direct-path DML was read before COMMIT. Commit first.',
    category: 'bug',
  },
  {
    key: 'ORA-14400',
    dependency: 'oracle',
    hint: 'No partition for key',
    hintDetail:
      'The inserted value maps to no table partition (a date beyond the last range partition). Add the partition.',
    category: 'config',
  },
  {
    key: 'ORA-14551',
    dependency: 'oracle',
    hint: 'DML inside query',
    hintDetail:
      'A function called from SQL performed DML. Make the function autonomous or call it from PL/SQL.',
    category: 'bug',
  },
  {
    key: 'ORA-22275',
    dependency: 'oracle',
    hint: 'Invalid LOB locator',
    hintDetail:
      'A LOB was used after its row/transaction ended (a CLOB read after the connection was released). Read LOBs before release.',
    category: 'bug',
  },
  {
    key: 'ORA-22835',
    dependency: 'oracle',
    hint: 'CLOB too long for VARCHAR',
    hintDetail:
      'A CLOB longer than 4000 bytes was cast to VARCHAR2 (SUBSTR/TO_CHAR on a CLOB). Keep it as CLOB or DBMS_LOB.SUBSTR.',
    category: 'bug',
  },
  {
    key: 'ORA-22922',
    dependency: 'oracle',
    hint: 'Nonexistent LOB value',
    hintDetail:
      'A LOB locator points to a value that no longer exists (a temporary LOB freed, or the row rolled back).',
    category: 'bug',
  },
  {
    key: 'ORA-24338',
    dependency: 'oracle',
    hint: 'Cursor not executed',
    hintDetail:
      'A ref cursor was fetched without being opened (the procedure did not OPEN it on this path).',
    category: 'bug',
  },
  {
    key: 'ORA-24381',
    dependency: 'oracle',
    hint: 'Batch errors in array DML',
    hintDetail:
      'executeMany with batchErrors found failing rows. Read error.batchErrors for each row offset.',
    level: 'warn',
  },
  {
    key: 'ORA-24550',
    dependency: 'oracle',
    hint: 'Oracle process signal',
    hintDetail: 'The server process received a fatal signal. Alert the DBA.',
    category: 'dependency',
  },
  {
    key: 'ORA-24756',
    dependency: 'oracle',
    hint: 'Transaction does not exist',
    hintDetail:
      'A commit/rollback referenced a transaction Oracle does not know (already ended, or a 2PC mismatch).',
    category: 'bug',
  },
  {
    key: 'ORA-24761',
    dependency: 'oracle',
    hint: 'Transaction rolled back',
    hintDetail:
      'The transaction was rolled back by the server (a deadlock or a kill). Retry the unit of work.',
    retryable: true,
  },
  {
    key: 'ORA-25153',
    dependency: 'oracle',
    hint: 'TEMP tablespace empty',
    hintDetail: 'The temporary tablespace has no datafiles. Ask the DBA.',
    category: 'dependency',
  },
  {
    key: 'ORA-25228',
    dependency: 'oracle',
    hint: 'AQ dequeue timed out',
    hintDetail:
      'A dequeue waited the full timeout with no message. Not an error when polling.',
    level: 'warn',
  },
  {
    key: 'ORA-28000',
    dependency: 'oracle',
    hint: 'Oracle account locked',
    hintDetail:
      'The DB user is locked (too many failed logins or admin action). Ask the DBA to unlock it; find the client with the old password.',
    category: 'config',
  },
  {
    key: 'ORA-28002',
    dependency: 'oracle',
    hint: 'Oracle password expires soon',
    hintDetail:
      'The DB password is in its grace period. Rotate it before it expires (ORA-28001).',
    level: 'warn',
    category: 'config',
  },
  {
    key: 'ORA-28003',
    dependency: 'oracle',
    hint: 'Password rejected by policy',
    hintDetail:
      'The new password fails the verification function. Choose one matching the policy.',
    level: 'warn',
  },
  {
    key: 'ORA-28007',
    dependency: 'oracle',
    hint: 'Password reused',
    hintDetail:
      'The new password was used before and the policy forbids reuse.',
    level: 'warn',
  },
  {
    key: 'ORA-28009',
    dependency: 'oracle',
    hint: 'SYS needs SYSDBA',
    hintDetail:
      'Connecting as SYS requires SYSDBA/SYSOPER. The app should not use SYS.',
    category: 'config',
  },
  {
    key: 'ORA-28040',
    dependency: 'oracle',
    hint: 'Auth protocol mismatch',
    hintDetail:
      'The client auth version is not allowed by SQLNET.ALLOWED_LOGON_VERSION on the server. Upgrade the client or relax the server setting.',
    category: 'config',
  },
  {
    key: 'ORA-28100',
    dependency: 'oracle',
    hint: 'VPD policy function invalid',
    hintDetail: 'A row-level security policy function is invalid. Ask the DBA.',
    category: 'config',
  },
  {
    key: 'ORA-29913',
    dependency: 'oracle',
    hint: 'External table failed',
    hintDetail:
      'An external table / ODCI callout failed (missing file, bad directory). Check the next ORA- line.',
    category: 'config',
  },
  {
    key: 'ORA-30036',
    dependency: 'oracle',
    hint: 'UNDO tablespace full',
    hintDetail:
      'A large transaction exhausted the undo tablespace. Commit in batches; the DBA can grow UNDO.',
    category: 'dependency',
  },
  {
    key: 'ORA-31011',
    dependency: 'oracle',
    hint: 'XML parsing failed',
    hintDetail:
      'XMLTYPE got invalid XML. Validate the document before inserting.',
    level: 'warn',
  },
  {
    key: 'ORA-40441',
    dependency: 'oracle',
    hint: 'JSON syntax error',
    hintDetail:
      'A JSON column or JSON_VALUE got invalid JSON. Validate before inserting.',
    level: 'warn',
  },
  {
    key: 'ORA-56600',
    dependency: 'oracle',
    hint: 'Illegal concurrent call',
    hintDetail:
      'Two calls ran on one connection at the same time (a missing await while a query is in flight). Serialize calls per connection.',
    category: 'bug',
  },
  {
    key: 'ORA-64203',
    dependency: 'oracle',
    hint: 'LOB buffer too small',
    hintDetail:
      'A LOB cast to VARCHAR2 exceeds the buffer (multibyte Thai text over 4000 bytes). Read it as a LOB.',
    category: 'bug',
  },
  {
    key: 'ORA-65096',
    dependency: 'oracle',
    hint: 'Common user name invalid',
    hintDetail:
      'In a CDB root, user names must start with C##. Create the user in the PDB instead.',
    category: 'config',
  },
  {
    key: 'ORA_USER_DEFINED',
    messageMatch: /^ORA-20\d{3}:/,
    hint: 'PL/SQL raised an error',
    hintDetail:
      'A stored procedure raised RAISE_APPLICATION_ERROR (ORA-20000..20999). The message text is the business reason the procedure gave.',
    category: 'input',
    level: 'warn',
    target: /^(ORA-20\d{3})/,
  },
  // --- node-oracledb NJS- codes (lib/errors.js) ---
  {
    key: 'NJS-002',
    dependency: 'oracle',
    hint: 'Pool invalid or closed',
    hintDetail:
      'A connection was requested from a pool that was closed or never created. Check the DataSource lifecycle.',
    category: 'bug',
  },
  {
    key: 'NJS-003',
    dependency: 'oracle',
    hint: 'Connection already closed',
    hintDetail:
      'A query ran on a connection that was released/closed: a missing await in a transaction, or work after release.',
    category: 'bug',
  },
  {
    key: 'NJS-005',
    dependency: 'oracle',
    hint: 'Invalid driver parameter',
    hintDetail:
      'node-oracledb rejected a parameter value (see message): a bind of unsupported type (undefined, a nested object, a BigInt).',
    category: 'bug',
  },
  {
    key: 'NJS-007',
    dependency: 'oracle',
    hint: 'Invalid bind value',
    hintDetail:
      'A bind parameter has a value node-oracledb cannot convert (see message). Check the type passed.',
    category: 'bug',
  },
  {
    key: 'NJS-009',
    dependency: 'oracle',
    hint: 'Wrong number of arguments',
    hintDetail: 'A node-oracledb function got the wrong number of arguments.',
    category: 'bug',
  },
  {
    key: 'NJS-010',
    dependency: 'oracle',
    hint: 'Unsupported column type',
    hintDetail:
      'A fetched column has a type node-oracledb does not support (see message). Cast it in the SQL.',
    category: 'bug',
  },
  {
    key: 'NJS-011',
    dependency: 'oracle',
    hint: 'Bind type mismatch',
    hintDetail:
      'A bind value does not match its declared type (a string bound as NUMBER). Check the parameter types.',
    category: 'bug',
  },
  {
    key: 'NJS-012',
    dependency: 'oracle',
    hint: 'Invalid bind data type',
    hintDetail:
      'A bind parameter has a JavaScript type node-oracledb cannot bind (object, boolean, undefined). Convert it first.',
    category: 'bug',
  },
  {
    key: 'NJS-016',
    dependency: 'oracle',
    hint: 'OUT bind buffer too small',
    hintDetail:
      'An OUT bind returned more data than maxSize. Raise maxSize on the bind.',
    category: 'bug',
  },
  {
    key: 'NJS-017',
    dependency: 'oracle',
    hint: 'Concurrent ResultSet use',
    hintDetail:
      'Two operations ran on one ResultSet at once (a missing await in a fetch loop).',
    category: 'bug',
  },
  {
    key: 'NJS-018',
    dependency: 'oracle',
    hint: 'ResultSet already closed',
    hintDetail:
      'A ResultSet was used after close() or after its connection was released.',
    category: 'bug',
  },
  {
    key: 'NJS-022',
    dependency: 'oracle',
    hint: 'LOB already closed',
    hintDetail:
      'A LOB was read after it or its connection was closed. Read LOBs before releasing the connection.',
    category: 'bug',
  },
  {
    key: 'NJS-023',
    dependency: 'oracle',
    hint: 'Concurrent LOB use',
    hintDetail: 'Two operations ran on one LOB at once.',
    category: 'bug',
  },
  {
    key: 'NJS-024',
    dependency: 'oracle',
    hint: 'Driver out of memory',
    hintDetail:
      'node-oracledb could not allocate memory (a huge fetch or LOB). Page the query or stream the LOB.',
    category: 'bug',
  },
  {
    key: 'NJS-036',
    dependency: 'oracle',
    hint: 'Array bind too large',
    hintDetail:
      'An array bind is longer than maxArraySize. Raise maxArraySize or chunk the array.',
    category: 'bug',
  },
  {
    key: 'NJS-040',
    dependency: 'oracle',
    hint: 'DB pool queue timeout',
    hintDetail:
      'Waited queueTimeout for a free connection: every pooled connection is busy with slow queries, or a connection leak. Check pool max and slow SQL.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'NJS-045',
    dependency: 'oracle',
    hint: 'Oracle Thick binary missing',
    hintDetail:
      'The node-oracledb Thick mode binary could not be loaded on this platform. Use Thin mode or install the Instant Client.',
    category: 'config',
  },
  {
    key: 'NJS-047',
    dependency: 'oracle',
    hint: 'Pool alias not found',
    hintDetail:
      'getPool(alias) found no pool with that alias. Check the pool creation order.',
    category: 'bug',
  },
  {
    key: 'NJS-058',
    dependency: 'oracle',
    hint: 'Bind value exceeds maxSize',
    hintDetail:
      'A bind value is longer than its maxSize (see message). Raise maxSize for that bind.',
    category: 'bug',
  },
  {
    key: 'NJS-064',
    dependency: 'oracle',
    hint: 'DB pool closing',
    hintDetail:
      'A connection was requested while the pool was closing (shutdown in progress).',
    retryable: true,
  },
  {
    key: 'NJS-065',
    dependency: 'oracle',
    hint: 'DB pool closed',
    hintDetail:
      'A connection was requested after the pool was closed, usually a job that ran after shutdown started.',
    category: 'bug',
  },
  {
    key: 'NJS-076',
    dependency: 'oracle',
    hint: 'DB pool queue full',
    hintDetail:
      'More than queueMax requests were waiting for a connection. The DB is slow or the pool is too small for the load.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'NJS-081',
    dependency: 'oracle',
    hint: 'Concurrent connection use',
    hintDetail:
      'Two operations ran on one connection at the same time: a missing await, or a connection shared across requests.',
    category: 'bug',
  },
  {
    key: 'NJS-084',
    dependency: 'oracle',
    hint: 'Invalid DB access token',
    hintDetail:
      'Token-based authentication got an invalid token. Check the token provider.',
    category: 'config',
  },
  {
    key: 'NJS-087',
    dependency: 'oracle',
    hint: 'DB access token expired',
    hintDetail:
      'The token used for DB auth has expired. The token callback must refresh it.',
    category: 'config',
  },
  {
    key: 'NJS-097',
    dependency: 'oracle',
    hint: 'Bind placeholder not found',
    hintDetail:
      'A named bind was supplied that the SQL does not use (see target). Match the bind names to the statement.',
    category: 'bug',
    target: /named ":([^"]+)"/,
  },
  {
    key: 'NJS-098',
    dependency: 'oracle',
    hint: 'Bind count mismatch',
    hintDetail:
      'The SQL has a different number of placeholders than bind values. Often an IN (:...) list built from an empty array.',
    category: 'bug',
    explain: ({ message }) => {
      const found = message.match(
        /(\d+) bind placeholders were used .* but (\d+) bind values were provided/,
      )
      return found
        ? {
            target: `${found[1]} vs ${found[2]}`,
            fix: `The SQL has ${found[1]} placeholders but ${found[2]} values were bound. Check the parameter array length.`,
          }
        : undefined
    },
  },
  {
    key: 'NJS-101',
    dependency: 'oracle',
    hint: 'DB credentials missing',
    hintDetail:
      'No user/password (or token) was given to connect. The DB env vars are empty.',
    category: 'config',
  },
  {
    key: 'NJS-104',
    dependency: 'oracle',
    hint: 'Pool has busy connections',
    hintDetail:
      'pool.close() ran while connections were in use. Drain in-flight work before closing, or pass a drainTime.',
    category: 'bug',
  },
  {
    key: 'NJS-105',
    dependency: 'oracle',
    hint: 'NaN bound to NUMBER',
    hintDetail:
      'A bind value is NaN. A calculation produced NaN (undefined arithmetic) before the query.',
    category: 'bug',
  },
  {
    key: 'NJS-115',
    dependency: 'oracle',
    hint: 'Number not representable',
    hintDetail:
      'A JavaScript number cannot be stored as an Oracle NUMBER (Infinity, too large).',
    category: 'bug',
  },
  {
    key: 'NJS-116',
    dependency: 'oracle',
    hint: 'Old password verifier',
    hintDetail:
      'The DB user has only a 10G password verifier, unsupported in Thin mode. Reset the password on 11G+ or use Thick mode.',
    category: 'config',
  },
  {
    key: 'NJS-123',
    dependency: 'oracle',
    hint: 'DB call timed out',
    hintDetail:
      'The statement exceeded connection.callTimeout. The query is slow or blocked by a lock; check the SQL and locks.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'NJS-138',
    dependency: 'oracle',
    hint: 'DB version unsupported',
    hintDetail:
      'Thin mode does not support this Oracle Database version. Use Thick mode or upgrade the database.',
    category: 'config',
  },
  {
    key: 'NJS-147',
    dependency: 'oracle',
    hint: 'Cursor closed by database',
    hintDetail:
      'The server closed the cursor (session killed, package recompiled). Retry the query.',
    retryable: true,
  },
  {
    key: 'NJS-500',
    dependency: 'oracle',
    hint: 'DB connection broken',
    hintDetail:
      'The connection to Oracle was closed or broken (server restart, firewall). The pool discards it; retry.',
    retryable: true,
  },
  {
    key: 'NJS-501',
    dependency: 'oracle',
    hint: 'DB connection terminated',
    hintDetail:
      'The connection to {host}:{port} ended unexpectedly (session killed, network reset). Retry.',
    retryable: true,
  },
  {
    key: 'NJS-503',
    dependency: 'oracle',
    hint: '{Type} "{name}" unreachable',
    hintDetail:
      'Could not open a connection to {host}:{port}. Oracle may be down, or {env} is wrong. The cause is in the message.',
    retryable: true,
  },
  {
    key: 'NJS-504',
    dependency: 'oracle',
    hint: 'DB proxy connection failed',
    hintDetail:
      'Connecting through the HTTPS proxy to Oracle failed. Check the proxy settings in the connect string.',
    category: 'config',
  },
  {
    key: 'NJS-505',
    dependency: 'oracle',
    hint: 'DB TLS setup failed',
    hintDetail:
      'TLS to Oracle could not start: the wallet or certificate is invalid. Check the wallet path and password.',
    category: 'config',
  },
  {
    key: 'NJS-506',
    dependency: 'oracle',
    hint: 'DB TLS handshake failed',
    hintDetail:
      'The TLS handshake with {host}:{port} failed: untrusted CA, wrong protocol (tcp vs tcps), or a wallet mismatch.',
    category: 'config',
  },
  {
    key: 'NJS-507',
    dependency: 'oracle',
    hint: 'DB certificate DN mismatch',
    hintDetail:
      'The server certificate DN does not match ssl_server_cert_dn. Fix the DN in the connect string.',
    category: 'config',
  },
  {
    key: 'NJS-508',
    dependency: 'oracle',
    hint: 'DB certificate host mismatch',
    hintDetail:
      'The hostname is not in the server certificate. Connect with the name the certificate was issued for.',
    category: 'config',
  },
  {
    key: 'NJS-510',
    dependency: 'oracle',
    hint: 'DB connect timed out',
    hintDetail:
      'Connecting to {host}:{port} exceeded the connect timeout. Oracle is down or unreachable (firewall, wrong port).',
    retryable: true,
  },
  {
    key: 'NJS-511',
    dependency: 'oracle',
    hint: 'Oracle listener refused',
    hintDetail:
      'The listener at {host}:{port} refused the connection (see cause): wrong service name, listener down, or blocked.',
    retryable: true,
  },
  {
    key: 'NJS-512',
    dependency: 'oracle',
    hint: 'Connect string invalid',
    hintDetail:
      'The connect string parameters are invalid (see message). Check {env}.',
    category: 'config',
  },
  {
    key: 'NJS-513',
    dependency: 'oracle',
    hint: 'DB in-band notification',
    hintDetail:
      'The server sent an in-band error (session killed, planned down). Reconnect.',
    retryable: true,
  },
  {
    key: 'NJS-514',
    dependency: 'oracle',
    hint: 'Connect string syntax error',
    hintDetail:
      'The Oracle connect string could not be parsed. Check {env} (host:port/service or a full descriptor).',
    category: 'config',
  },
  {
    key: 'NJS-515',
    dependency: 'oracle',
    hint: 'Easy Connect string error',
    hintDetail:
      'The Easy Connect string has an invalid part (see message). Check {env}.',
    category: 'config',
  },
  {
    key: 'NJS-516',
    dependency: 'oracle',
    hint: 'tnsnames.ora not found',
    hintDetail:
      'A TNS alias was used but no configDir/TNS_ADMIN points to tnsnames.ora. Use host:port/service in {env}.',
    category: 'config',
  },
  {
    key: 'NJS-517',
    dependency: 'oracle',
    hint: 'TNS alias not found',
    hintDetail:
      'The alias is not in tnsnames.ora. Use host:port/service in {env}.',
    category: 'config',
  },
  {
    key: 'NJS-518',
    dependency: 'oracle',
    hint: 'Oracle service unknown',
    hintDetail:
      'The listener at {host}:{port} does not know the service name. Check the service in {env} (lsnrctl services).',
    category: 'config',
  },
  {
    key: 'NJS-519',
    dependency: 'oracle',
    hint: 'Oracle SID unknown',
    hintDetail:
      'The listener at {host}:{port} does not know the SID. Use the service name in {env}.',
    category: 'config',
  },
  {
    key: 'NJS-520',
    dependency: 'oracle',
    hint: 'tnsnames.ora missing',
    hintDetail:
      'tnsnames.ora was not found in the config directory. Use host:port/service in {env}.',
    category: 'config',
  },
  {
    key: 'NJS-521',
    dependency: 'oracle',
    hint: 'DB connection reset',
    hintDetail:
      'Got end-of-file from {host}:{port}: the server process died or a firewall cut an idle connection. Retry.',
    retryable: true,
  },
  {
    key: 'NJS-530',
    dependency: 'oracle',
    hint: 'DB host unresolvable',
    hintDetail:
      'The host in the connect string cannot be resolved. Check {env} and DNS.',
    category: 'config',
  },
  {
    key: 'NJS-536',
    dependency: 'oracle',
    hint: 'Too many connect redirects',
    hintDetail:
      'The listener redirected more times than allowed. A misconfigured RAC/SCAN listener.',
    category: 'config',
  },
  // --- ODPI-C (Thick mode) ---
  {
    key: 'DPI-1010',
    dependency: 'oracle',
    hint: 'DB not connected',
    hintDetail:
      'The connection is closed (released, or dropped by the server). Retry with a fresh connection.',
    retryable: true,
  },
  {
    key: 'DPI-1047',
    dependency: 'oracle',
    hint: 'Oracle Client not found',
    hintDetail:
      'Thick mode cannot load the Oracle Instant Client (LD_LIBRARY_PATH / libDir). Install it in the image or use Thin mode.',
    category: 'config',
  },
  {
    key: 'DPI-1067',
    dependency: 'oracle',
    hint: 'DB call timed out',
    hintDetail:
      'The statement exceeded callTimeout. The query is slow or blocked; check locks and the SQL.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'DPI-1072',
    dependency: 'oracle',
    hint: 'Oracle Client too old',
    hintDetail:
      'The Instant Client version is unsupported. Install 19c or later.',
    category: 'config',
  },
  {
    key: 'DPI-1080',
    dependency: 'oracle',
    hint: 'DB connection closed',
    hintDetail:
      'The connection was closed by the server (session killed, timeout). The pool discards it; retry.',
    retryable: true,
  },
]
