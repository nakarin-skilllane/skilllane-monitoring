import {
  constraintIn,
  constraintTarget,
  quotedColumn,
  quotedPath,
} from './explain-helpers'
import type { ErrorPattern } from './types'

// Sources:
// - https://docs.oracle.com/en/error-help/db/ (ORA-*, one page per code)
// - https://github.com/oracle/node-oracledb/blob/main/lib/errors.js (NJS-*)
// - https://node-oracledb.readthedocs.io/en/latest/ (user guide: connections, pools, binds, troubleshooting)
// - https://github.com/oracle/odpi/blob/main/src/dpiErrorMessages.h (DPI-*)
//
// Common ORA- codes of application code (constraints, values, SQL) plus
// connection/pool errors of node-oracledb thin mode.
export const oraclePatterns: ErrorPattern[] = [
  {
    key: 'ORA-00001',
    hint: 'Duplicate record',
    detail:
      'A unique constraint rejected the row. Often two concurrent requests inserted the same data, or the same request was sent twice.',
    howToFix:
      'Check for an existing row before inserting, or use an upsert; make retried requests idempotent.',
    level: 'warn',
    category: 'data',
    explain: ({ message, schema }) => {
      const name = constraintIn(message)
      const info = name ? schema.constraint(name) : undefined
      const target = constraintTarget(name, info)
      const known = Boolean(info?.properties.length)
      return {
        target,
        detail: known
          ? `${info?.entity} already has a row with the same (${info?.properties.join(', ')}).`
          : undefined,
        howToFix: known
          ? 'Check for an existing row first, or upsert.'
          : undefined,
      }
    },
  },
  {
    key: 'ORA-00054',
    hint: 'Row or table is locked',
    detail:
      'Another session holds a lock this statement needs, and NOWAIT was set or the lock wait timed out. Common during migrations or long transactions.',
    howToFix: 'Retry after the other session commits.',
    retryable: true,
    category: 'data',
  },
  {
    key: 'ORA-30006',
    hint: 'Lock wait timed out',
    detail:
      'SELECT ... FOR UPDATE WAIT gave up because another transaction kept the row locked. Usually load-related.',
    howToFix: 'Retry or shorten the transaction.',
    retryable: true,
    category: 'data',
  },
  {
    key: 'ORA-00060',
    hint: 'DB deadlock',
    detail: 'Two transactions locked each other.',
    howToFix:
      'Retry the transaction; if frequent, make both code paths update rows in the same order.',
    retryable: true,
    category: 'data',
  },
  {
    key: 'ORA-01400',
    hint: 'Required column is null',
    detail: 'An insert left a NOT NULL column empty.',
    howToFix:
      'Check the entity default and the request data that should fill it.',
    category: 'data',
    explain: ({ message, schema }) => {
      const target = quotedColumn(schema, message)
      return target
        ? {
            target,
            detail: `${target} was null on insert.`,
            howToFix: `Set ${target} in the DTO/mapper, or give the column a default.`,
          }
        : undefined
    },
  },
  {
    key: 'ORA-01407',
    hint: 'Cannot set column to null',
    detail: 'An update tried to clear a NOT NULL column.',
    howToFix: 'Check the transformer or mapper that produced the null value.',
    category: 'data',
    explain: ({ message, schema }) => {
      const target = quotedColumn(schema, message)
      return target
        ? {
            target,
            detail: `An update set ${target} to null.`,
            howToFix:
              'Check the mapper or the partial update that produced the null.',
          }
        : undefined
    },
  },
  {
    key: 'ORA-02291',
    hint: 'Parent record not found',
    detail:
      'A foreign key points to a row that does not exist. The referenced record may be deleted, or the id in the request is wrong.',
    howToFix:
      'Check that the referenced record exists before saving, and reject a wrong id as a client error.',
    level: 'warn',
    category: 'data',
    explain: ({ message, schema }) => {
      const name = constraintIn(message)
      const info = name ? schema.constraint(name) : undefined
      if (!info) return { target: name }
      const from = `${info.entity}.${info.properties.join(', ')}`
      return {
        target: from,
        detail: `${from} points to a ${info.referenced ?? 'record'} that does not exist: deleted, or a wrong id from the client.`,
      }
    },
  },
  {
    key: 'ORA-02292',
    hint: 'Record is still referenced',
    detail: 'Delete blocked because child rows still reference this record.',
    howToFix: 'Remove or reassign the children first.',
    level: 'warn',
    category: 'data',
    explain: ({ message, schema }) => {
      const name = constraintIn(message)
      const info = name ? schema.constraint(name) : undefined
      if (!info) return { target: name }
      return {
        target: `${info.entity}.${info.properties.join(', ')}`,
        detail: `This ${info.referenced ?? 'record'} is still referenced by ${info.entity}.${info.properties.join(', ')}.`,
        howToFix: `Delete or reassign those ${info.entity} rows first.`,
      }
    },
  },
  {
    key: 'ORA-12899',
    hint: 'Value too long for column',
    detail:
      'A text value exceeds the column size, counted in bytes unless the column uses CHAR semantics, so multibyte text needs more room. Common in Excel imports.',
    howToFix:
      'Validate the length before saving, or widen the column if longer values are valid.',
    level: 'warn',
    category: 'data',
    explain: ({ message, schema }) => {
      const target = quotedColumn(schema, message)
      const sizes = message.match(/actual: (\d+), maximum: (\d+)/)
      if (!target) return undefined
      return {
        target,
        detail: sizes
          ? `${target} got ${sizes[1]} (max ${sizes[2]}).`
          : `${target} is too long.`,
        howToFix: sizes
          ? 'Validate the length in the DTO or import before saving.'
          : 'Validate the length before saving.',
      }
    },
  },
  {
    key: 'ORA-01438',
    hint: 'Number too large for column',
    detail: 'A numeric value exceeds the column precision.',
    howToFix: 'Check the input range or the column definition.',
    category: 'data',
  },
  {
    key: 'ORA-01722',
    hint: 'Invalid number',
    detail:
      'Oracle could not convert text to a number. Often bind parameters are in the wrong order or a string id was compared to a number column.',
    howToFix:
      'Check the bind parameter order and that number columns get numeric values.',
    category: 'bug',
  },
  {
    key: 'ORA-01795',
    hint: 'IN list over 1000 items',
    detail: 'Oracle allows at most 1000 values in one IN list.',
    howToFix: 'Split the list into chunks (see oracle-in-list helper).',
    category: 'bug',
  },
  {
    key: 'ORA-00904',
    hint: 'Unknown column name',
    detail:
      'The SQL references a column that does not exist. A migration may not have run, or the query uses a wrong alias.',
    howToFix:
      'Run pending migrations, or fix the column name or alias in the query.',
    category: 'bug',
    explain: ({ message, schema }) => {
      const path = quotedPath(message.split(':')[1] ?? message)
      const column = path[path.length - 1]
      if (!column) return undefined
      const owners = schema.columnOwners(column)
      const shown = path.join('.')
      return {
        target: shown,
        detail: owners.length
          ? `${owners.join(', ')} maps column ${column} but the database has none: a migration has not run in this environment.`
          : `No entity maps column ${column}: a typo or a wrong alias (${shown}) in the query.`,
      }
    },
  },
  {
    key: 'ORA-00936',
    hint: 'Malformed SQL expression',
    detail:
      'The SQL is missing an expression, often an empty IN () list built from an empty array.',
    howToFix: 'Guard empty inputs before querying.',
    category: 'bug',
  },
  {
    key: 'ORA-00942',
    hint: 'Table or view not found',
    detail: 'The table does not exist or the schema user lacks access.',
    howToFix:
      'Check that migrations ran, that the schema prefix or CURRENT_SCHEMA is right, and that the DB user has been granted access to it.',
    category: 'config',
  },
  {
    key: 'ORA-01013',
    hint: 'Query cancelled',
    detail:
      'The client cancelled the running call, usually because a call timeout expired.',
    howToFix:
      'Check query performance and indexes, or raise the call timeout if the work is expected to be slow.',
  },
  {
    key: 'ORA-04068',
    hint: 'Package state discarded',
    detail: 'A PL/SQL package was recompiled while sessions held its state.',
    howToFix: 'Retry the call; it usually clears on retry after a deployment.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'ORA-01017',
    hint: 'Wrong DB username or password',
    detail: 'The database rejected the login.',
    howToFix: 'Check the DB username and password in env.',
    category: 'config',
  },
  {
    key: 'ORA-28001',
    hint: 'DB password expired',
    detail: 'The database account password has expired.',
    howToFix: 'Ask the DBA to reset it and update env.',
    category: 'config',
  },
  {
    key: 'ORA-12541',
    hint: 'Oracle listener unreachable',
    detail:
      'Nothing answered at the DB host and port. Oracle may be down or restarting, or the connection string is wrong.',
    howToFix:
      'Check that Oracle and its listener are running, and the host and port in the connection string.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'ORA-12514',
    hint: 'Oracle service name unknown',
    detail: 'The listener is up but does not know the service name.',
    howToFix:
      'Check the service name in the connection string, and that the database or PDB is open and registered with the listener.',
    category: 'config',
  },
  {
    key: 'ORA-12170',
    hint: 'Oracle connect timeout',
    detail:
      'Connecting to the database timed out. The network or firewall may be blocking, or the DB host is overloaded.',
    howToFix: 'Check network and firewall access to the DB host, then retry.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'ORA-03113',
    hint: 'DB connection lost',
    detail:
      'The database closed the connection mid-call (restart, idle timeout or network). The pool reconnects.',
    howToFix: 'Retry the operation.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'ORA-03114',
    hint: 'DB connection lost',
    detail:
      'The connection was already closed when the call started. The pool should replace it.',
    howToFix: 'Retry the operation.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'ORA-03135',
    hint: 'DB connection lost',
    detail:
      'The server ended the connection: the session was terminated, a server timeout expired, or a firewall dropped the idle socket.',
    howToFix:
      'Retry; if frequent, check the pool idle and ping settings and the timeouts in sqlnet.ora.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'NJS-098',
    hint: 'Bind count mismatch',
    detail:
      'The SQL and its bind values do not line up, often a bind name reused in positional mode.',
    howToFix:
      'Bind by name (an object) when a placeholder name repeats, or give each placeholder its own name.',
    category: 'bug',
  },
  {
    key: 'NJS-040',
    hint: 'DB pool queue timed out',
    detail:
      'Waited too long for a free DB connection. The pool is exhausted by slow queries or long transactions.',
    howToFix:
      'Release every connection with close(), speed up slow queries and long transactions, or raise poolMax.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'NJS-076',
    hint: 'DB pool queue is full',
    detail: 'Too many requests are waiting for a DB connection.',
    howToFix:
      'Check for unreleased connections, slow queries or a burst of traffic.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'NJS-500',
    hint: 'DB connection dropped',
    detail:
      'The connection to Oracle was closed unexpectedly. The database may have restarted or the network dropped.',
    howToFix:
      'Retry the operation; if it repeats, check the database and the network.',
    retryable: true,
    category: 'dependency',
  },
  {
    key: 'NJS-503',
    hint: 'Cannot connect to Oracle',
    detail:
      'The driver could not open a connection. Oracle may be down, restarting, or the host/port in env is wrong.',
    howToFix:
      'Check that Oracle is up and the host and port in env are correct.',
    retryable: true,
    category: 'dependency',
  },
  // Seen in repository comments and TypeORM-on-Oracle queries.
  {
    key: 'ORA-00932',
    hint: 'Incompatible SQL data types',
    detail:
      'Two values of different types were compared or combined; with CLOB it means a CLOB used in WHERE, DISTINCT, ORDER BY or GROUP BY.',
    howToFix:
      'Make both sides the same type; for a CLOB, remove it from that clause or use DBMS_LOB.SUBSTR.',
    category: 'bug',
    explain: ({ message }) => {
      const types = message.match(/expected (\S+) got (\S+)/)
      if (!types) return undefined
      return {
        target: `${types[1]} vs ${types[2]}`,
        ...(/LOB/.test(message)
          ? {
              detail:
                'A CLOB column is compared, sorted, grouped or DISTINCT-ed.',
              howToFix: 'Exclude it from that clause or use DBMS_LOB.SUBSTR.',
            }
          : {
              detail: `The query compares ${types[1]} with ${types[2]}.`,
              howToFix: 'Check bind types and column types.',
            }),
      }
    },
  },
  {
    key: 'ORA-01791',
    hint: 'ORDER BY not in DISTINCT list',
    detail:
      'With DISTINCT every ORDER BY column must be selected. Common with TypeORM skip/take + orderBy on a joined column.',
    howToFix: 'Add the ORDER BY column to the select with addSelect.',
    category: 'bug',
  },
  {
    key: 'ORA-00918',
    hint: 'Ambiguous column in join',
    detail: 'A column name exists in several joined tables.',
    howToFix: 'Prefix it with the table alias in select, where or orderBy.',
    category: 'bug',
    explain: ({ message }) => {
      const column = quotedPath(message)[0]
      return column ? { target: column } : undefined
    },
  },
  {
    key: 'ORA-00979',
    hint: 'Column missing from GROUP BY',
    detail: 'A selected or ordered column is neither grouped nor aggregated.',
    howToFix: 'Add it to groupBy or wrap it in an aggregate.',
    category: 'bug',
  },
  {
    key: 'ORA-01427',
    hint: 'Subquery returned many rows',
    detail: 'A subquery used as a single value returned more than one row.',
    howToFix: 'Add a condition that makes it unique, or use IN / ROWNUM = 1.',
    category: 'data',
  },
  {
    key: 'ORA-30926',
    hint: 'MERGE source has duplicates',
    detail: 'Several source rows of a MERGE matched the same target row.',
    howToFix:
      'Make the MERGE ON condition match one source row per target row, or remove duplicate keys from the input.',
    category: 'data',
  },
  {
    key: 'ORA-01861',
    hint: 'Date text in wrong format',
    detail: 'A date string does not match the TO_DATE format.',
    howToFix:
      'Check the value format, and Buddhist vs Gregorian year conversion.',
    category: 'bug',
  },
  {
    key: 'ORA-01843',
    hint: 'Invalid month in date',
    detail: 'A date string has a month Oracle cannot read.',
    howToFix: 'Pass a Date object or an ISO string with an explicit format.',
    category: 'bug',
  },
  {
    key: 'ORA-01000',
    hint: 'Too many open DB cursors',
    detail:
      'A session opened more cursors than allowed: a stream or query runner was not closed.',
    howToFix:
      'Close every ResultSet and query stream, and release connections in finally blocks; the DBA can raise OPEN_CURSORS if the load needs more.',
    category: 'bug',
  },
  {
    key: 'ORA-01408',
    hint: 'Column list already indexed',
    detail:
      'A migration creates an index on columns that already have one (often from a constraint).',
    howToFix: 'Drop the duplicate index from the migration.',
    category: 'bug',
  },
  {
    key: 'ORA-00955',
    hint: 'DB object name already used',
    detail:
      'A migration creates a table, index or sequence that already exists: it ran partially before.',
    howToFix: 'Check the migrations table and the schema.',
    category: 'bug',
  },
  // --- more ORA- codes (Oracle Database Error Messages reference) ---
  {
    key: 'ORA-01403',
    dependency: 'oracle',
    hint: 'No data found',
    detail:
      'A PL/SQL SELECT INTO returned no row. The id passed to the procedure does not exist.',
    howToFix:
      'Check the id before calling the procedure, or handle NO_DATA_FOUND in it.',
    level: 'warn',
  },
  {
    key: 'ORA-01422',
    dependency: 'oracle',
    hint: 'Query returned several rows',
    detail:
      'A SELECT INTO (or exact fetch) got more than one row. The lookup key is not unique.',
    howToFix:
      'Add a filter that makes the lookup unique, or loop over the rows instead of SELECT INTO.',
    category: 'bug',
  },
  {
    key: 'ORA-01476',
    dependency: 'oracle',
    hint: 'Division by zero',
    detail: 'A divisor in the SQL is zero.',
    howToFix: 'Guard it with NULLIF(x, 0).',
    category: 'bug',
  },
  {
    key: 'ORA-01830',
    dependency: 'oracle',
    hint: 'Date format mismatch',
    detail:
      'The date string has more characters than the format model consumed (a timestamp where a date format was given).',
    howToFix: 'Check the TO_DATE format.',
    level: 'warn',
  },
  {
    key: 'ORA-01839',
    dependency: 'oracle',
    hint: 'Invalid day for month',
    detail: 'A date like 31 April or 30 February was given.',
    howToFix: 'Validate the day before the conversion.',
    level: 'warn',
  },
  {
    key: 'ORA-01840',
    dependency: 'oracle',
    hint: 'Date string too short',
    detail: 'The input is shorter than the TO_DATE format expects.',
    howToFix: 'Validate the date format.',
    level: 'warn',
  },
  {
    key: 'ORA-01841',
    dependency: 'oracle',
    hint: 'Year out of range',
    detail:
      'The year must be between -4713 and +9999 and not 0. A Buddhist year (25xx) plus an offset, or an empty year.',
    howToFix:
      'Validate the year, and convert Buddhist years once before the conversion.',
    level: 'warn',
  },
  {
    key: 'ORA-01847',
    dependency: 'oracle',
    hint: 'Invalid day of month',
    detail: 'The day is not between 1 and the last day of the month.',
    howToFix: 'Validate the input.',
    level: 'warn',
  },
  {
    key: 'ORA-01858',
    dependency: 'oracle',
    hint: 'Non-numeric in date',
    detail:
      'A non-numeric character appeared where TO_DATE expected a number. The input is not a date in the expected format.',
    howToFix:
      'Validate the date string against the format before the conversion.',
    level: 'warn',
  },
  {
    key: 'ORA-01873',
    dependency: 'oracle',
    hint: 'Interval precision too small',
    detail: 'An interval value exceeds its leading precision.',
    howToFix: 'Check the interval arithmetic.',
    category: 'bug',
  },
  {
    key: 'ORA-01882',
    dependency: 'oracle',
    hint: 'Time zone region unknown',
    detail:
      'The client time zone (TZ env / sessionTimeZone) is not in the Oracle time zone file.',
    howToFix: 'Set TZ to a known region such as Asia/Bangkok.',
    category: 'config',
  },
  {
    key: 'ORA-01810',
    dependency: 'oracle',
    hint: 'Date format code repeated',
    detail:
      'The TO_DATE/TO_CHAR format uses the same element twice (MM for minutes instead of MI).',
    howToFix: 'Use each format element once (MI for minutes).',
    category: 'bug',
  },
  {
    key: 'ORA-01821',
    dependency: 'oracle',
    hint: 'Date format unrecognized',
    detail: 'The TO_DATE/TO_CHAR format model is invalid.',
    howToFix:
      'Check the format model against the Oracle datetime format elements.',
    category: 'bug',
  },
  {
    key: 'ORA-00903',
    dependency: 'oracle',
    hint: 'Table name invalid',
    detail:
      'The SQL names a table incorrectly (empty, quoted wrong, or a keyword). Usually a raw query with a template value missing.',
    howToFix: 'Check the table name that the raw query builds in.',
    category: 'bug',
  },
  {
    key: 'ORA-00907',
    dependency: 'oracle',
    hint: 'Missing right parenthesis',
    detail:
      'The SQL has unbalanced parentheses, often a raw query with an empty IN () list or Oracle-unsupported syntax (LIMIT, AS on tables).',
    howToFix:
      'Guard empty lists and replace syntax Oracle does not support in the raw query.',
    category: 'bug',
  },
  {
    key: 'ORA-00909',
    dependency: 'oracle',
    hint: 'Wrong argument count in SQL',
    detail: 'A SQL function was called with the wrong number of arguments.',
    howToFix: 'Check the call against the function signature.',
    category: 'bug',
  },
  {
    key: 'ORA-00911',
    dependency: 'oracle',
    hint: 'Invalid character in SQL',
    detail:
      'The SQL text contains a character Oracle does not accept: a trailing semicolon, a smart quote, or a name with a hyphen.',
    howToFix: 'Remove the character from the SQL, or quote the name.',
    category: 'bug',
  },
  {
    key: 'ORA-00913',
    dependency: 'oracle',
    hint: 'Too many values',
    detail:
      'An INSERT/subquery supplies more values than columns, or a comparison has mismatched tuple sizes.',
    howToFix: 'Match the number of values to the number of columns.',
    category: 'bug',
  },
  {
    key: 'ORA-00917',
    dependency: 'oracle',
    hint: 'Missing comma in SQL',
    detail:
      'The SQL is missing a comma, usually a raw query built by string concatenation.',
    howToFix:
      'Check the separators in the generated SQL, or build it with a query builder.',
    category: 'bug',
  },
  {
    key: 'ORA-00920',
    dependency: 'oracle',
    hint: 'Invalid relational operator',
    detail:
      'A WHERE clause has an invalid operator, often an empty IN () or "= undefined" from an unbound parameter.',
    howToFix:
      'Guard empty lists and undefined parameters before building the query.',
    category: 'bug',
  },
  {
    key: 'ORA-00923',
    dependency: 'oracle',
    hint: 'FROM keyword missing',
    detail:
      'The SELECT list before FROM is malformed: a missing comma, an alias in single quotes, or a reserved word used as an alias.',
    howToFix: 'Fix the SELECT list syntax before the FROM keyword.',
    category: 'bug',
  },
  {
    key: 'ORA-00933',
    dependency: 'oracle',
    hint: 'SQL not properly ended',
    detail:
      'Extra text after the statement: a trailing semicolon, LIMIT/OFFSET (not Oracle syntax), or a JOIN in an UPDATE.',
    howToFix:
      'Remove the extra text; page with OFFSET ... FETCH NEXT instead of LIMIT.',
    category: 'bug',
  },
  {
    key: 'ORA-00934',
    dependency: 'oracle',
    hint: 'Group function misplaced',
    detail:
      'An aggregate (COUNT, SUM) is used in WHERE or GROUP BY instead of HAVING.',
    howToFix: 'Move the aggregate condition to HAVING or a subquery.',
    category: 'bug',
  },
  {
    key: 'ORA-00937',
    dependency: 'oracle',
    hint: 'Not a single-group function',
    detail:
      'The SELECT mixes aggregates with non-aggregated columns without GROUP BY.',
    howToFix: 'Add the non-aggregated columns to GROUP BY.',
    category: 'bug',
  },
  {
    key: 'ORA-00947',
    dependency: 'oracle',
    hint: 'Not enough values',
    detail: 'An INSERT supplies fewer values than columns.',
    howToFix: 'Match the number of values to the number of columns.',
    category: 'bug',
  },
  {
    key: 'ORA-00957',
    dependency: 'oracle',
    hint: 'Duplicate column name',
    detail:
      'The same column appears twice in an INSERT column list or a CREATE TABLE, often from a DTO mapped twice.',
    howToFix: 'Remove the duplicate column from the statement.',
    category: 'bug',
  },
  {
    key: 'ORA-00972',
    dependency: 'oracle',
    hint: 'Identifier too long',
    detail:
      'A column, alias or constraint name exceeds the identifier limit: 30 bytes before 12.2, 128 bytes from 12.2 on.',
    howToFix: 'Shorten the name or the generated alias.',
    category: 'bug',
  },
  {
    key: 'ORA-00984',
    dependency: 'oracle',
    hint: 'Column not allowed here',
    detail:
      'A column name appears in a VALUES list, usually an unquoted string value in a raw INSERT.',
    howToFix: 'Pass values as bind parameters in the INSERT.',
    category: 'bug',
  },
  {
    key: 'ORA-00997',
    dependency: 'oracle',
    hint: 'LONG column misused',
    detail: 'A LONG column was used in a WHERE/GROUP BY/CTAS.',
    howToFix: 'Convert the column to CLOB.',
    category: 'bug',
  },
  {
    key: 'ORA-01002',
    dependency: 'oracle',
    hint: 'Fetch out of sequence',
    detail:
      'A cursor was fetched after it closed (a COMMIT inside a FOR UPDATE loop, or a ResultSet used after the connection was released).',
    howToFix: 'Finish fetching before committing or releasing the connection.',
    category: 'bug',
  },
  {
    key: 'ORA-01031',
    dependency: 'oracle',
    hint: 'DB privilege missing',
    detail:
      'The DB user lacks the privilege for this operation (CREATE, ALTER, a grant on another schema).',
    howToFix: 'Ask the DBA.',
    category: 'config',
  },
  {
    key: 'ORA-01033',
    dependency: 'oracle',
    hint: 'Oracle starting or stopping',
    detail: 'The database is being started or shut down.',
    howToFix: 'Retry in a minute.',
    retryable: true,
  },
  {
    key: 'ORA-01034',
    dependency: 'oracle',
    hint: 'Oracle not available',
    detail:
      'The instance is down, or the connect string names the wrong instance.',
    howToFix: 'Alert the DBA; retry when it is back.',
    retryable: true,
  },
  {
    key: 'ORA-01089',
    dependency: 'oracle',
    hint: 'Oracle shutting down',
    detail: 'An immediate shutdown is in progress.',
    howToFix: 'Reconnect once the database is back.',
    retryable: true,
  },
  {
    key: 'ORA-01092',
    dependency: 'oracle',
    hint: 'Oracle instance terminated',
    detail: 'The instance terminated and disconnected the session.',
    howToFix: 'Reconnect once it is back.',
    retryable: true,
  },
  {
    key: 'ORA-01109',
    dependency: 'oracle',
    hint: 'Database not open',
    detail: 'The database is mounted but not open (restore, maintenance).',
    howToFix: 'Retry later.',
    retryable: true,
  },
  {
    key: 'ORA-01401',
    dependency: 'oracle',
    hint: 'Value too long',
    detail:
      'An inserted value is larger than the column (older message form of ORA-12899).',
    howToFix: 'Validate the length.',
    level: 'warn',
  },
  {
    key: 'ORA-01405',
    dependency: 'oracle',
    hint: 'NULL fetched into non-null',
    detail:
      'A NULL column was fetched into a variable without an indicator. Driver/host variable issue.',
    howToFix:
      'Handle NULL in the query with NVL, or fetch into a nullable variable.',
    category: 'bug',
  },
  {
    key: 'ORA-01410',
    dependency: 'oracle',
    hint: 'Invalid ROWID',
    detail:
      'A ROWID that no longer exists was used (the row was deleted or the table rebuilt).',
    howToFix: 'Reload the row by its key instead of a stored ROWID.',
    category: 'data',
  },
  {
    key: 'ORA-01430',
    dependency: 'oracle',
    hint: 'Column already exists',
    detail: 'ALTER TABLE ADD for an existing column. A migration ran twice.',
    howToFix:
      'Check the migrations table, or make the migration skip an existing column.',
    category: 'config',
  },
  {
    key: 'ORA-01435',
    dependency: 'oracle',
    hint: 'Schema does not exist',
    detail: 'The user/schema named in the query does not exist.',
    howToFix: 'Check the schema prefix and the DB env.',
    category: 'config',
  },
  {
    key: 'ORA-01436',
    dependency: 'oracle',
    hint: 'CONNECT BY loop',
    detail:
      'A hierarchical query met a cycle in the data (a node whose parent chain returns to itself).',
    howToFix: 'Use NOCYCLE or fix the rows.',
    category: 'data',
  },
  {
    key: 'ORA-01439',
    dependency: 'oracle',
    hint: 'Column must be empty',
    detail: 'ALTER TABLE MODIFY datatype needs an empty column.',
    howToFix: 'Make the migration copy the data first.',
    category: 'config',
  },
  {
    key: 'ORA-01450',
    dependency: 'oracle',
    hint: 'Index key too long',
    detail: 'The index key exceeds the maximum length for the block size.',
    howToFix: 'Shorten the indexed columns.',
    category: 'config',
  },
  {
    key: 'ORA-01451',
    dependency: 'oracle',
    hint: 'Column already nullable',
    detail:
      'ALTER TABLE MODIFY NULL on a column that already allows NULL (a migration ran twice), or whose NOT NULL comes from a primary key.',
    howToFix:
      'Check the migrations table and remove the redundant MODIFY; drop the primary key first if it enforces the NOT NULL.',
    category: 'config',
  },
  {
    key: 'ORA-01452',
    dependency: 'oracle',
    hint: 'Duplicate keys for unique',
    detail: 'CREATE UNIQUE INDEX found duplicate values already in the table.',
    howToFix: 'Clean the duplicates before the migration.',
    category: 'data',
  },
  {
    key: 'ORA-01453',
    dependency: 'oracle',
    hint: 'SET TRANSACTION too late',
    detail: 'SET TRANSACTION must be the first statement of the transaction.',
    howToFix: 'Check the isolation level setup.',
    category: 'bug',
  },
  {
    key: 'ORA-01481',
    dependency: 'oracle',
    hint: 'Invalid number format',
    detail: 'The TO_NUMBER/TO_CHAR format model is invalid.',
    howToFix:
      'Check the format model against the Oracle number format elements.',
    category: 'bug',
  },
  {
    key: 'ORA-01555',
    dependency: 'oracle',
    hint: 'Snapshot too old',
    detail:
      'A long-running query needed undo data that was overwritten. The query or export ran too long.',
    howToFix: 'Split it or ask the DBA about undo retention.',
    retryable: true,
  },
  {
    key: 'ORA-01652',
    dependency: 'oracle',
    hint: 'TEMP tablespace full',
    detail:
      'A sort/hash join exhausted the TEMP tablespace. The query sorts too much data.',
    howToFix: 'Add an index or split the work. The DBA can grow TEMP.',
    category: 'dependency',
  },
  {
    key: 'ORA-01653',
    dependency: 'oracle',
    hint: 'Tablespace full (table)',
    detail: 'A table cannot extend: the tablespace is full.',
    howToFix: 'Ask the DBA to add a datafile.',
    category: 'dependency',
  },
  {
    key: 'ORA-01654',
    dependency: 'oracle',
    hint: 'Tablespace full (index)',
    detail: 'An index cannot extend: the tablespace is full.',
    howToFix: 'Ask the DBA to add a datafile.',
    category: 'dependency',
  },
  {
    key: 'ORA-01658',
    dependency: 'oracle',
    hint: 'Tablespace full (segment)',
    detail: 'A new segment cannot be created: the tablespace is full.',
    howToFix: 'Ask the DBA.',
    category: 'dependency',
  },
  {
    key: 'ORA-01720',
    dependency: 'oracle',
    hint: 'Grant option missing',
    detail:
      'Granting on a view, or replacing a view that has grants, needs the GRANT OPTION on its underlying objects from other schemas.',
    howToFix:
      'Ask the owner of the underlying objects to grant them WITH GRANT OPTION.',
    category: 'config',
  },
  {
    key: 'ORA-01723',
    dependency: 'oracle',
    hint: 'Zero-length column',
    detail: 'A CTAS/ALTER produced a column with no length (CAST of NULL).',
    howToFix: 'Specify the type.',
    category: 'bug',
  },
  {
    key: 'ORA-01732',
    dependency: 'oracle',
    hint: 'View not updatable',
    detail:
      'An INSERT/UPDATE/DELETE hit a view that cannot be modified (joins, aggregates).',
    howToFix: 'Write to the base table.',
    category: 'bug',
  },
  {
    key: 'ORA-01747',
    dependency: 'oracle',
    hint: 'Invalid column reference',
    detail:
      'An UPDATE SET uses a column name Oracle rejects: a reserved word (e.g. "level", "comment", "date") unquoted.',
    howToFix: 'Quote or rename it.',
    category: 'bug',
  },
  {
    key: 'ORA-01756',
    dependency: 'oracle',
    hint: 'Quoted string not ended',
    detail:
      'A string literal is missing its closing quote: a raw query concatenating a value with an apostrophe.',
    howToFix: 'Use bind parameters.',
    category: 'bug',
  },
  {
    key: 'ORA-01779',
    dependency: 'oracle',
    hint: 'Key-preserved table',
    detail: 'An UPDATE through a join view touches a non-key-preserved table.',
    howToFix: 'Update the base table directly or use MERGE.',
    category: 'bug',
  },
  {
    key: 'ORA-01789',
    dependency: 'oracle',
    hint: 'UNION column mismatch',
    detail: 'The queries in a UNION have a different number of columns.',
    howToFix: 'Select the same number of columns in each query of the UNION.',
    category: 'bug',
  },
  {
    key: 'ORA-01790',
    dependency: 'oracle',
    hint: 'UNION type mismatch',
    detail: 'A column in a UNION has different types across the queries.',
    howToFix: 'CAST them to one type.',
    category: 'bug',
  },
  {
    key: 'ORA-01917',
    dependency: 'oracle',
    hint: 'User or role missing',
    detail: 'A GRANT names a user or role that does not exist.',
    howToFix: 'Create the user or role first, or fix the name in the GRANT.',
    category: 'config',
  },
  {
    key: 'ORA-01920',
    dependency: 'oracle',
    hint: 'User already exists',
    detail: 'CREATE USER for an existing user/role name.',
    howToFix: 'Skip CREATE USER when the user exists, or choose another name.',
    category: 'config',
  },
  {
    key: 'ORA-01927',
    dependency: 'oracle',
    hint: 'Privilege not granted',
    detail: 'A REVOKE named a privilege that this user did not grant.',
    howToFix:
      'Revoke as the original grantor; DBA_TAB_PRIVS shows who granted it.',
    category: 'config',
  },
  {
    key: 'ORA-01930',
    dependency: 'oracle',
    hint: 'Object type not grantable',
    detail: 'AUDIT or NOAUDIT was used on an object that cannot be audited.',
    howToFix: 'Remove the AUDIT statement for that object.',
    category: 'config',
  },
  {
    key: 'ORA-01950',
    dependency: 'oracle',
    hint: 'No tablespace quota',
    detail: 'The user has no quota on the tablespace, so inserts fail.',
    howToFix: 'Ask the DBA for a quota.',
    category: 'config',
  },
  {
    key: 'ORA-02049',
    dependency: 'oracle',
    hint: 'Distributed lock timeout',
    detail:
      'A statement over a DB link waited too long for a lock on the remote database.',
    howToFix: 'Roll back the transaction and retry it.',
    retryable: true,
  },
  {
    key: 'ORA-02264',
    dependency: 'oracle',
    hint: 'Constraint name taken',
    detail:
      'A constraint with this name already exists. A migration ran twice or names collide.',
    howToFix:
      'Check the migrations table, or give the constraint a unique name.',
    category: 'config',
  },
  {
    key: 'ORA-02266',
    dependency: 'oracle',
    hint: 'Table referenced by FKs',
    detail:
      'TRUNCATE/DROP on a table whose primary key is referenced by enabled foreign keys.',
    howToFix: 'Disable them first.',
    category: 'config',
  },
  {
    key: 'ORA-02270',
    dependency: 'oracle',
    hint: 'FK target not a key',
    detail: 'A foreign key references columns without a primary/unique key.',
    howToFix:
      'Make the foreign key reference the primary key or a unique-constrained column list.',
    category: 'config',
  },
  {
    key: 'ORA-02275',
    dependency: 'oracle',
    hint: 'FK already exists',
    detail:
      'A referential constraint with these columns already exists. A migration ran twice.',
    howToFix:
      'Check the migrations table, or remove the duplicate foreign key from the migration.',
    category: 'config',
  },
  {
    key: 'ORA-02287',
    dependency: 'oracle',
    hint: 'Sequence not allowed here',
    detail:
      'NEXTVAL is used in a place Oracle forbids (DISTINCT, GROUP BY, subquery).',
    howToFix: 'Fetch the value first.',
    category: 'bug',
  },
  {
    key: 'ORA-02289',
    dependency: 'oracle',
    hint: 'Sequence does not exist',
    detail:
      'The sequence is missing (see target) or not granted: a migration not run, or the wrong schema.',
    howToFix: 'Check the entity generation strategy.',
    category: 'config',
  },
  {
    key: 'ORA-02290',
    dependency: 'oracle',
    hint: 'Check constraint violated',
    detail:
      'A CHECK constraint rejected the value: outside the allowed set/range.',
    howToFix: 'Validate the field in the DTO.',
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
        detail: `CHECK constraint ${name} rejected the value.`,
        howToFix:
          'Validate the field against the allowed values before saving.',
      }
    },
  },
  {
    key: 'ORA-02293',
    dependency: 'oracle',
    hint: 'Check constraint violated',
    detail:
      'Enabling a CHECK constraint failed because existing rows violate it.',
    howToFix: 'Clean the data first.',
    category: 'data',
  },
  {
    key: 'ORA-02296',
    dependency: 'oracle',
    hint: 'Cannot enable constraint',
    detail:
      'Existing rows violate the constraint being enabled (NOT NULL on a column with nulls).',
    howToFix: 'Fix the data in the migration.',
    category: 'data',
  },
  {
    key: 'ORA-02298',
    dependency: 'oracle',
    hint: 'Orphan rows block FK',
    detail: 'Enabling a foreign key found child rows without a parent.',
    howToFix: 'Clean the orphans first.',
    category: 'data',
  },
  {
    key: 'ORA-02303',
    dependency: 'oracle',
    hint: 'Type has dependents',
    detail:
      'A type cannot be dropped or replaced because other types or tables depend on it.',
    howToFix:
      'Drop or alter the dependent tables first, or use DROP TYPE ... FORCE.',
    category: 'config',
  },
  {
    key: 'ORA-02429',
    dependency: 'oracle',
    hint: 'Index backs a constraint',
    detail: 'DROP INDEX on an index that enforces a unique/primary key.',
    howToFix: 'Drop the constraint instead.',
    category: 'config',
  },
  {
    key: 'ORA-02449',
    dependency: 'oracle',
    hint: 'Keys referenced by FKs',
    detail: 'DROP TABLE failed because foreign keys reference it.',
    howToFix: 'Drop them first (or CASCADE CONSTRAINTS).',
    category: 'config',
  },
  {
    key: 'ORA-04021',
    dependency: 'oracle',
    hint: 'Timeout locking object',
    detail:
      'A DDL/compile waited for a lock on an object in use (a package being executed).',
    howToFix: 'Retry when idle.',
    retryable: true,
  },
  {
    key: 'ORA-04030',
    dependency: 'oracle',
    hint: 'Oracle process out of memory',
    detail:
      'The server process could not allocate PGA memory (huge sort, collection).',
    howToFix: 'Simplify the query or ask the DBA.',
    category: 'dependency',
  },
  {
    key: 'ORA-04031',
    dependency: 'oracle',
    hint: 'Oracle shared pool full',
    detail: 'The shared pool is exhausted, often by unbound literal SQL.',
    howToFix: 'Use bind parameters; the DBA may flush/grow the pool.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ORA-04036',
    dependency: 'oracle',
    hint: 'PGA limit exceeded',
    detail:
      'The instance PGA_AGGREGATE_LIMIT was hit. A query uses too much memory.',
    howToFix: 'Simplify the query.',
    category: 'dependency',
  },
  {
    key: 'ORA-04043',
    dependency: 'oracle',
    hint: 'Object does not exist',
    detail: 'The named object is missing (see target).',
    howToFix: 'Check the name and schema.',
    category: 'config',
    target: /object ([^\s]+) does not exist/,
  },
  {
    key: 'ORA-04061',
    dependency: 'oracle',
    hint: 'Package state invalidated',
    detail: 'A package was recompiled while the session had state.',
    howToFix: 'Retry the call; the next execution succeeds.',
    retryable: true,
  },
  {
    key: 'ORA-04063',
    dependency: 'oracle',
    hint: 'Package has errors',
    detail: 'A package/view is invalid (compile errors) (see target).',
    howToFix: 'Recompile it; check the DBA_ERRORS view.',
    category: 'config',
    target: /^ORA-04063: (.+) has errors/,
  },
  {
    key: 'ORA-04088',
    dependency: 'oracle',
    hint: 'Trigger failed',
    detail:
      'A trigger raised an error (see target). The real cause is the next ORA- line in the message.',
    howToFix: 'Fix the error raised inside the trigger.',
    category: 'bug',
    target: /trigger '([^']+)'/,
  },
  {
    key: 'ORA-04091',
    dependency: 'oracle',
    hint: 'Mutating table in trigger',
    detail:
      'A row trigger queried or modified the table that fired it (see target).',
    howToFix: 'Use a compound trigger or move the logic.',
    category: 'bug',
    target: /table ([^\s]+) is mutating/,
  },
  {
    key: 'ORA-04098',
    dependency: 'oracle',
    hint: 'Trigger invalid',
    detail: 'A trigger is invalid and could not be revalidated (see target).',
    howToFix: 'Recompile it.',
    category: 'config',
    target: /trigger '([^']+)'/,
  },
  {
    key: 'ORA-06502',
    dependency: 'oracle',
    hint: 'PL/SQL value error',
    detail:
      'A PL/SQL variable got a value too long, non-numeric, or NULL where not allowed.',
    howToFix: 'Check the inputs to the procedure.',
    level: 'warn',
  },
  {
    key: 'ORA-06508',
    dependency: 'oracle',
    hint: 'PL/SQL unit not found',
    detail: 'A called package/procedure is missing or invalid.',
    howToFix: 'Deploy or recompile it.',
    category: 'config',
  },
  {
    key: 'ORA-06512',
    dependency: 'oracle',
    hint: 'PL/SQL error location',
    detail:
      'The error came from PL/SQL (see target for the unit and line). The real cause is the first ORA- line in the message.',
    howToFix:
      'Fix the PL/SQL unit at that line, or the input that made it fail.',
    category: 'bug',
    target: /at "([^"]+)", line (\d+)/,
  },
  {
    key: 'ORA-06530',
    dependency: 'oracle',
    hint: 'Uninitialized object',
    detail: 'A PL/SQL object type variable was used before being initialized.',
    howToFix: 'Initialize the object with its constructor before use.',
    category: 'bug',
  },
  {
    key: 'ORA-06531',
    dependency: 'oracle',
    hint: 'Uninitialized collection',
    detail: 'A PL/SQL nested table/varray was used before being initialized.',
    howToFix: 'Initialize the collection with its constructor before use.',
    category: 'bug',
  },
  {
    key: 'ORA-06533',
    dependency: 'oracle',
    hint: 'Collection index too big',
    detail: 'A PL/SQL collection subscript is beyond its count.',
    howToFix: 'Extend the collection first.',
    category: 'bug',
  },
  {
    key: 'ORA-06550',
    dependency: 'oracle',
    hint: 'PL/SQL compile error',
    detail:
      'The PL/SQL block has a syntax or semantic error (see the PLS- line in the message). Usually a raw block with a wrong identifier.',
    howToFix: 'Fix the block at the position the PLS- line reports.',
    category: 'bug',
  },
  {
    key: 'ORA-06553',
    dependency: 'oracle',
    hint: 'PL/SQL call invalid',
    detail:
      'SQL could not compile a call to a PL/SQL function, often because of wrong arguments (see the PLS- line).',
    howToFix: 'Match the call arguments to the function signature.',
    category: 'bug',
  },
  {
    key: 'ORA-00600',
    dependency: 'oracle',
    hint: 'Oracle internal error',
    detail: 'An Oracle kernel internal error (ORA-00600).',
    howToFix: 'Collect the arguments and alert the DBA; retry may succeed.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ORA-07445',
    dependency: 'oracle',
    hint: 'Oracle process crashed',
    detail:
      'An Oracle server process hit an OS exception (ORA-07445). The session is gone.',
    howToFix: 'Alert the DBA.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ORA-00604',
    dependency: 'oracle',
    hint: 'Recursive SQL error',
    detail:
      'An error inside Oracle recursive SQL (data dictionary, a logon trigger). The real cause is the next ORA- line.',
    howToFix:
      'Fix the error in the next ORA- line; ask the DBA when it comes from a logon trigger.',
    category: 'dependency',
  },
  {
    key: 'ORA-00028',
    dependency: 'oracle',
    hint: 'Session killed',
    detail: 'A DBA killed this session (ALTER SYSTEM KILL SESSION).',
    howToFix: 'Reconnect; check why it was killed (long query, lock).',
    retryable: true,
  },
  {
    key: 'ORA-00030',
    dependency: 'oracle',
    hint: 'Session id invalid',
    detail: 'The session referenced no longer exists.',
    howToFix: 'Reconnect and retry the operation.',
    retryable: true,
  },
  {
    key: 'ORA-00257',
    dependency: 'oracle',
    hint: 'Archive log destination full',
    detail: 'Oracle cannot archive redo logs (disk full), so all writes block.',
    howToFix: 'Alert the DBA immediately.',
    category: 'dependency',
  },
  {
    key: 'ORA-00020',
    dependency: 'oracle',
    hint: 'Oracle max processes',
    detail:
      'The instance PROCESSES limit is reached: too many connections across pods.',
    howToFix: 'Shrink pools or ask the DBA to raise it.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ORA-00018',
    dependency: 'oracle',
    hint: 'Oracle max sessions',
    detail: 'The instance SESSIONS limit is reached.',
    howToFix: 'Shrink connection pools or ask the DBA to raise it.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ORA-00059',
    dependency: 'oracle',
    hint: 'Max DB_FILES exceeded',
    detail: 'The database cannot add more datafiles.',
    howToFix: 'Ask the DBA.',
    category: 'dependency',
  },
  {
    key: 'ORA-08002',
    dependency: 'oracle',
    hint: 'CURRVAL before NEXTVAL',
    detail: 'sequence.CURRVAL was read before NEXTVAL in this session.',
    howToFix: 'Use NEXTVAL or RETURNING.',
    category: 'bug',
  },
  {
    key: 'ORA-08004',
    dependency: 'oracle',
    hint: 'Sequence exhausted',
    detail: 'The sequence passed its MAXVALUE (or MINVALUE when descending).',
    howToFix: 'Alter the sequence (NOMAXVALUE or a larger max).',
    category: 'config',
  },
  {
    key: 'ORA-08006',
    dependency: 'oracle',
    hint: 'Row already deleted',
    detail: 'The row to update/delete was deleted by another session.',
    howToFix: 'Reload before acting.',
    level: 'warn',
    category: 'data',
  },
  {
    key: 'ORA-08103',
    dependency: 'oracle',
    hint: 'Object no longer exists',
    detail:
      'The object was dropped or truncated while the query ran (a global temp table, a rebuilt index).',
    howToFix: 'Retry.',
    retryable: true,
  },
  {
    key: 'ORA-08177',
    dependency: 'oracle',
    hint: 'Serializable conflict',
    detail:
      'A SERIALIZABLE transaction met a row changed by another transaction.',
    howToFix: 'Retry the transaction.',
    retryable: true,
    category: 'data',
  },
  {
    key: 'ORA-12154',
    dependency: 'oracle',
    hint: 'TNS name not resolved',
    detail:
      'The connect string alias is not in tnsnames.ora, or TNS_ADMIN is wrong.',
    howToFix: 'Use an Easy Connect string (host:port/service) in {env}.',
    category: 'config',
  },
  {
    key: 'ORA-12505',
    dependency: 'oracle',
    hint: 'Oracle SID unknown',
    detail: 'The listener does not know the SID in {env}.',
    howToFix: 'Use the service name instead (host:port/service).',
    category: 'config',
  },
  {
    key: 'ORA-12516',
    dependency: 'oracle',
    hint: 'Oracle handler unavailable',
    detail:
      'The listener has no ready handler for the service; handlers block new connections, often because the database hit its PROCESSES limit.',
    howToFix: 'Shrink pools; retry.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ORA-12518',
    dependency: 'oracle',
    hint: 'Oracle handoff failed',
    detail:
      'The listener could not hand the connection to a server process (database overloaded or restarting).',
    howToFix: 'Retry.',
    retryable: true,
  },
  {
    key: 'ORA-12519',
    dependency: 'oracle',
    hint: 'Oracle no free handler',
    detail:
      'The listener has no handler with free capacity (PROCESSES limit, or the listener status is stale).',
    howToFix: 'Retry; shrink pools.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ORA-12520',
    dependency: 'oracle',
    hint: 'Oracle handler type missing',
    detail:
      'No listener handler for the requested service type (dedicated/shared).',
    howToFix: 'Check the connect string.',
    category: 'config',
  },
  {
    key: 'ORA-12528',
    dependency: 'oracle',
    hint: 'Oracle blocking connections',
    detail:
      'The instance is starting (restricted mode) and blocks new connections.',
    howToFix: 'Retry in a minute.',
    retryable: true,
  },
  {
    key: 'ORA-12537',
    dependency: 'oracle',
    hint: 'Oracle connection closed',
    detail:
      'The listener closed the connection at once: a firewall, a listener restart, or an invalid connect string.',
    howToFix: 'Check {env}.',
    retryable: true,
  },
  {
    key: 'ORA-12543',
    dependency: 'oracle',
    hint: 'Oracle host unreachable',
    detail: 'No route to {host}: network policy, VPN or a wrong host in {env}.',
    howToFix: 'Check the network path to {host} and the host in {env}.',
    retryable: true,
  },
  {
    key: 'ORA-12545',
    dependency: 'oracle',
    hint: 'Oracle host not found',
    detail: 'The host in {env} does not resolve.',
    howToFix: 'Check the DB host env var.',
    category: 'config',
  },
  {
    key: 'ORA-12547',
    dependency: 'oracle',
    hint: 'Oracle connection lost',
    detail:
      'The connection got end-of-file during connect: the server process died or the listener is misconfigured.',
    howToFix: 'Retry.',
    retryable: true,
  },
  {
    key: 'ORA-12560',
    dependency: 'oracle',
    hint: 'Oracle protocol adapter',
    detail:
      'A lower-level network protocol error occurred while connecting (a wrong protocol in the address, an empty connect string, or the service down).',
    howToFix: 'Check {env}.',
    category: 'config',
  },
  {
    key: 'ORA-12571',
    dependency: 'oracle',
    hint: 'Oracle packet write failed',
    detail:
      'The network dropped mid-request (firewall idle timeout, server crash).',
    howToFix: 'Retry.',
    retryable: true,
  },
  {
    key: 'ORA-12801',
    dependency: 'oracle',
    hint: 'Parallel query failed',
    detail:
      'A parallel query slave hit an error. The real cause is the next ORA- line in the message.',
    howToFix: 'Fix the error in the next ORA- line, then rerun the query.',
    category: 'dependency',
  },
  {
    key: 'ORA-12838',
    dependency: 'oracle',
    hint: 'Read after parallel DML',
    detail:
      'A table modified by parallel/direct-path DML was read before COMMIT.',
    howToFix: 'Commit first.',
    category: 'bug',
  },
  {
    key: 'ORA-14400',
    dependency: 'oracle',
    hint: 'No partition for key',
    detail:
      'The inserted value maps to no table partition (a date beyond the last range partition).',
    howToFix:
      'Add a partition that covers the key, or switch the table to interval partitioning.',
    category: 'config',
  },
  {
    key: 'ORA-14551',
    dependency: 'oracle',
    hint: 'DML inside query',
    detail: 'A function called from SQL performed DML.',
    howToFix: 'Make the function autonomous or call it from PL/SQL.',
    category: 'bug',
  },
  {
    key: 'ORA-22275',
    dependency: 'oracle',
    hint: 'Invalid LOB locator',
    detail:
      'The LOB locator is invalid: never initialized, the wrong LOB type for the call, or a LOB written in a trigger.',
    howToFix:
      'Initialize the LOB (EMPTY_CLOB) before writing it, and pass the LOB type the call expects.',
    category: 'bug',
  },
  {
    key: 'ORA-22835',
    dependency: 'oracle',
    hint: 'CLOB too long for VARCHAR',
    detail:
      'A CLOB longer than 4000 bytes was cast to VARCHAR2 (SUBSTR/TO_CHAR on a CLOB).',
    howToFix: 'Keep it as CLOB or use DBMS_LOB.SUBSTR.',
    category: 'bug',
  },
  {
    key: 'ORA-22922',
    dependency: 'oracle',
    hint: 'Nonexistent LOB value',
    detail:
      'A LOB locator points to a value that no longer exists (a temporary LOB freed, or the row rolled back).',
    howToFix: 'Read the LOB while its row and transaction are still valid.',
    category: 'bug',
  },
  {
    key: 'ORA-24338',
    dependency: 'oracle',
    hint: 'Cursor not executed',
    detail:
      'A ref cursor was fetched without being opened (the procedure did not OPEN it on this path).',
    howToFix: 'OPEN the ref cursor on every path of the procedure.',
    category: 'bug',
  },
  {
    key: 'ORA-24381',
    dependency: 'oracle',
    hint: 'Batch errors in array DML',
    detail: 'executeMany with batchErrors found failing rows.',
    howToFix: 'Read error.batchErrors for each row offset.',
    level: 'warn',
  },
  {
    key: 'ORA-24550',
    dependency: 'oracle',
    hint: 'Oracle process signal',
    detail: 'The server process received a fatal signal.',
    howToFix: 'Alert the DBA.',
    category: 'dependency',
  },
  {
    key: 'ORA-24756',
    dependency: 'oracle',
    hint: 'Transaction does not exist',
    detail:
      'A commit/rollback referenced a transaction Oracle does not know (already ended, or a 2PC mismatch).',
    howToFix: 'Make sure commit or rollback runs once per transaction.',
    category: 'bug',
  },
  {
    key: 'ORA-24761',
    dependency: 'oracle',
    hint: 'Transaction rolled back',
    detail:
      'The server rolled the transaction back when the application tried to commit it.',
    howToFix: 'Retry the unit of work.',
    retryable: true,
  },
  {
    key: 'ORA-25153',
    dependency: 'oracle',
    hint: 'TEMP tablespace empty',
    detail: 'The temporary tablespace has no datafiles.',
    howToFix: 'Ask the DBA.',
    category: 'dependency',
  },
  {
    key: 'ORA-25228',
    dependency: 'oracle',
    hint: 'AQ dequeue timed out',
    detail: 'A dequeue waited the full timeout with no message.',
    howToFix:
      'Ignore it when polling; otherwise check that messages are enqueued.',
    level: 'warn',
  },
  {
    key: 'ORA-28000',
    dependency: 'oracle',
    hint: 'Oracle account locked',
    detail: 'The DB user is locked (too many failed logins or admin action).',
    howToFix:
      'Ask the DBA to unlock it; find the client with the old password.',
    category: 'config',
  },
  {
    key: 'ORA-28002',
    dependency: 'oracle',
    hint: 'Oracle password expires soon',
    detail: 'The DB password is in its grace period.',
    howToFix: 'Rotate it before it expires (ORA-28001).',
    level: 'warn',
    category: 'config',
  },
  {
    key: 'ORA-28003',
    dependency: 'oracle',
    hint: 'Password rejected by policy',
    detail: 'The new password fails the verification function.',
    howToFix: 'Choose one matching the policy.',
    level: 'warn',
  },
  {
    key: 'ORA-28007',
    dependency: 'oracle',
    hint: 'Password reused',
    detail: 'The new password was used before and the policy forbids reuse.',
    howToFix: 'Choose a password that was not used before.',
    level: 'warn',
  },
  {
    key: 'ORA-28009',
    dependency: 'oracle',
    hint: 'SYS needs SYSDBA',
    detail: 'Connecting as SYS requires SYSDBA/SYSOPER.',
    howToFix: 'Connect the app with its own user; the app should not use SYS.',
    category: 'config',
  },
  {
    key: 'ORA-28040',
    dependency: 'oracle',
    hint: 'Auth protocol mismatch',
    detail:
      'The client auth version is not allowed by SQLNET.ALLOWED_LOGON_VERSION on the server.',
    howToFix: 'Upgrade the client or relax the server setting.',
    category: 'config',
  },
  {
    key: 'ORA-28100',
    dependency: 'oracle',
    hint: 'VPD policy function invalid',
    detail:
      'The schema that owns a VPD (row-level security) policy function does not exist.',
    howToFix:
      'Ask the DBA to recreate the policy with a function owned by an existing user.',
    category: 'config',
  },
  {
    key: 'ORA-29913',
    dependency: 'oracle',
    hint: 'External table failed',
    detail:
      'An external table / ODCI callout failed (missing file, bad directory).',
    howToFix: 'Check the next ORA- line.',
    category: 'config',
  },
  {
    key: 'ORA-30036',
    dependency: 'oracle',
    hint: 'UNDO tablespace full',
    detail: 'A large transaction exhausted the undo tablespace.',
    howToFix: 'Commit in batches; the DBA can grow UNDO.',
    category: 'dependency',
  },
  {
    key: 'ORA-31011',
    dependency: 'oracle',
    hint: 'XML parsing failed',
    detail: 'XMLTYPE got invalid XML.',
    howToFix: 'Validate the document before inserting.',
    level: 'warn',
  },
  {
    key: 'ORA-40441',
    dependency: 'oracle',
    hint: 'JSON syntax error',
    detail: 'A JSON column or JSON_VALUE got invalid JSON.',
    howToFix: 'Validate before inserting.',
    level: 'warn',
  },
  {
    key: 'ORA-56600',
    dependency: 'oracle',
    hint: 'Illegal concurrent call',
    detail:
      'An OCI call that DRCP (Database Resident Connection Pooling) does not allow was made on a pooled server connection.',
    howToFix:
      'Check the DRCP usage rules, or connect without the pooled server option to confirm DRCP is the cause.',
    category: 'bug',
  },
  {
    key: 'ORA-64203',
    dependency: 'oracle',
    hint: 'LOB buffer too small',
    detail:
      'A LOB cast to VARCHAR2 exceeds the buffer (multibyte Thai text over 4000 bytes).',
    howToFix: 'Read it as a LOB.',
    category: 'bug',
  },
  {
    key: 'ORA-65096',
    dependency: 'oracle',
    hint: 'Common user name invalid',
    detail: 'In a CDB root, user names must start with C##.',
    howToFix: 'Create the user in the PDB instead.',
    category: 'config',
  },
  {
    key: 'ORA_USER_DEFINED',
    messageMatch: /^ORA-20\d{3}:/,
    hint: 'PL/SQL raised an error',
    detail:
      'A stored procedure raised RAISE_APPLICATION_ERROR (ORA-20000..20999). The message text is the business reason the procedure gave.',
    howToFix:
      'Handle the reason in the message, or validate that case before calling the procedure.',
    category: 'input',
    level: 'warn',
    target: /^(ORA-20\d{3})/,
  },
  // --- node-oracledb NJS- codes (lib/errors.js) ---
  {
    key: 'NJS-002',
    dependency: 'oracle',
    hint: 'Pool invalid or closed',
    detail:
      'A connection was requested from a pool that was closed or never created.',
    howToFix: 'Check the DataSource lifecycle.',
    category: 'bug',
  },
  {
    key: 'NJS-003',
    dependency: 'oracle',
    hint: 'Connection already closed',
    detail:
      'A query ran on a connection that was released/closed: a missing await in a transaction, or work after release.',
    howToFix:
      'Await every query in the transaction and finish the work before releasing the connection.',
    category: 'bug',
  },
  {
    key: 'NJS-005',
    dependency: 'oracle',
    hint: 'Invalid driver parameter',
    detail:
      'A node-oracledb method got an invalid value for one of its arguments (see message for the position), such as binds or options of the wrong type.',
    howToFix: 'Check the arguments of that call against the node-oracledb API.',
    category: 'bug',
  },
  {
    key: 'NJS-007',
    dependency: 'oracle',
    hint: 'Invalid bind value',
    detail:
      'A property of an options or bind object passed to node-oracledb has an invalid value (see message for the property).',
    howToFix:
      'Check that property against the allowed values in the node-oracledb API.',
    category: 'bug',
  },
  {
    key: 'NJS-009',
    dependency: 'oracle',
    hint: 'Wrong number of arguments',
    detail: 'A node-oracledb function got the wrong number of arguments.',
    howToFix: 'Check the call against the node-oracledb API.',
    category: 'bug',
  },
  {
    key: 'NJS-010',
    dependency: 'oracle',
    hint: 'Unsupported column type',
    detail:
      'A fetched column has a type node-oracledb does not support (see message).',
    howToFix: 'Cast it in the SQL.',
    category: 'bug',
  },
  {
    key: 'NJS-011',
    dependency: 'oracle',
    hint: 'Bind type mismatch',
    detail:
      'A bind value does not match its declared type (a string bound as NUMBER).',
    howToFix: 'Check the parameter types.',
    category: 'bug',
  },
  {
    key: 'NJS-012',
    dependency: 'oracle',
    hint: 'Invalid bind data type',
    detail:
      'A bind value has a JavaScript type node-oracledb cannot bind without a declared type, such as a plain object or a function.',
    howToFix:
      'Convert it to a string, number, Date or Buffer, or declare the bind type.',
    category: 'bug',
  },
  {
    key: 'NJS-016',
    dependency: 'oracle',
    hint: 'OUT bind buffer too small',
    detail: 'An OUT bind returned more data than maxSize.',
    howToFix: 'Raise maxSize on the bind.',
    category: 'bug',
  },
  {
    key: 'NJS-017',
    dependency: 'oracle',
    hint: 'Concurrent ResultSet use',
    detail:
      'Two operations ran on one ResultSet at once (a missing await in a fetch loop).',
    howToFix: 'Await each ResultSet call before the next one.',
    category: 'bug',
  },
  {
    key: 'NJS-018',
    dependency: 'oracle',
    hint: 'ResultSet already closed',
    detail:
      'A ResultSet was used after close() or after its connection was released.',
    howToFix:
      'Finish reading the ResultSet before closing it or releasing the connection.',
    category: 'bug',
  },
  {
    key: 'NJS-022',
    dependency: 'oracle',
    hint: 'LOB already closed',
    detail: 'A LOB was read after it or its connection was closed.',
    howToFix: 'Read LOBs before releasing the connection.',
    category: 'bug',
  },
  {
    key: 'NJS-023',
    dependency: 'oracle',
    hint: 'Concurrent LOB use',
    detail: 'Two operations ran on one LOB at once.',
    howToFix: 'Await each LOB operation before starting the next.',
    category: 'bug',
  },
  {
    key: 'NJS-024',
    dependency: 'oracle',
    hint: 'Driver out of memory',
    detail: 'node-oracledb could not allocate memory (a huge fetch or LOB).',
    howToFix: 'Page the query or stream the LOB.',
    category: 'bug',
  },
  {
    key: 'NJS-036',
    dependency: 'oracle',
    hint: 'Array bind too large',
    detail: 'An array bind is longer than maxArraySize.',
    howToFix: 'Raise maxArraySize or chunk the array.',
    category: 'bug',
  },
  {
    key: 'NJS-040',
    dependency: 'oracle',
    hint: 'DB pool queue timeout',
    detail:
      'Waited queueTimeout for a free connection: every pooled connection is busy with slow queries, or a connection leak.',
    howToFix: 'Check pool max and slow SQL.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'NJS-045',
    dependency: 'oracle',
    hint: 'Oracle Thick binary missing',
    detail:
      'The node-oracledb Thick mode binary could not be loaded on this platform.',
    howToFix: 'Use Thin mode or install the Instant Client.',
    category: 'config',
  },
  {
    key: 'NJS-047',
    dependency: 'oracle',
    hint: 'Pool alias not found',
    detail: 'getPool(alias) found no pool with that alias.',
    howToFix: 'Check the pool creation order.',
    category: 'bug',
  },
  {
    key: 'NJS-058',
    dependency: 'oracle',
    hint: 'Bind value exceeds maxSize',
    detail: 'A bind value is longer than its maxSize (see message).',
    howToFix: 'Raise maxSize for that bind.',
    category: 'bug',
  },
  {
    key: 'NJS-064',
    dependency: 'oracle',
    hint: 'DB pool closing',
    detail:
      'A connection was requested while the pool was closing (shutdown in progress).',
    howToFix: 'Stop taking new work before closing the pool.',
    retryable: true,
  },
  {
    key: 'NJS-065',
    dependency: 'oracle',
    hint: 'DB pool closed',
    detail:
      'A connection was requested after the pool was closed, usually a job that ran after shutdown started.',
    howToFix: 'Stop jobs and consumers before closing the pool.',
    category: 'bug',
  },
  {
    key: 'NJS-076',
    dependency: 'oracle',
    hint: 'DB pool queue full',
    detail:
      'More than queueMax requests were waiting for a connection. The DB is slow or the pool is too small for the load.',
    howToFix: 'Check for slow queries, or raise the pool size or queueMax.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'NJS-081',
    dependency: 'oracle',
    hint: 'Concurrent connection use',
    detail:
      'Two operations ran on one connection at once while oracledb.errorOnConcurrentExecute is on: a missing await, or a connection shared across requests.',
    howToFix: 'Await each call and use one connection per request.',
    category: 'bug',
  },
  {
    key: 'NJS-084',
    dependency: 'oracle',
    hint: 'Invalid DB access token',
    detail: 'Token-based authentication got an invalid token.',
    howToFix: 'Check the token provider.',
    category: 'config',
  },
  {
    key: 'NJS-087',
    dependency: 'oracle',
    hint: 'DB access token expired',
    detail: 'The token used for DB auth has expired.',
    howToFix: 'Make the token callback refresh it.',
    category: 'config',
  },
  {
    key: 'NJS-097',
    dependency: 'oracle',
    hint: 'Bind placeholder not found',
    detail: 'A named bind was supplied that the SQL does not use (see target).',
    howToFix: 'Match the bind names to the statement.',
    category: 'bug',
    target: /named ":([^"]+)"/,
  },
  {
    key: 'NJS-098',
    dependency: 'oracle',
    hint: 'Bind count mismatch',
    detail:
      'The SQL has a different number of placeholders than bind values. Often an IN (:...) list built from an empty array.',
    howToFix:
      'Check the bind values against the placeholders, and guard empty lists.',
    category: 'bug',
    explain: ({ message }) => {
      const found = message.match(
        /(\d+) bind placeholders were used .* but (\d+) bind values were provided/,
      )
      return found
        ? {
            target: `${found[1]} vs ${found[2]}`,
            detail: `The SQL has ${found[1]} placeholders but ${found[2]} values were bound.`,
            howToFix: 'Check the parameter array length.',
          }
        : undefined
    },
  },
  {
    key: 'NJS-101',
    dependency: 'oracle',
    hint: 'DB credentials missing',
    detail:
      'No password was given for password authentication; the DB password env var is probably unset.',
    howToFix:
      'Set the DB password env var, or use external or token authentication.',
    category: 'config',
  },
  {
    key: 'NJS-104',
    dependency: 'oracle',
    hint: 'Pool has busy connections',
    detail: 'pool.close() ran while connections were in use.',
    howToFix: 'Drain in-flight work before closing, or pass a drainTime.',
    category: 'bug',
  },
  {
    key: 'NJS-105',
    dependency: 'oracle',
    hint: 'NaN bound to NUMBER',
    detail:
      'A bind value is NaN. A calculation produced NaN (undefined arithmetic) before the query.',
    howToFix:
      'Validate the numeric inputs of the calculation before the query.',
    category: 'bug',
  },
  {
    key: 'NJS-115',
    dependency: 'oracle',
    hint: 'Number not representable',
    detail:
      'A JavaScript number has too many digits, or too large or small an exponent, to be stored as an Oracle NUMBER.',
    howToFix: 'Validate the number range before binding it.',
    category: 'bug',
  },
  {
    key: 'NJS-116',
    dependency: 'oracle',
    hint: 'Old password verifier',
    detail:
      'The DB user has only a 10G password verifier, unsupported in Thin mode.',
    howToFix: 'Reset the password on 11G+ or use Thick mode.',
    category: 'config',
  },
  {
    key: 'NJS-123',
    dependency: 'oracle',
    hint: 'DB call timed out',
    detail:
      'The statement exceeded connection.callTimeout. The query is slow or blocked by a lock.',
    howToFix: 'Check the SQL and locks.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'NJS-138',
    dependency: 'oracle',
    hint: 'DB version unsupported',
    detail: 'Thin mode does not support this Oracle Database version.',
    howToFix: 'Use Thick mode or upgrade the database.',
    category: 'config',
  },
  {
    key: 'NJS-147',
    dependency: 'oracle',
    hint: 'Cursor closed by database',
    detail: 'A fetch ran on a cursor that the database had already closed.',
    howToFix: 'Re-run the query to get a new cursor.',
    retryable: true,
  },
  {
    key: 'NJS-500',
    dependency: 'oracle',
    hint: 'DB connection broken',
    detail:
      'The connection to Oracle was closed or broken (server restart, firewall). The pool discards it.',
    howToFix: 'Retry.',
    retryable: true,
  },
  {
    key: 'NJS-501',
    dependency: 'oracle',
    hint: 'DB connection terminated',
    detail:
      'The connection to {host}:{port} ended unexpectedly (session killed, network reset).',
    howToFix: 'Retry.',
    retryable: true,
  },
  {
    key: 'NJS-503',
    dependency: 'oracle',
    hint: '{Type} "{name}" unreachable',
    detail:
      'Could not open a connection to {host}:{port}. Oracle may be down, or {env} is wrong. The cause is in the message.',
    howToFix: 'Check that Oracle is up and {env} points to it, then retry.',
    retryable: true,
  },
  {
    key: 'NJS-504',
    dependency: 'oracle',
    hint: 'DB proxy connection failed',
    detail: 'Connecting through the HTTPS proxy to Oracle failed.',
    howToFix: 'Check the proxy settings in the connect string.',
    category: 'config',
  },
  {
    key: 'NJS-505',
    dependency: 'oracle',
    hint: 'DB TLS setup failed',
    detail:
      'TLS to Oracle could not start: the wallet or certificate is invalid.',
    howToFix: 'Check the wallet path and password.',
    category: 'config',
  },
  {
    key: 'NJS-506',
    dependency: 'oracle',
    hint: 'DB TLS handshake failed',
    detail:
      'The TLS handshake with {host}:{port} failed: untrusted CA, wrong protocol (tcp vs tcps), or a wallet mismatch.',
    howToFix: 'Check the CA in the wallet and the protocol in {env}.',
    category: 'config',
  },
  {
    key: 'NJS-507',
    dependency: 'oracle',
    hint: 'DB certificate DN mismatch',
    detail: 'The server certificate DN does not match ssl_server_cert_dn.',
    howToFix: 'Fix the DN in the connect string.',
    category: 'config',
  },
  {
    key: 'NJS-508',
    dependency: 'oracle',
    hint: 'DB certificate host mismatch',
    detail: 'The hostname is not in the server certificate.',
    howToFix: 'Connect with the name the certificate was issued for.',
    category: 'config',
  },
  {
    key: 'NJS-510',
    dependency: 'oracle',
    hint: 'DB connect timed out',
    detail:
      'Connecting to {host}:{port} exceeded the connect timeout. Oracle is down or unreachable (firewall, wrong port).',
    howToFix:
      'Check that Oracle is up, the firewall allows {port}, and {env} is correct.',
    retryable: true,
  },
  {
    key: 'NJS-511',
    dependency: 'oracle',
    hint: 'Oracle listener refused',
    detail:
      'The listener at {host}:{port} refused the connection (see cause): wrong service name, listener down, or blocked.',
    howToFix:
      'Check the service name in {env} and that the listener is running.',
    retryable: true,
  },
  {
    key: 'NJS-512',
    dependency: 'oracle',
    hint: 'Connect string invalid',
    detail: 'The connect string parameters are invalid (see message).',
    howToFix: 'Check {env}.',
    category: 'config',
  },
  {
    key: 'NJS-513',
    dependency: 'oracle',
    hint: 'DB in-band notification',
    detail: 'The server sent an in-band error (session killed, planned down).',
    howToFix: 'Reconnect.',
    retryable: true,
  },
  {
    key: 'NJS-514',
    dependency: 'oracle',
    hint: 'Connect string syntax error',
    detail: 'The Oracle connect string could not be parsed.',
    howToFix: 'Check {env} (host:port/service or a full descriptor).',
    category: 'config',
  },
  {
    key: 'NJS-515',
    dependency: 'oracle',
    hint: 'Easy Connect string error',
    detail: 'The Easy Connect string has an invalid part (see message).',
    howToFix: 'Check {env}.',
    category: 'config',
  },
  {
    key: 'NJS-516',
    dependency: 'oracle',
    hint: 'tnsnames.ora not found',
    detail:
      'A TNS alias was used but no configDir/TNS_ADMIN points to tnsnames.ora.',
    howToFix: 'Use host:port/service in {env}.',
    category: 'config',
  },
  {
    key: 'NJS-517',
    dependency: 'oracle',
    hint: 'TNS alias not found',
    detail: 'The alias is not in tnsnames.ora.',
    howToFix: 'Use host:port/service in {env}.',
    category: 'config',
  },
  {
    key: 'NJS-518',
    dependency: 'oracle',
    hint: 'Oracle service unknown',
    detail: 'The listener at {host}:{port} does not know the service name.',
    howToFix: 'Check the service in {env} (lsnrctl services).',
    category: 'config',
  },
  {
    key: 'NJS-519',
    dependency: 'oracle',
    hint: 'Oracle SID unknown',
    detail: 'The listener at {host}:{port} does not know the SID.',
    howToFix: 'Use the service name in {env}.',
    category: 'config',
  },
  {
    key: 'NJS-520',
    dependency: 'oracle',
    hint: 'tnsnames.ora missing',
    detail: 'tnsnames.ora was not found in the config directory.',
    howToFix: 'Use host:port/service in {env}.',
    category: 'config',
  },
  {
    key: 'NJS-521',
    dependency: 'oracle',
    hint: 'DB connection reset',
    detail:
      'Got end-of-file from {host}:{port}: the server process died or a firewall cut an idle connection.',
    howToFix: 'Retry.',
    retryable: true,
  },
  {
    key: 'NJS-530',
    dependency: 'oracle',
    hint: 'DB host unresolvable',
    detail: 'The host in the connect string cannot be resolved.',
    howToFix: 'Check {env} and DNS.',
    category: 'config',
  },
  {
    key: 'NJS-536',
    dependency: 'oracle',
    hint: 'Too many connect redirects',
    detail:
      'The listener redirected more times than allowed. A misconfigured RAC/SCAN listener.',
    howToFix: 'Ask the DBA to check the RAC/SCAN listener configuration.',
    category: 'config',
  },
  // --- ODPI-C (Thick mode) ---
  {
    key: 'DPI-1010',
    dependency: 'oracle',
    hint: 'DB not connected',
    detail: 'The connection is closed (released, or dropped by the server).',
    howToFix: 'Retry with a fresh connection.',
    retryable: true,
  },
  {
    key: 'DPI-1047',
    dependency: 'oracle',
    hint: 'Oracle Client not found',
    detail:
      'Thick mode cannot load the Oracle Instant Client (LD_LIBRARY_PATH / libDir).',
    howToFix: 'Install it in the image or use Thin mode.',
    category: 'config',
  },
  {
    key: 'DPI-1067',
    dependency: 'oracle',
    hint: 'DB call timed out',
    detail: 'The statement exceeded callTimeout. The query is slow or blocked.',
    howToFix: 'Check locks and the SQL.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'DPI-1072',
    dependency: 'oracle',
    hint: 'Oracle Client too old',
    detail: 'The Instant Client version is unsupported.',
    howToFix: 'Install 19c or later.',
    category: 'config',
  },
  {
    key: 'DPI-1080',
    dependency: 'oracle',
    hint: 'DB connection closed',
    detail:
      'The connection was closed by the server (session killed, timeout). The pool discards it.',
    howToFix: 'Retry.',
    retryable: true,
  },
]
