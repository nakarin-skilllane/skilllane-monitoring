import type { ErrorPattern } from './types'

// MySQL/MariaDB server errors (ER_* names from mysql/mysql2) and the
// client-side PROTOCOL_* / POOL_* codes.
export const mysqlPatterns: ErrorPattern[] = [
  {
    key: 'ER_DUP_ENTRY',
    hint: 'Duplicate record',
    hintDetail:
      'A unique key rejected the row (see target). Often a double submit or concurrent insert.',
    level: 'warn',
    category: 'data',
    target: /for key '([^']+)'/,
  },
  {
    key: 'ER_NO_REFERENCED_ROW_2',
    hint: 'Related record not found',
    hintDetail:
      'A foreign key points to a row that does not exist (see target). Validate the referenced id.',
    level: 'warn',
    category: 'data',
    target: /CONSTRAINT `([^`]+)`/,
  },
  {
    key: 'ER_NO_REFERENCED_ROW',
    hint: 'Related record not found',
    hintDetail:
      'A foreign key points to a row that does not exist. Validate the referenced id.',
    level: 'warn',
    category: 'data',
  },
  {
    key: 'ER_ROW_IS_REFERENCED_2',
    hint: 'Record still in use',
    hintDetail:
      'Other rows still reference this one (see target), so it cannot be deleted. Delete or detach them first.',
    level: 'warn',
    category: 'data',
    target: /CONSTRAINT `([^`]+)`/,
  },
  {
    key: 'ER_ROW_IS_REFERENCED',
    hint: 'Record still in use',
    hintDetail: 'Other rows still reference this one, so it cannot be deleted.',
    level: 'warn',
    category: 'data',
  },
  {
    key: 'ER_BAD_NULL_ERROR',
    hint: 'Required column null',
    hintDetail:
      'A NOT NULL column got null (see target). The DTO or mapping left it undefined.',
    level: 'warn',
    target: /Column '([^']+)'/,
  },
  {
    key: 'ER_NO_DEFAULT_FOR_FIELD',
    hint: 'Required field missing',
    hintDetail:
      'A column without a default was omitted from the insert (see target).',
    level: 'warn',
    target: /Field '([^']+)'/,
  },
  {
    key: 'ER_DATA_TOO_LONG',
    hint: 'Value too long',
    hintDetail:
      'A value exceeds the column size (see target). Validate the length, or widen the column.',
    level: 'warn',
    target: /for column '([^']+)'/,
  },
  {
    key: 'ER_TRUNCATED_WRONG_VALUE',
    hint: 'Invalid value for type',
    hintDetail:
      'A value could not be converted to the column type (bad date, text into number). Validate the input.',
    level: 'warn',
  },
  {
    key: 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD',
    hint: 'Invalid value for column',
    hintDetail:
      'A value does not fit the column type (see target), e.g. a string into an integer column, invalid UTF-8.',
    level: 'warn',
    target: /for column '([^']+)'/,
  },
  {
    key: 'ER_WARN_DATA_OUT_OF_RANGE',
    hint: 'Number out of range',
    hintDetail: 'A numeric value does not fit the column type (see target).',
    level: 'warn',
    target: /for column '([^']+)'/,
  },
  {
    key: 'ER_DATA_OUT_OF_RANGE',
    hint: 'Number out of range',
    hintDetail: 'An arithmetic result does not fit its type (BIGINT overflow).',
    level: 'warn',
  },
  {
    key: 'ER_CHECK_CONSTRAINT_VIOLATED',
    hint: 'Check constraint violated',
    hintDetail: 'A CHECK constraint rejected the row (see target).',
    level: 'warn',
    target: /constraint '([^']+)'/,
  },
  {
    key: 'ER_INVALID_JSON_TEXT',
    hint: 'Invalid JSON for column',
    hintDetail: 'The value for a JSON column is not valid JSON.',
    level: 'warn',
  },
  {
    key: 'ER_BAD_FIELD_ERROR',
    hint: 'Column does not exist',
    hintDetail:
      'The column is unknown (see target): a migration not run, or a property name used as a column.',
    category: 'config',
    target: /Unknown column '([^']+)'/,
  },
  {
    key: 'ER_NO_SUCH_TABLE',
    hint: 'Table does not exist',
    hintDetail:
      'The table is missing (see target): a migration not run, or the wrong database in env.',
    category: 'config',
    target: /Table '([^']+)' doesn't exist/,
  },
  {
    key: 'ER_TABLE_EXISTS_ERROR',
    hint: 'Table already exists',
    hintDetail:
      'CREATE TABLE for an existing table. A migration ran twice or synchronize is on.',
    category: 'config',
  },
  {
    key: 'ER_DUP_FIELDNAME',
    hint: 'Column already exists',
    hintDetail: 'ADD COLUMN for an existing column. A migration ran twice.',
    category: 'config',
  },
  {
    key: 'ER_CANT_DROP_FIELD_OR_KEY',
    hint: 'Column or key missing',
    hintDetail:
      'DROP COLUMN/KEY for something that does not exist. The migration order is wrong.',
    category: 'config',
  },
  {
    key: 'ER_PARSE_ERROR',
    hint: 'SQL syntax error',
    hintDetail:
      'The SQL text is malformed, usually a raw query with a reserved word or a wrong placeholder.',
    category: 'bug',
  },
  {
    key: 'ER_WRONG_VALUE_COUNT_ON_ROW',
    hint: 'Column/value count mismatch',
    hintDetail: 'An INSERT lists a different number of values than columns.',
    category: 'bug',
  },
  {
    key: 'ER_NON_UNIQ_ERROR',
    hint: 'Ambiguous column',
    hintDetail:
      'A column name exists in several joined tables. Qualify it with the alias.',
    category: 'bug',
  },
  {
    key: 'ER_SP_DOES_NOT_EXIST',
    hint: 'Procedure does not exist',
    hintDetail: 'The stored procedure/function is missing (see target).',
    category: 'config',
    target: /(?:PROCEDURE|FUNCTION) ([^\s]+) does not exist/,
  },
  {
    key: 'ER_ACCESS_DENIED_ERROR',
    hint: 'DB login rejected',
    hintDetail:
      'Wrong user/password or host not allowed. Check the DB env vars.',
    category: 'config',
  },
  {
    key: 'ER_DBACCESS_DENIED_ERROR',
    hint: 'DB access denied',
    hintDetail:
      'The user has no privileges on this database. Grant them, or check the database name in env.',
    category: 'config',
  },
  {
    key: 'ER_TABLEACCESS_DENIED_ERROR',
    hint: 'Table access denied',
    hintDetail:
      'The user lacks the privilege (SELECT/INSERT/…) on this table. Grant it.',
    category: 'config',
  },
  {
    key: 'ER_SPECIFIC_ACCESS_DENIED_ERROR',
    hint: 'DB privilege missing',
    hintDetail:
      'The operation needs a privilege the user lacks (SUPER, PROCESS). Grant it or avoid the operation.',
    category: 'config',
  },
  {
    key: 'ER_BAD_DB_ERROR',
    hint: 'Database does not exist',
    hintDetail: 'The database name in env does not exist on this server.',
    category: 'config',
  },
  {
    key: 'ER_NOT_SUPPORTED_AUTH_MODE',
    hint: 'DB auth plugin unsupported',
    hintDetail:
      'The server uses caching_sha2_password and the client does not support it. Upgrade to mysql2 or change the user plugin.',
    category: 'config',
  },
  {
    key: 'ER_HOST_IS_BLOCKED',
    hint: 'Host blocked by MySQL',
    hintDetail:
      'Too many failed connections from this host. Run FLUSH HOSTS on the server and fix the cause.',
    category: 'config',
  },
  {
    key: 'ER_HOST_NOT_PRIVILEGED',
    hint: 'Host not allowed',
    hintDetail:
      'The user is not allowed to connect from this host. Grant user@host.',
    category: 'config',
  },
  {
    key: 'ER_LOCK_WAIT_TIMEOUT',
    hint: 'Row lock wait timed out',
    hintDetail:
      'Waited innodb_lock_wait_timeout for a row lock held by another transaction. A long transaction holds it; retry, and keep transactions short.',
    retryable: true,
  },
  {
    key: 'ER_LOCK_DEADLOCK',
    hint: 'Deadlock detected',
    hintDetail:
      'Two transactions locked rows in opposite order; MySQL rolled this one back. Retry; lock rows in a consistent order.',
    retryable: true,
    category: 'bug',
  },
  {
    key: 'ER_LOCK_NOWAIT',
    hint: 'Row already locked',
    hintDetail: 'SELECT … FOR UPDATE NOWAIT found the row locked. Retry.',
    retryable: true,
  },
  {
    key: 'ER_QUERY_INTERRUPTED',
    hint: 'Query killed',
    hintDetail:
      'The query was killed (KILL QUERY, or a timeout). Check the slow query.',
    retryable: true,
  },
  {
    key: 'ER_QUERY_TIMEOUT',
    hint: 'Query timed out',
    hintDetail:
      'The query exceeded max_execution_time. Check its plan and indexes.',
    retryable: true,
  },
  {
    key: 'ER_CON_COUNT_ERROR',
    hint: 'Too many DB connections',
    hintDetail:
      'The server max_connections is reached. Too many pods × pool size; shrink the pool.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ER_TOO_MANY_USER_CONNECTIONS',
    hint: 'User connection limit',
    hintDetail:
      'The DB user reached max_user_connections. Shrink the pool or raise the limit.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ER_USER_LIMIT_REACHED',
    hint: 'User resource limit',
    hintDetail:
      'The DB user hit a per-hour resource limit (queries, connections).',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ER_OUT_OF_RESOURCES',
    hint: 'MySQL out of memory',
    hintDetail: 'The server ran out of memory. Alert the DB operators.',
    category: 'dependency',
  },
  {
    key: 'ER_DISK_FULL',
    hint: 'MySQL disk full',
    hintDetail: 'The database volume is full. Alert the DB operators.',
    category: 'dependency',
  },
  {
    key: 'ER_RECORD_FILE_FULL',
    hint: 'Table is full',
    hintDetail:
      'The table reached its size limit (tmp table, disk). Check the query and disk.',
    category: 'dependency',
  },
  {
    key: 'ER_NET_PACKET_TOO_LARGE',
    hint: 'Packet exceeds max_allowed',
    hintDetail:
      'A query or row is larger than max_allowed_packet (a big BLOB or batch insert). Split it or raise the limit.',
    category: 'bug',
  },
  {
    key: 'ER_NET_READ_ERROR',
    hint: 'MySQL network read error',
    hintDetail:
      'The server failed to read from the client socket. Network trouble; retry.',
    retryable: true,
  },
  {
    key: 'ER_MAX_PREPARED_STMT_COUNT_REACHED',
    hint: 'Prepared statement leak',
    hintDetail:
      'max_prepared_stmt_count reached: statements are prepared and never closed. Fix the leak.',
    category: 'bug',
  },
  {
    key: 'ER_UNKNOWN_ERROR',
    hint: 'MySQL unknown error',
    hintDetail:
      'The server reported an unknown error. Read the message and the server log.',
    category: 'dependency',
  },
  {
    key: 'PROTOCOL_CONNECTION_LOST',
    hint: 'DB connection lost',
    hintDetail:
      'The MySQL server closed the connection (wait_timeout, restart, network). The pool reconnects; retry the query.',
    retryable: true,
  },
  {
    key: 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
    hint: 'Query after fatal DB error',
    hintDetail:
      'A query ran on a connection that already died. Release it and take a fresh one from the pool.',
    category: 'bug',
  },
  {
    key: 'PROTOCOL_ENQUEUE_AFTER_QUIT',
    hint: 'Query after connection end',
    hintDetail:
      'A query ran after connection.end(). Check the connection lifecycle.',
    category: 'bug',
  },
  {
    key: 'PROTOCOL_ENQUEUE_AFTER_DESTROY',
    hint: 'Query after destroy',
    hintDetail: 'A query ran after connection.destroy().',
    category: 'bug',
  },
  {
    key: 'PROTOCOL_SEQUENCE_TIMEOUT',
    hint: 'DB handshake timed out',
    hintDetail:
      'The MySQL handshake or query did not finish within connectTimeout. The server is unreachable or overloaded.',
    retryable: true,
  },
  {
    key: 'PROTOCOL_PACKETS_OUT_OF_ORDER',
    hint: 'DB packets out of order',
    hintDetail:
      'The MySQL protocol stream is corrupted: the connection was used concurrently or a proxy mangled it.',
    category: 'bug',
  },
  {
    key: 'HANDSHAKE_SSL_ERROR',
    hint: 'DB TLS handshake failed',
    hintDetail: 'TLS to MySQL failed. Check the ssl option and the CA.',
    category: 'config',
  },
  {
    key: 'HANDSHAKE_NO_SSL_SUPPORT',
    hint: 'DB server has no TLS',
    hintDetail: 'ssl was requested but the server does not support it.',
    category: 'config',
  },
  {
    key: 'POOL_CLOSED',
    hint: 'DB pool closed',
    hintDetail: 'A query ran after pool.end(), usually during shutdown.',
    category: 'bug',
  },
  {
    key: 'POOL_CONNLIMIT',
    hint: 'DB pool exhausted',
    hintDetail:
      'No free connection within the limit and queueLimit reached. Slow queries hold connections; raise the limit or fix them.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'POOL_ENQUEUELIMIT',
    hint: 'DB pool queue full',
    hintDetail:
      'Too many requests waiting for a connection. The DB is slow or the pool too small.',
    category: 'dependency',
    retryable: true,
  },
]
