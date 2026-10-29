import type { ErrorPattern } from './types'

// Sources:
// - https://www.postgresql.org/docs/current/errcodes-appendix.html (SQLSTATE codes and condition names)
// - https://www.postgresql.org/docs/current/datatype-datetime.html (date/time input and ranges)
// - https://github.com/postgres/postgres/blob/master/src/backend/tcop/postgres.c (timeouts, cancel, bind errors)
// - https://github.com/postgres/postgres/blob/master/src/backend/access/transam/xact.c (transaction block errors)
// - https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/client.js (pg client messages)
// - https://github.com/brianc/node-postgres/blob/master/packages/pg-pool/index.js (pg-pool messages)
/** pg puts the names in error.detail/table/column/constraint, never the values. */
function pgTarget(wrapper: any): string | undefined {
  // TypeORM's QueryFailedError copies the driver fields; older wrappers keep
  // them on driverError only.
  const error =
    wrapper?.constraint || wrapper?.table || wrapper?.column
      ? wrapper
      : (wrapper?.driverError ?? wrapper)
  const table = error?.table
  const column = error?.column
  const constraint = error?.constraint
  if (constraint) return table ? `${table}.${constraint}` : constraint
  if (column) return table ? `${table}.${column}` : column
  return table ?? undefined
}

function explainPg(
  text: (target: string | undefined) => { detail?: string; howToFix?: string },
) {
  return ({ error }: { error: any }) => {
    const target = pgTarget(error)
    return { target, ...text(target) }
  }
}

