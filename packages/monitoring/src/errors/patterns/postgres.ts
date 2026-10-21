import type { ErrorPattern } from './types'

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

function explainPg(fix: (target: string | undefined) => string) {
  return ({ error }: { error: any }) => {
    const target = pgTarget(error)
    return { target, fix: fix(target) }
  }
}

// PostgreSQL SQLSTATE codes (errcodes-appendix) as node-postgres reports
// them in error.code, plus pg client messages.
export const postgresPatterns: ErrorPattern[] = [
  // --- 23: integrity constraint ---
  {
    key: '23505',
    hint: 'Duplicate record',
    hintDetail:
      'unique_violation: a unique index rejected the row. Often a double submit or concurrent insert; check the constraint name.',
    level: 'warn',
    category: 'data',
    explain: explainPg(
      (t) =>
        `Unique constraint ${t ?? ''} already has this value. Check for a double submit, or upsert instead.`,
    ),
  },
  {
    key: '23503',
    hint: 'Foreign key violated',
    hintDetail:
      'foreign_key_violation: the row references a missing parent, or a parent still has children on delete. Check the constraint name.',
    level: 'warn',
    category: 'data',
    explain: explainPg(
      (t) =>
        `Foreign key ${t ?? ''}: the referenced row does not exist, or dependent rows still reference this one.`,
    ),
  },
  {
    key: '23502',
    hint: 'Required column null',
    hintDetail:
      'not_null_violation: a NOT NULL column got no value (see target). The DTO or mapping left it undefined.',
    level: 'warn',
    explain: explainPg(
      (t) =>
        `${t ?? 'A NOT NULL column'} was null. Validate the field, or set a default.`,
    ),
  },
  {
    key: '23514',
    hint: 'Check constraint violated',
    hintDetail:
      'check_violation: a CHECK constraint rejected the value (see target). The input is outside the allowed range/set.',
    level: 'warn',
    explain: explainPg(
      (t) =>
        `CHECK constraint ${t ?? ''} rejected the value. Validate the field before saving.`,
    ),
  },
  {
    key: '23P01',
    hint: 'Exclusion constraint violated',
    hintDetail:
      'exclusion_violation: an EXCLUDE constraint (overlapping ranges) rejected the row.',
    level: 'warn',
  },
  {
    key: '23001',
    hint: 'Restrict violation',
    hintDetail:
      'restrict_violation: ON DELETE RESTRICT blocked the delete because rows reference this one.',
    level: 'warn',
  },
  // --- 22: data ---
  {
    key: '22001',
    hint: 'Value too long',
    hintDetail:
      'string_data_right_truncation: a value exceeds the varchar(n) size. Validate the length, or widen the column.',
    level: 'warn',
  },
  {
    key: '22003',
    hint: 'Number out of range',
    hintDetail:
      'numeric_value_out_of_range: the value does not fit the column type (integer overflow, numeric precision).',
    level: 'warn',
  },
  {
    key: '22007',
    hint: 'Invalid date format',
    hintDetail:
      'invalid_datetime_format: a date/time string could not be parsed. Check the format and Buddhist years.',
    level: 'warn',
  },
  {
    key: '22008',
    hint: 'Date out of range',
    hintDetail:
      'datetime_field_overflow: a date field is out of range (month 13, day 32, a 25xx Buddhist year in a date column).',
    level: 'warn',
  },
  {
    key: '22012',
    hint: 'Division by zero',
    hintDetail: 'division_by_zero in SQL. Guard the divisor with NULLIF.',
    category: 'bug',
  },
  {
    key: '22P02',
    hint: 'Invalid text for type',
    hintDetail:
      'invalid_text_representation: a string could not be cast (a non-numeric id, "undefined" as integer, bad uuid/json). Validate the input.',
    level: 'warn',
  },
  {
    key: '22023',
    hint: 'Invalid parameter value',
    hintDetail:
      'invalid_parameter_value: a function argument is invalid (see message).',
    level: 'warn',
  },
  {
    key: '22021',
    hint: 'Invalid byte sequence',
    hintDetail:
      'character_not_in_repertoire: the text contains bytes invalid for the DB encoding (UTF-8). Sanitize the input.',
    level: 'warn',
  },
  {
    key: '22P05',
    hint: 'Untranslatable character',
    hintDetail:
      'untranslatable_character: a character cannot be converted to the client/server encoding.',
    level: 'warn',
  },
  {
    key: '2201W',
    hint: 'Invalid LIMIT value',
    hintDetail:
      'invalid_row_count_in_limit_clause: LIMIT is negative. Check pagination input.',
    level: 'warn',
  },
  {
    key: '2201X',
    hint: 'Invalid OFFSET value',
    hintDetail:
      'invalid_row_count_in_result_offset_clause: OFFSET is negative. Check pagination input.',
    level: 'warn',
  },
  // --- 42: syntax / access ---
  {
    key: '42601',
    hint: 'SQL syntax error',
    hintDetail:
      'syntax_error: the SQL text is malformed, usually a raw query with a wrong placeholder or missing comma.',
    category: 'bug',
  },
  {
    key: '42P01',
    hint: 'Table does not exist',
    hintDetail:
      'undefined_table: the table or view is missing (see target): a migration not run, or the wrong schema/search_path.',
    category: 'config',
    target: /relation "([^"]+)" does not exist/,
  },
  {
    key: '42703',
    hint: 'Column does not exist',
    hintDetail:
      'undefined_column: the column is missing (see target): a migration not run, or a property name used as a column.',
    category: 'config',
    target: /column "?([^"\s]+)"? does not exist/,
  },
  {
    key: '42883',
    hint: 'Function does not exist',
    hintDetail:
      'undefined_function: no function matches the name and argument types (see target). Check casts and extensions.',
    category: 'bug',
    target: /function ([^\s]+) does not exist/,
  },
  {
    key: '42704',
    hint: 'Object does not exist',
    hintDetail:
      'undefined_object: a type, extension or object is missing (see target). An extension (uuid-ossp, pgcrypto) not installed.',
    category: 'config',
    target: /(?:type|extension|object) "([^"]+)" does not exist/,
  },
  {
    key: '42P07',
    hint: 'Table already exists',
    hintDetail:
      'duplicate_table: CREATE TABLE for an existing table. A migration ran twice or synchronize is on.',
    category: 'config',
  },
  {
    key: '42710',
    hint: 'Object already exists',
    hintDetail:
      'duplicate_object: a type, constraint or role already exists. A migration ran twice.',
    category: 'config',
  },
  {
    key: '42701',
    hint: 'Column already exists',
    hintDetail:
      'duplicate_column: ADD COLUMN for an existing column. A migration ran twice.',
    category: 'config',
  },
  {
    key: '42501',
    hint: 'DB permission denied',
    hintDetail:
      'insufficient_privilege: the DB user lacks the privilege for this table/schema. Grant it.',
    category: 'config',
  },
  {
    key: '42804',
    hint: 'Column type mismatch',
    hintDetail:
      'datatype_mismatch: an expression has the wrong type for the column (e.g. text into integer). Cast or fix the mapping.',
    category: 'bug',
  },
  {
    key: '42846',
    hint: 'Cannot cast type',
    hintDetail:
      'cannot_coerce: no cast exists between the types. Fix the query.',
    category: 'bug',
  },
  {
    key: '42702',
    hint: 'Ambiguous column',
    hintDetail:
      'ambiguous_column: a column name exists in several joined tables. Qualify it with the alias.',
    category: 'bug',
  },
  {
    key: '42P18',
    hint: 'Parameter type unknown',
    hintDetail:
      'indeterminate_datatype: PostgreSQL cannot infer the type of a $n parameter (null/undefined passed). Cast it.',
    category: 'bug',
  },
  {
    key: '42803',
    hint: 'GROUP BY error',
    hintDetail:
      'grouping_error: a selected column is neither aggregated nor in GROUP BY.',
    category: 'bug',
  },
  {
    key: '42P10',
    hint: 'ON CONFLICT target invalid',
    hintDetail:
      'invalid_column_reference: ON CONFLICT names columns without a matching unique index.',
    category: 'bug',
  },
  {
    key: '42622',
    hint: 'Identifier too long',
    hintDetail:
      'name_too_long: a generated name exceeds 63 characters (long alias or constraint). Shorten it.',
    category: 'bug',
  },
  // --- 40 / 55 / 57: transactions, locks, cancel ---
  {
    key: '40001',
    hint: 'Serialization conflict',
    hintDetail:
      'serialization_failure: concurrent transactions conflicted under SERIALIZABLE/REPEATABLE READ. Retry the transaction.',
    retryable: true,
    category: 'data',
  },
  {
    key: '40P01',
    hint: 'Deadlock detected',
    hintDetail:
      'deadlock_detected: two transactions locked rows in opposite order; PostgreSQL killed this one. Retry; lock rows in a consistent order.',
    retryable: true,
    category: 'bug',
  },
  {
    key: '55P03',
    hint: 'Row lock not available',
    hintDetail:
      'lock_not_available: SELECT … FOR UPDATE NOWAIT found the row locked. Another transaction holds it; retry.',
    retryable: true,
  },
  {
    key: '55006',
    hint: 'Object in use',
    hintDetail:
      'object_in_use: a DDL waited on a table in use (or a DB with active sessions on drop).',
    retryable: true,
  },
  {
    key: '25P02',
    hint: 'Transaction already failed',
    hintDetail:
      'in_failed_sql_transaction: a query ran after an earlier error in the same transaction. Roll back and retry; find the first error.',
    category: 'bug',
  },
  {
    key: '25P03',
    hint: 'Idle transaction killed',
    hintDetail:
      'idle_in_transaction_session_timeout: the transaction sat idle too long (a missing await or a slow external call inside it).',
    category: 'bug',
  },
  {
    key: '25P04',
    hint: 'Transaction timed out',
    hintDetail:
      'transaction_timeout: the transaction exceeded the server limit. Shorten the work inside it.',
    category: 'bug',
  },
  {
    key: '25006',
    hint: 'Write on read-only txn',
    hintDetail:
      'read_only_sql_transaction: a write ran on a read-only connection (replica) or transaction.',
    category: 'config',
  },
  {
    key: '25001',
    hint: 'Already in transaction',
    hintDetail: 'active_sql_transaction: BEGIN inside an open transaction.',
    category: 'bug',
  },
  {
    key: '25P01',
    hint: 'No active transaction',
    hintDetail: 'no_active_sql_transaction: COMMIT/ROLLBACK without BEGIN.',
    category: 'bug',
  },
  {
    key: '57014',
    hint: 'Query cancelled',
    hintDetail:
      'query_canceled: statement_timeout hit, or the client cancelled. The query is too slow; check the plan and indexes.',
    retryable: true,
  },
  {
    key: '57P01',
    hint: 'DB shut down by admin',
    hintDetail:
      'admin_shutdown: the server was stopped or the backend terminated (pg_terminate_backend, restart). Reconnect.',
    retryable: true,
  },
  {
    key: '57P02',
    hint: 'DB crashed',
    hintDetail:
      'crash_shutdown: the server is restarting after a crash. Reconnect once it is back.',
    retryable: true,
  },
  {
    key: '57P03',
    hint: 'DB starting up',
    hintDetail:
      'cannot_connect_now: the server is starting or in recovery. Retry in a moment.',
    retryable: true,
  },
  {
    key: '57P05',
    hint: 'Idle session killed',
    hintDetail:
      'idle_session_timeout: the server closed an idle connection. The pool reconnects; lower pool idle time.',
    retryable: true,
  },
  // --- 53 / 54: resources ---
  {
    key: '53300',
    hint: 'Too many DB connections',
    hintDetail:
      'too_many_connections: the server max_connections is reached. Too many pods × pool size; shrink the pool or use pgbouncer.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: '53200',
    hint: 'DB out of memory',
    hintDetail:
      'out_of_memory: the server could not allocate memory for the query (huge sort/hash). Simplify the query.',
    category: 'dependency',
  },
  {
    key: '53100',
    hint: 'DB disk full',
    hintDetail:
      'disk_full: the database volume is full. Alert the DB operators.',
    category: 'dependency',
  },
  {
    key: '53400',
    hint: 'DB limit exceeded',
    hintDetail:
      'configuration_limit_exceeded: a configured limit (temp files, locks) was hit.',
    category: 'dependency',
  },
  {
    key: '54000',
    hint: 'Query too complex',
    hintDetail:
      'program_limit_exceeded: the statement exceeds a limit (index row size, expression depth).',
    category: 'bug',
  },
  {
    key: '54001',
    hint: 'Statement too complex',
    hintDetail: 'statement_too_complex: the query nests too deeply.',
    category: 'bug',
  },
  // --- 08 / 28 / 3D / 3F: connection, auth ---
  {
    key: '08006',
    hint: 'DB connection failed',
    hintDetail:
      'connection_failure: the connection to PostgreSQL broke. Reconnect; check the server and network.',
    retryable: true,
  },
  {
    key: '08001',
    hint: 'Cannot connect to DB',
    hintDetail:
      'sqlclient_unable_to_establish_sqlconnection: the client could not open a connection. Check host/port/TLS.',
    retryable: true,
  },
  {
    key: '08003',
    hint: 'DB connection closed',
    hintDetail:
      'connection_does_not_exist: a query ran on a closed connection.',
    category: 'bug',
  },
  {
    key: '08004',
    hint: 'DB rejected connection',
    hintDetail:
      'sqlserver_rejected_establishment_of_sqlconnection: pg_hba.conf or the server refused the client.',
    category: 'config',
  },
  {
    key: '08P01',
    hint: 'DB protocol violation',
    hintDetail:
      'protocol_violation: the client sent an invalid message, e.g. more bind parameters than placeholders.',
    category: 'bug',
  },
  {
    key: '28P01',
    hint: 'DB password rejected',
    hintDetail:
      'invalid_password: wrong password for the DB user. Check the DB env vars.',
    category: 'config',
  },
  {
    key: '28000',
    hint: 'DB user not allowed',
    hintDetail:
      'invalid_authorization_specification: the user/host is not allowed by pg_hba.conf, or the role does not exist.',
    category: 'config',
  },
  {
    key: '3D000',
    hint: 'Database does not exist',
    hintDetail:
      'invalid_catalog_name: the database name in env does not exist on this server.',
    category: 'config',
  },
  {
    key: '3F000',
    hint: 'Schema does not exist',
    hintDetail:
      'invalid_schema_name: the schema is missing. Check search_path and migrations.',
    category: 'config',
  },
  {
    key: '0A000',
    hint: 'Feature not supported',
    hintDetail:
      'feature_not_supported: PostgreSQL does not support this operation (see message).',
    category: 'bug',
  },
  {
    key: '2BP01',
    hint: 'Dependent objects exist',
    hintDetail:
      'dependent_objects_still_exist: DROP failed because views/constraints depend on the object. Use CASCADE knowingly.',
    category: 'config',
  },
  {
    key: 'XX000',
    hint: 'PostgreSQL internal error',
    hintDetail:
      'internal_error: the server hit an internal error. Check the PostgreSQL logs; may indicate corruption.',
    category: 'dependency',
  },
  {
    key: 'XX001',
    hint: 'DB data corrupted',
    hintDetail:
      'data_corrupted: a page is corrupted. Alert the DB operators immediately.',
    category: 'dependency',
  },
  {
    key: 'XX002',
    hint: 'DB index corrupted',
    hintDetail: 'index_corrupted: reindex the named index.',
    category: 'dependency',
  },
  // --- node-postgres client messages ---
  {
    key: 'PG_CONNECTION_TERMINATED',
    messageMatch: /^Connection terminated( unexpectedly)?$/,
    hint: 'DB connection terminated',
    hintDetail:
      'The PostgreSQL connection closed (server restart, pgbouncer idle timeout, network). The pool reconnects; retry the query.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'PG_CONNECT_TIMEOUT',
    messageMatch:
      /^(timeout expired|Connection terminated due to connection timeout|timeout exceeded when trying to connect)/,
    hint: 'DB connect timed out',
    hintDetail:
      'No PostgreSQL connection within connectionTimeoutMillis: the pool is exhausted (slow queries hold connections) or the server is unreachable.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'PG_CLIENT_NOT_QUERYABLE',
    messageMatch:
      /^Client (has encountered a connection error and is not queryable|was closed and is not queryable)/,
    hint: 'DB client unusable',
    hintDetail:
      'A query ran on a pg Client after it errored or closed. Release broken clients and take a fresh one from the pool.',
    category: 'bug',
  },
  {
    key: 'PG_CLIENT_REUSED',
    messageMatch: /^Client has already been connected/,
    hint: 'pg Client connected twice',
    hintDetail:
      'client.connect() was called twice on the same Client. Use the pool.',
    category: 'bug',
  },
  {
    key: 'PG_QUERY_READ_TIMEOUT',
    messageMatch: /^Query read timeout/,
    hint: 'DB query read timed out',
    hintDetail:
      'query_timeout elapsed while reading results. The query is slow; check its plan.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'PG_RELEASE_TWICE',
    messageMatch:
      /^Release called on client which has already been released to the pool/,
    hint: 'pg client released twice',
    hintDetail: 'client.release() ran twice. Release exactly once in finally.',
    category: 'bug',
  },
]
