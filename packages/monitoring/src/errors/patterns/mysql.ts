import type { ErrorPattern } from './types'

// Sources:
// - https://dev.mysql.com/doc/mysql-errors/8.0/en/server-error-reference.html (ER_* server errors)
// - https://mariadb.com/docs/server/reference/error-codes/mariadb-error-codes-1000-to-1099 (ER_DISK_FULL and older codes)
// - https://dev.mysql.com/doc/refman/8.0/en/charset-unicode-utf8mb3.html (utf8mb3 has no 4-byte characters)
// - https://github.com/mysqljs/mysql/blob/master/lib/protocol/Protocol.js (PROTOCOL_* codes)
// - https://github.com/mysqljs/mysql/blob/master/lib/protocol/sequences/Handshake.js (HANDSHAKE_* codes)
// - https://github.com/mysqljs/mysql/blob/master/lib/Pool.js (POOL_* codes)
// - https://github.com/sidorares/node-mysql2/blob/master/lib/connection_config.js (mysql2 options)
// MySQL/MariaDB server errors (ER_* names from mysql/mysql2) and the
// client-side PROTOCOL_* / POOL_* codes.
export const mysqlPatterns: ErrorPattern[] = [
  {
    key: 'ER_DUP_ENTRY',
    hint: 'Duplicate record',
    detail:
      'A unique key rejected the row (see target). Often a double submit or concurrent insert.',
    howToFix:
      'Check the key name; guard against a double submit, or upsert instead.',
    level: 'warn',
    category: 'data',
    target: /for key '([^']+)'/,
  },
  {
    key: 'ER_NO_REFERENCED_ROW_2',
    hint: 'Related record not found',
    detail: 'A foreign key points to a row that does not exist (see target).',
    howToFix: 'Validate the referenced id.',
    level: 'warn',
    category: 'data',
    target: /CONSTRAINT `([^`]+)`/,
  },
  {
    key: 'ER_NO_REFERENCED_ROW',
    hint: 'Related record not found',
    detail: 'A foreign key points to a row that does not exist.',
    howToFix: 'Validate the referenced id.',
    level: 'warn',
    category: 'data',
  },
  {
    key: 'ER_ROW_IS_REFERENCED_2',
    hint: 'Record still in use',
    detail:
      'Other rows still reference this one (see target), so it cannot be deleted.',
    howToFix: 'Delete or detach them first.',
    level: 'warn',
    category: 'data',
    target: /CONSTRAINT `([^`]+)`/,
  },
  {
    key: 'ER_ROW_IS_REFERENCED',
    hint: 'Record still in use',
    detail: 'Other rows still reference this one, so it cannot be deleted.',
    howToFix: 'Delete or detach the referencing rows first.',
    level: 'warn',
    category: 'data',
  },
  {
    key: 'ER_BAD_NULL_ERROR',
    hint: 'Required column null',
    detail:
      'A NOT NULL column got null (see target). The DTO or mapping left it undefined.',
    howToFix: 'Validate the field in the DTO, or give the column a default.',
    level: 'warn',
    target: /Column '([^']+)'/,
  },
  {
    key: 'ER_NO_DEFAULT_FOR_FIELD',
    hint: 'Required field missing',
    detail:
      'A column without a default was omitted from the insert (see target).',
    howToFix: 'Set the field in the insert, or give the column a default.',
    level: 'warn',
    target: /Field '([^']+)'/,
  },
  {
    key: 'ER_DATA_TOO_LONG',
    hint: 'Value too long',
    detail: 'A value exceeds the column size (see target).',
    howToFix: 'Validate the length, or widen the column.',
    level: 'warn',
    target: /for column '([^']+)'/,
  },
  {
    key: 'ER_TRUNCATED_WRONG_VALUE',
    hint: 'Invalid value for type',
    detail:
      'A value could not be converted to the column type (bad date, text into number).',
    howToFix: 'Validate the input.',
    level: 'warn',
  },
  {
    key: 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD',
    hint: 'Invalid value for column',
    detail:
      'A value does not fit the column type (see target), e.g. a string into an integer column, or an emoji into a utf8mb3 column.',
    howToFix:
      'Validate the input type, and use utf8mb4 for text columns that store emoji.',
    level: 'warn',
    target: /for column '([^']+)'/,
  },
  {
    key: 'ER_WARN_DATA_OUT_OF_RANGE',
    hint: 'Number out of range',
    detail: 'A numeric value does not fit the column type (see target).',
    howToFix: 'Validate the range, or widen the column type.',
    level: 'warn',
    target: /for column '([^']+)'/,
  },
  {
    key: 'ER_DATA_OUT_OF_RANGE',
    hint: 'Number out of range',
    detail: 'An arithmetic result does not fit its type (BIGINT overflow).',
    howToFix: 'Check the arithmetic in the query, or cast to a wider type.',
    level: 'warn',
  },
  {
    key: 'ER_CHECK_CONSTRAINT_VIOLATED',
    hint: 'Check constraint violated',
    detail: 'A CHECK constraint rejected the row (see target).',
    howToFix: 'Validate the field against the constraint before saving.',
    level: 'warn',
    target: /constraint '([^']+)'/,
  },
  {
    key: 'ER_INVALID_JSON_TEXT',
    hint: 'Invalid JSON for column',
    detail: 'The value for a JSON column is not valid JSON.',
    howToFix:
      'Serialize the value with JSON.stringify, or validate it before saving.',
    level: 'warn',
  },
  {
    key: 'ER_BAD_FIELD_ERROR',
    hint: 'Column does not exist',
    detail:
      'The column is unknown (see target): a migration not run, or a property name used as a column.',
    howToFix:
      'Run the pending migrations, or map the property to its column name.',
    category: 'config',
    target: /Unknown column '([^']+)'/,
  },
  {
    key: 'ER_NO_SUCH_TABLE',
    hint: 'Table does not exist',
    detail:
      'The table is missing (see target): a migration not run, or the wrong database in env.',
    howToFix: 'Run the pending migrations, or check the database name in env.',
    category: 'config',
    target: /Table '([^']+)' doesn't exist/,
  },
  {
    key: 'ER_TABLE_EXISTS_ERROR',
    hint: 'Table already exists',
    detail:
      'CREATE TABLE for an existing table. A migration ran twice or synchronize is on.',
    howToFix: 'Check the migrations table, and turn synchronize off.',
    category: 'config',
  },
  {
    key: 'ER_DUP_FIELDNAME',
    hint: 'Column already exists',
    detail: 'ADD COLUMN for an existing column. A migration ran twice.',
    howToFix: 'Check the migrations table before running the migration again.',
    category: 'config',
  },
  {
    key: 'ER_CANT_DROP_FIELD_OR_KEY',
    hint: 'Column or key missing',
    detail:
      'DROP COLUMN/KEY for something that does not exist: it was already dropped, or the migrations ran out of order.',
    howToFix: 'Check the migration order against the current schema.',
    category: 'config',
  },
  {
    key: 'ER_PARSE_ERROR',
    hint: 'SQL syntax error',
    detail:
      'The SQL text is malformed, usually a raw query with a reserved word or a wrong placeholder.',
    howToFix:
      'Check the placeholders in the raw query, and quote reserved words with backticks.',
    category: 'bug',
  },
  {
    key: 'ER_WRONG_VALUE_COUNT_ON_ROW',
    hint: 'Column/value count mismatch',
    detail: 'An INSERT lists a different number of values than columns.',
    howToFix: 'Match the number of values to the listed columns.',
    category: 'bug',
  },
  {
    key: 'ER_NON_UNIQ_ERROR',
    hint: 'Ambiguous column',
    detail: 'A column name exists in several joined tables.',
    howToFix: 'Qualify the column with its table alias.',
    category: 'bug',
  },
  {
    key: 'ER_SP_DOES_NOT_EXIST',
    hint: 'Procedure does not exist',
    detail: 'The stored procedure/function is missing (see target).',
    howToFix: 'Run the migration that creates it, or check its name.',
    category: 'config',
    target: /(?:PROCEDURE|FUNCTION) ([^\s]+) does not exist/,
  },
  {
    key: 'ER_ACCESS_DENIED_ERROR',
    hint: 'DB login rejected',
    detail: 'Wrong user/password or host not allowed.',
    howToFix: 'Check the DB env vars.',
    category: 'config',
  },
  {
    key: 'ER_DBACCESS_DENIED_ERROR',
    hint: 'DB access denied',
    detail: 'The user has no privileges on this database.',
    howToFix: 'Grant them, or check the database name in env.',
    category: 'config',
  },
  {
    key: 'ER_TABLEACCESS_DENIED_ERROR',
    hint: 'Table access denied',
    detail: 'The user lacks the privilege (SELECT/INSERT/…) on this table.',
    howToFix: 'Grant the privilege to the DB user.',
    category: 'config',
  },
  {
    key: 'ER_SPECIFIC_ACCESS_DENIED_ERROR',
    hint: 'DB privilege missing',
    detail: 'The operation needs a privilege the user lacks (SUPER, PROCESS).',
    howToFix: 'Grant it or avoid the operation.',
    category: 'config',
  },
  {
    key: 'ER_BAD_DB_ERROR',
    hint: 'Database does not exist',
    detail: 'The database name in env does not exist on this server.',
    howToFix: 'Check the database name in env, or create the database.',
    category: 'config',
  },
  {
    key: 'ER_NOT_SUPPORTED_AUTH_MODE',
    hint: 'DB auth plugin unsupported',
    detail:
      'The server uses caching_sha2_password and the client does not support it.',
    howToFix: 'Upgrade to mysql2 or change the user plugin.',
    category: 'config',
  },
  {
    key: 'ER_HOST_IS_BLOCKED',
    hint: 'Host blocked by MySQL',
    detail: 'Too many failed connections from this host.',
    howToFix: 'Run FLUSH HOSTS on the server and fix the cause.',
    category: 'config',
  },
  {
    key: 'ER_HOST_NOT_PRIVILEGED',
    hint: 'Host not allowed',
    detail: 'The user is not allowed to connect from this host.',
    howToFix: 'Grant user@host.',
    category: 'config',
  },
  {
    key: 'ER_LOCK_WAIT_TIMEOUT',
    hint: 'Row lock wait timed out',
    detail:
      'Waited innodb_lock_wait_timeout for a row lock held by another, long transaction. Only this statement was rolled back.',
    howToFix:
      'Retry the statement or roll back the whole transaction, and keep transactions short.',
    retryable: true,
  },
  {
    key: 'ER_LOCK_DEADLOCK',
    hint: 'Deadlock detected',
    detail:
      'Two transactions locked rows in opposite order; MySQL rolled this one back.',
    howToFix: 'Retry the whole transaction; lock rows in a consistent order.',
    retryable: true,
    category: 'bug',
  },
  {
    key: 'ER_LOCK_NOWAIT',
    hint: 'Row already locked',
    detail: 'SELECT … FOR UPDATE NOWAIT found the row locked.',
    howToFix: 'Retry the operation.',
    retryable: true,
  },
  {
    key: 'ER_QUERY_INTERRUPTED',
    hint: 'Query killed',
    detail: 'The query was killed (KILL QUERY, or a timeout).',
    howToFix: 'Check the slow query.',
    retryable: true,
  },
  {
    key: 'ER_QUERY_TIMEOUT',
    hint: 'Query timed out',
    detail: 'The query exceeded max_execution_time.',
    howToFix: 'Check its plan and indexes.',
    retryable: true,
  },
  {
    key: 'ER_CON_COUNT_ERROR',
    hint: 'Too many DB connections',
    detail: 'The server max_connections is reached. Too many pods × pool size.',
    howToFix: 'Shrink the pool.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ER_TOO_MANY_USER_CONNECTIONS',
    hint: 'User connection limit',
    detail: 'The DB user reached max_user_connections.',
    howToFix: 'Shrink the pool or raise the limit.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ER_USER_LIMIT_REACHED',
    hint: 'User resource limit',
    detail: 'The DB user hit a per-hour resource limit (queries, connections).',
    howToFix: 'Wait for the hourly limit to reset, or raise the user limits.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ER_OUT_OF_RESOURCES',
    hint: 'MySQL out of memory',
    detail: 'The server ran out of memory.',
    howToFix: 'Alert the DB operators.',
    category: 'dependency',
  },
  {
    key: 'ER_DISK_FULL',
    hint: 'MySQL disk full',
    detail: 'The database volume is full.',
    howToFix: 'Alert the DB operators.',
    category: 'dependency',
  },
  {
    key: 'ER_RECORD_FILE_FULL',
    hint: 'Table is full',
    detail: 'The table reached its size limit (tmp table, disk).',
    howToFix: 'Check the query and disk.',
    category: 'dependency',
  },
  {
    key: 'ER_NET_PACKET_TOO_LARGE',
    hint: 'Packet exceeds max_allowed',
    detail:
      'A query or row is larger than max_allowed_packet (a big BLOB or batch insert).',
    howToFix: 'Split it or raise the limit.',
    category: 'bug',
  },
  {
    key: 'ER_NET_READ_ERROR',
    hint: 'MySQL network read error',
    detail:
      'The server failed to read from the client socket. Network trouble.',
    howToFix: 'Retry the query.',
    retryable: true,
  },
  {
    key: 'ER_MAX_PREPARED_STMT_COUNT_REACHED',
    hint: 'Prepared statement leak',
    detail:
      'max_prepared_stmt_count reached: prepared statements stay open, e.g. never closed, or cached per connection by mysql2 execute().',
    howToFix:
      'Close prepared statements after use, or lower mysql2 maxPreparedStatements or the pool size.',
    category: 'bug',
  },
  {
    key: 'ER_UNKNOWN_ERROR',
    hint: 'MySQL unknown error',
    detail: 'The server reported an unknown error.',
    howToFix: 'Read the message and the server log.',
    category: 'dependency',
  },
  {
    key: 'PROTOCOL_CONNECTION_LOST',
    hint: 'DB connection lost',
    detail:
      'The MySQL server closed the connection (wait_timeout, restart, network). The pool reconnects.',
    howToFix: 'Retry the query.',
    retryable: true,
  },
  {
    key: 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
    hint: 'Query after fatal DB error',
    detail: 'A query ran on a connection that already died.',
    howToFix: 'Release it and take a fresh one from the pool.',
    category: 'bug',
  },
  {
    key: 'PROTOCOL_ENQUEUE_AFTER_QUIT',
    hint: 'Query after connection end',
    detail: 'A query ran after connection.end().',
    howToFix: 'Check the connection lifecycle.',
    category: 'bug',
  },
  {
    key: 'PROTOCOL_ENQUEUE_AFTER_DESTROY',
    hint: 'Query after destroy',
    detail: 'A query ran after connection.destroy().',
    howToFix:
      'Check the connection lifecycle, or take a fresh connection from the pool.',
    category: 'bug',
  },
  {
    key: 'PROTOCOL_SEQUENCE_TIMEOUT',
    hint: 'DB handshake timed out',
    detail:
      'No reply within the client timeout: connectTimeout for the handshake, or the query timeout option. The connection is destroyed.',
    howToFix:
      'Check that the server is reachable and the query is fast enough, then retry on a new connection.',
    retryable: true,
  },
  {
    key: 'PROTOCOL_PACKETS_OUT_OF_ORDER',
    hint: 'DB packets out of order',
    detail:
      'The MySQL protocol stream is corrupted: the connection was used concurrently or a proxy mangled it.',
    howToFix:
      'Do not share one connection between concurrent queries; use the pool.',
    category: 'bug',
  },
  {
    key: 'HANDSHAKE_SSL_ERROR',
    hint: 'DB TLS handshake failed',
    detail: 'TLS to MySQL failed.',
    howToFix: 'Check the ssl option and the CA.',
    category: 'config',
  },
  {
    key: 'HANDSHAKE_NO_SSL_SUPPORT',
    hint: 'DB server has no TLS',
    detail: 'ssl was requested but the server does not support it.',
    howToFix:
      'Enable TLS on the server, or turn off the ssl option for this environment.',
    category: 'config',
  },
  {
    key: 'POOL_CLOSED',
    hint: 'DB pool closed',
    detail: 'A query ran after pool.end(), usually during shutdown.',
    howToFix: 'Stop sending queries before calling pool.end() at shutdown.',
    category: 'bug',
  },
  {
    key: 'POOL_CONNLIMIT',
    hint: 'DB pool exhausted',
    detail:
      'All connectionLimit connections are busy and waitForConnections is false, so the pool failed at once. Slow queries hold connections.',
    howToFix:
      'Fix the slow queries, raise connectionLimit, or turn waitForConnections on.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'POOL_ENQUEUELIMIT',
    hint: 'DB pool queue full',
    detail:
      'Too many requests waiting for a connection. The DB is slow or the pool too small.',
    howToFix: 'Check for slow queries, or raise the pool size.',
    category: 'dependency',
    retryable: true,
  },
]