// PostgreSQL SQLSTATE codes (errcodes-appendix) as node-postgres reports
// them in error.code, plus pg client messages.
export const postgresPatterns: ErrorPattern[] = [
  // --- 23: integrity constraint ---
  {
    key: '23505',
    hint: 'Duplicate record',
    detail:
      'unique_violation: a unique index rejected the row. Often a double submit or concurrent insert.',
    howToFix: 'Check the constraint name.',
    level: 'warn',
    category: 'data',
    explain: explainPg((t) => ({
      detail: `Unique constraint ${t ?? ''} already has this value.`,
      howToFix: 'Check for a double submit, or upsert instead.',
    })),
  },
  {
    key: '23503',
    hint: 'Foreign key violated',
    detail:
      'foreign_key_violation: the row references a missing parent, or a parent still has children on delete.',
    howToFix: 'Check the constraint name.',
    level: 'warn',
    category: 'data',
    explain: explainPg((t) => ({
      detail: `Foreign key ${t ?? ''}: the referenced row does not exist, or dependent rows still reference this one.`,
    })),
  },
  {
    key: '23502',
    hint: 'Required column null',
    detail:
      'not_null_violation: a NOT NULL column got no value (see target). The DTO or mapping left it undefined.',
    howToFix: 'Validate the field in the DTO, or give the column a default.',
    level: 'warn',
    explain: explainPg((t) => ({
      detail: `${t ?? 'A NOT NULL column'} was null.`,
      howToFix: 'Validate the field, or set a default.',
    })),
  },
  {
    key: '23514',
    hint: 'Check constraint violated',
    detail:
      'check_violation: a CHECK constraint rejected the value (see target). The input is outside the allowed range/set.',
    howToFix: 'Validate the field against the constraint before saving.',
    level: 'warn',
    explain: explainPg((t) => ({
      detail: `CHECK constraint ${t ?? ''} rejected the value.`,
      howToFix: 'Validate the field before saving.',
    })),
  },
  {
    key: '23P01',
    hint: 'Exclusion constraint violated',
    detail:
      'exclusion_violation: an EXCLUDE constraint (overlapping ranges) rejected the row.',
    howToFix:
      'Check for an overlapping row before inserting, or adjust the range.',
    level: 'warn',
  },
  {
    key: '23001',
    hint: 'Restrict violation',
    detail:
      'restrict_violation: ON DELETE RESTRICT blocked the delete because rows reference this one.',
    howToFix: 'Delete or detach the referencing rows first.',
    level: 'warn',
  },
  // --- 22: data ---
  {
    key: '22001',
    hint: 'Value too long',
    detail:
      'string_data_right_truncation: a value exceeds the varchar(n) size.',
    howToFix: 'Validate the length, or widen the column.',
    level: 'warn',
  },
  {
    key: '22003',
    hint: 'Number out of range',
    detail:
      'numeric_value_out_of_range: the value does not fit the column type (integer overflow, numeric precision).',
    howToFix: 'Validate the range, or widen the column type.',
    level: 'warn',
  },
  {
    key: '22007',
    hint: 'Invalid date format',
    detail: 'invalid_datetime_format: a date/time string could not be parsed.',
    howToFix:
      'Validate the date string, and send ISO 8601 (YYYY-MM-DD) values.',
    level: 'warn',
  },
  {
    key: '22008',
    hint: 'Date out of range',
    detail:
      'datetime_field_overflow: a date/time field is out of range (month 13, day 32), or DateStyle read the day and month in the wrong order.',
    howToFix:
      'Validate the date parts, and send ISO 8601 (YYYY-MM-DD) dates so DateStyle cannot swap day and month.',
    level: 'warn',
  },
  {
    key: '22012',
    hint: 'Division by zero',
    detail: 'division_by_zero in SQL.',
    howToFix: 'Guard the divisor with NULLIF.',
    category: 'bug',
  },
  {
    key: '22P02',
    hint: 'Invalid text for type',
    detail:
      'invalid_text_representation: a string could not be cast (a non-numeric id, "undefined" as integer, bad uuid/json).',
    howToFix: 'Validate the input.',
    level: 'warn',
  },
  {
    key: '22023',
    hint: 'Invalid parameter value',
    detail:
      'invalid_parameter_value: a function argument is invalid (see message).',
    howToFix: 'Check the function arguments named in the message.',
    level: 'warn',
  },
  {
    key: '22021',
    hint: 'Invalid byte sequence',
    detail:
      'character_not_in_repertoire: the text contains bytes invalid for the DB encoding (UTF-8).',
    howToFix:
      'Strip NUL characters (\\u0000) and invalid bytes from the input before saving.',
    level: 'warn',
  },
  {
    key: '22P05',
    hint: 'Untranslatable character',
    detail:
      'untranslatable_character: a character cannot be converted to the client/server encoding, or a JSON \\u0000 escape cannot become text.',
    howToFix:
      'Strip \\u0000 from JSON input, or match the client and server encodings.',
    level: 'warn',
  },
  {
    key: '2201W',
    hint: 'Invalid LIMIT value',
    detail: 'invalid_row_count_in_limit_clause: LIMIT is negative.',
    howToFix: 'Check pagination input.',
    level: 'warn',
  },
  {
    key: '2201X',
    hint: 'Invalid OFFSET value',
    detail: 'invalid_row_count_in_result_offset_clause: OFFSET is negative.',
    howToFix: 'Check pagination input.',
    level: 'warn',
  },
  // --- 42: syntax / access ---
  {
    key: '42601',
    hint: 'SQL syntax error',
    detail:
      'syntax_error: the SQL text is malformed, usually a raw query with a wrong placeholder or missing comma.',
    howToFix: 'Check the placeholders and commas in the raw query.',
    category: 'bug',
  },
  {
    key: '42P01',
    hint: 'Table does not exist',
    detail:
      'undefined_table: the table or view is missing (see target): a migration not run, or the wrong schema/search_path.',
    howToFix:
      'Run the pending migrations, or check the schema and search_path.',
    category: 'config',
    target: /relation "([^"]+)" does not exist/,
  },
  {
    key: '42703',
    hint: 'Column does not exist',
    detail:
      'undefined_column: the column is missing (see target): a migration not run, or a property name used as a column.',
    howToFix:
      'Run the pending migrations, or map the property to its column name.',
    category: 'config',
    target: /column "?([^"\s]+)"? does not exist/,
  },
  {
    key: '42883',
    hint: 'Function does not exist',
    detail:
      'undefined_function: no function matches the name and argument types (see target).',
    howToFix: 'Check casts and extensions.',
    category: 'bug',
    target: /function ([^\s]+) does not exist/,
  },
  {
    key: '42704',
    hint: 'Object does not exist',
    detail:
      'undefined_object: a type, extension or object is missing (see target), e.g. an extension type (citext, hstore) with the extension not installed.',
    howToFix:
      'Install the extension, or run the migration that creates the object.',
    category: 'config',
    target: /(?:type|extension|object) "([^"]+)" does not exist/,
  },
  {
    key: '42P07',
    hint: 'Table already exists',
    detail:
      'duplicate_table: CREATE TABLE for an existing table. A migration ran twice or synchronize is on.',
    howToFix: 'Check the migrations table, and turn synchronize off.',
    category: 'config',
  },
  {
    key: '42710',
    hint: 'Object already exists',
    detail:
      'duplicate_object: a type, constraint or role already exists. A migration ran twice.',
    howToFix:
      'Check the migrations table, or guard the migration with IF NOT EXISTS.',
    category: 'config',
  },
  {
    key: '42701',
    hint: 'Column already exists',
    detail:
      'duplicate_column: ADD COLUMN for an existing column. A migration ran twice.',
    howToFix: 'Check the migrations table, or use ADD COLUMN IF NOT EXISTS.',
    category: 'config',
  },
  {
    key: '42501',
    hint: 'DB permission denied',
    detail:
      'insufficient_privilege: the DB user lacks the privilege for this table/schema.',
    howToFix: 'Grant the privilege to the DB user.',
    category: 'config',
  },
  {
    key: '42804',
    hint: 'Column type mismatch',
    detail:
      'datatype_mismatch: an expression has the wrong type for the column (e.g. text into integer).',
    howToFix: 'Cast or fix the mapping.',
    category: 'bug',
  },
  {
    key: '42846',
    hint: 'Cannot cast type',
    detail: 'cannot_coerce: no cast exists between the types.',
    howToFix:
      'Cast through a compatible type (often text), or convert the value in code before the query.',
    category: 'bug',
  },
  {
    key: '42702',
    hint: 'Ambiguous column',
    detail: 'ambiguous_column: a column name exists in several joined tables.',
    howToFix: 'Qualify the column with its table alias.',
    category: 'bug',
  },
  {
    key: '42P18',
    hint: 'Parameter type unknown',
    detail:
      'indeterminate_datatype: PostgreSQL cannot infer the type of a $n parameter from where the SQL uses it (e.g. $1 IS NULL).',
    howToFix: 'Cast the parameter in the SQL.',
    category: 'bug',
  },
  {
    key: '42803',
    hint: 'GROUP BY error',
    detail:
      'grouping_error: a selected column is neither aggregated nor in GROUP BY.',
    howToFix: 'Aggregate the column, or add it to GROUP BY.',
    category: 'bug',
  },
  {
    key: '42P10',
    hint: 'ON CONFLICT target invalid',
    detail:
      'invalid_column_reference: ON CONFLICT names columns without a matching unique index, or ORDER BY uses a column missing from SELECT DISTINCT.',
    howToFix:
      'Match ON CONFLICT to an existing unique index, or add the ORDER BY column to the select list.',
    category: 'bug',
  },
  {
    key: '42622',
    hint: 'Identifier too long',
    detail:
      'name_too_long: a generated name exceeds 63 bytes (long alias or constraint).',
    howToFix: 'Shorten the alias or constraint name.',
    category: 'bug',
  },
  // --- 40 / 55 / 57: transactions, locks, cancel ---
  {
    key: '40001',
    hint: 'Serialization conflict',
    detail:
      'serialization_failure: concurrent transactions conflicted under SERIALIZABLE/REPEATABLE READ.',
    howToFix: 'Retry the transaction.',
    retryable: true,
    category: 'data',
  },
  {
    key: '40P01',
    hint: 'Deadlock detected',
    detail:
      'deadlock_detected: two transactions locked rows in opposite order; PostgreSQL killed this one.',
    howToFix: 'Retry; lock rows in a consistent order.',
    retryable: true,
    category: 'bug',
  },
  {
    key: '55P03',
    hint: 'Row lock not available',
    detail:
      'lock_not_available: NOWAIT found the row or table locked, or lock_timeout expired. Another transaction holds the lock.',
    howToFix: 'Retry the operation.',
    retryable: true,
  },
  {
    key: '55006',
    hint: 'Object in use',
    detail:
      'object_in_use: the object is busy, e.g. DROP DATABASE while other sessions are connected, or ALTER TABLE on a table this session still uses.',
    howToFix:
      'Retry when the sessions using the object are done, or run the DDL in a quiet window.',
    retryable: true,
  },
  {
    key: '25P02',
    hint: 'Transaction already failed',
    detail:
      'in_failed_sql_transaction: a query ran after an earlier error in the same transaction.',
    howToFix: 'Roll back and retry; find the first error.',
    category: 'bug',
  },
  {
    key: '25P03',
    hint: 'Idle transaction killed',
    detail:
      'idle_in_transaction_session_timeout: the transaction sat idle too long (a missing await or a slow external call inside it).',
    howToFix:
      'Await every query in the transaction, and move slow external calls outside it.',
    category: 'bug',
  },
  {
    key: '25P04',
    hint: 'Transaction timed out',
    detail: 'transaction_timeout: the transaction exceeded the server limit.',
    howToFix: 'Shorten the work inside it.',
    category: 'bug',
  },
  {
    key: '25006',
    hint: 'Write on read-only txn',
    detail:
      'read_only_sql_transaction: a write ran on a read-only connection (replica) or transaction.',
    howToFix: 'Send writes to the primary, or open a read-write transaction.',
    category: 'config',
  },
  {
    key: '25001',
    hint: 'Already in transaction',
    detail:
      'active_sql_transaction: a command that cannot run in a transaction block (CREATE INDEX CONCURRENTLY, VACUUM, CREATE DATABASE) ran inside one.',
    howToFix:
      'Run that command outside a transaction, e.g. in a migration with its transaction turned off.',
    category: 'bug',
  },
  {
    key: '25P01',
    hint: 'No active transaction',
    detail:
      'no_active_sql_transaction: a command that needs a transaction block (SAVEPOINT, LOCK TABLE, DECLARE CURSOR) ran outside one.',
    howToFix: 'Run the command inside a transaction.',
    category: 'bug',
  },
  {
    key: '57014',
    hint: 'Query cancelled',
    detail:
      'query_canceled: statement_timeout hit, or the client cancelled. The query is too slow.',
    howToFix: 'Check the plan and indexes.',
    retryable: true,
  },
  {
    key: '57P01',
    hint: 'DB shut down by admin',
    detail:
      'admin_shutdown: the server was stopped or the backend terminated (pg_terminate_backend, restart).',
    howToFix: 'Reconnect.',
    retryable: true,
  },
  {
    key: '57P02',
    hint: 'DB crashed',
    detail: 'crash_shutdown: the server is restarting after a crash.',
    howToFix: 'Reconnect once it is back.',
    retryable: true,
  },
  {
    key: '57P03',
    hint: 'DB starting up',
    detail: 'cannot_connect_now: the server is starting or in recovery.',
    howToFix: 'Retry in a moment.',
    retryable: true,
  },
  {
    key: '57P05',
    hint: 'Idle session killed',
    detail:
      'idle_session_timeout: the server closed an idle connection. The pool reconnects.',
    howToFix: 'Lower the pool idle time.',
    retryable: true,
  },
  // --- 53 / 54: resources ---
  {
    key: '53300',
    hint: 'Too many DB connections',
    detail:
      'too_many_connections: max_connections, or the role/database connection limit, is reached. Too many pods × pool size.',
    howToFix: 'Shrink the pool or use pgbouncer.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: '53200',
    hint: 'DB out of memory',
    detail:
      'out_of_memory: the server could not allocate memory (a huge sort/hash), or ran out of shared memory for locks.',
    howToFix:
      'Simplify the query; for out of shared memory, lock fewer tables per transaction or raise max_locks_per_transaction.',
    category: 'dependency',
  },
  {
    key: '53100',
    hint: 'DB disk full',
    detail: 'disk_full: the database volume is full.',
    howToFix: 'Alert the DB operators.',
    category: 'dependency',
  },
  {
    key: '53400',
    hint: 'DB limit exceeded',
    detail:
      'configuration_limit_exceeded: a configured limit (e.g. temp_file_limit for temporary files) was hit.',
    howToFix: 'Check the server limit named in the message, or split the work.',
    category: 'dependency',
  },
  {
    key: '54000',
    hint: 'Query too complex',
    detail:
      'program_limit_exceeded: the statement exceeds a built-in limit, e.g. an index row larger than a btree index allows.',
    howToFix:
      'Shorten the indexed values, or index an MD5 hash of the long value instead.',
    category: 'bug',
  },
  {
    key: '54001',
    hint: 'Statement too complex',
    detail:
      'statement_too_complex: stack depth limit exceeded by a deeply nested query or expression, or by deep function/trigger recursion.',
    howToFix: 'Flatten the query, or split it into steps.',
    category: 'bug',
  },
  // --- 08 / 28 / 3D / 3F: connection, auth ---
  {
    key: '08006',
    hint: 'DB connection failed',
    detail: 'connection_failure: the connection to PostgreSQL broke.',
    howToFix: 'Reconnect; check the server and network.',
    retryable: true,
  },
  {
    key: '08001',
    hint: 'Cannot connect to DB',
    detail:
      'sqlclient_unable_to_establish_sqlconnection: the client could not open a connection.',
    howToFix: 'Check host/port/TLS.',
    retryable: true,
  },
  {
    key: '08003',
    hint: 'DB connection closed',
    detail: 'connection_does_not_exist: a query ran on a closed connection.',
    howToFix:
      'Take a fresh connection from the pool instead of reusing a closed one.',
    category: 'bug',
  },
  {
    key: '08004',
    hint: 'DB rejected connection',
    detail:
      'sqlserver_rejected_establishment_of_sqlconnection: the server refused to open the session. pg_hba.conf rejections come as 28000, not this code.',
    howToFix:
      'Read the reason in the message, and check the server or proxy connection settings.',
    category: 'config',
  },
  {
    key: '08P01',
    hint: 'DB protocol violation',
    detail:
      'protocol_violation: the client sent an invalid message, e.g. more bind parameters than placeholders.',
    howToFix: 'Match the bind parameters to the placeholders in the query.',
    category: 'bug',
  },
  {
    key: '28P01',
    hint: 'DB password rejected',
    detail: 'invalid_password: wrong password for the DB user.',
    howToFix: 'Check the DB env vars.',
    category: 'config',
  },
  {
    key: '28000',
    hint: 'DB user not allowed',
    detail:
      'invalid_authorization_specification: the user/host is not allowed by pg_hba.conf, or the role does not exist.',
    howToFix: 'Check the DB user in env, the role, and pg_hba.conf.',
    category: 'config',
  },
  {
    key: '3D000',
    hint: 'Database does not exist',
    detail:
      'invalid_catalog_name: the database name in env does not exist on this server.',
    howToFix: 'Check the database name in env, or create the database.',
    category: 'config',
  },
  {
    key: '3F000',
    hint: 'Schema does not exist',
    detail: 'invalid_schema_name: the schema is missing.',
    howToFix: 'Check search_path and migrations.',
    category: 'config',
  },
  {
    key: '0A000',
    hint: 'Feature not supported',
    detail:
      'feature_not_supported: PostgreSQL does not support this operation (see message).',
    howToFix: 'Rewrite the query without the unsupported operation.',
    category: 'bug',
  },
  {
    key: '2BP01',
    hint: 'Dependent objects exist',
    detail:
      'dependent_objects_still_exist: DROP failed because views/constraints depend on the object.',
    howToFix: 'Drop the dependents first, or use CASCADE knowingly.',
    category: 'config',
  },
  {
    key: 'XX000',
    hint: 'PostgreSQL internal error',
    detail:
      'internal_error: the server hit an internal error; it may indicate corruption.',
    howToFix: 'Check the PostgreSQL logs.',
    category: 'dependency',
  },
  {
    key: 'XX001',
    hint: 'DB data corrupted',
    detail: 'data_corrupted: a page is corrupted.',
    howToFix: 'Alert the DB operators immediately.',
    category: 'dependency',
  },
  {
    key: 'XX002',
    hint: 'DB index corrupted',
    detail: 'index_corrupted: an index is corrupted.',
    howToFix: 'Reindex the named index.',
    category: 'dependency',
  },
  // --- node-postgres client messages ---
  {
    key: 'PG_CONNECTION_TERMINATED',
    messageMatch: /^Connection terminated( unexpectedly)?$/,
    hint: 'DB connection terminated',
    detail:
      'The PostgreSQL connection closed (server restart, pgbouncer idle timeout, network). The pool reconnects.',
    howToFix: 'Retry the query.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'PG_CONNECT_TIMEOUT',
    messageMatch:
      /^(timeout expired|Connection terminated due to connection timeout|timeout exceeded when trying to connect)/,
    hint: 'DB connect timed out',
    detail:
      'No PostgreSQL connection within connectionTimeoutMillis: the pool is exhausted (slow queries hold connections) or the server is unreachable.',
    howToFix:
      'Find the slow queries holding connections, or check that the server is reachable.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'PG_CLIENT_NOT_QUERYABLE',
    messageMatch:
      /^Client (has encountered a connection error and is not queryable|was closed and is not queryable)/,
    hint: 'DB client unusable',
    detail: 'A query ran on a pg Client after it errored or closed.',
    howToFix: 'Release broken clients and take a fresh one from the pool.',
    category: 'bug',
  },
  {
    key: 'PG_CLIENT_REUSED',
    messageMatch: /^Client has already been connected/,
    hint: 'pg Client connected twice',
    detail: 'client.connect() was called twice on the same Client.',
    howToFix: 'Use the pool.',
    category: 'bug',
  },
  {
    key: 'PG_QUERY_READ_TIMEOUT',
    messageMatch: /^Query read timeout/,
    hint: 'DB query read timed out',
    detail:
      'pg query_timeout elapsed before the query returned. The query is slow, and the server may still be running it.',
    howToFix:
      'Check the query plan, and set statement_timeout so the server stops slow queries too.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'PG_RELEASE_TWICE',
    messageMatch:
      /^Release called on client which has already been released to the pool/,
    hint: 'pg client released twice',
    detail: 'client.release() ran twice.',
    howToFix: 'Release exactly once in finally.',
    category: 'bug',
  },
]
