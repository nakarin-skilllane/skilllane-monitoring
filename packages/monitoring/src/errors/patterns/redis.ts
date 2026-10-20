import { keyShape } from './explain-helpers'
import type { ErrorPattern, ExplainInput, Explanation } from './types'

/** ioredis ReplyError.command: the command and the shape of its key. */
function redisCommand(error: any): string | undefined {
  const name = error?.command?.name
  if (typeof name !== 'string') return undefined
  const key = keyShape(error.command.args?.[0])
  return key ? `${name.toUpperCase()} ${key}` : name.toUpperCase()
}

function explainCommand(fix: (command: string) => string) {
  return ({ error }: ExplainInput): Explanation | undefined => {
    const command = redisCommand(error)
    return command ? { target: command, fix: fix(command) } : undefined
  }
}

// ioredis errors. Reply errors carry the first word of the Redis reply as code.
export const redisPatterns: ErrorPattern[] = [
  {
    key: 'ECONNREFUSED',
    dependency: 'redis',
    hint: '{Type} "{name}" unreachable',
    hintDetail:
      'Nothing is listening at {host}:{port}. {Type} may be stopped or restarting, or {env} is wrong.',
    retryable: true,
  },
  {
    key: 'ETIMEDOUT',
    dependency: 'redis',
    hint: '{Type} "{name}" not responding',
    hintDetail:
      'No reply from {host}:{port} in time. {Type} may be overloaded or the network is blocking.',
    retryable: true,
  },
  {
    key: 'REDIS_COMMAND_TIMEOUT',
    dependency: 'redis',
    messageMatch: /^Command timed out/,
    hint: 'Redis command timed out',
    hintDetail:
      'A command took longer than commandTimeout. Redis may be blocked by a slow command (KEYS, large HGETALL) or overloaded.',
    retryable: true,
  },
  {
    key: 'MaxRetriesPerRequestError',
    dependency: 'redis',
    hint: 'Redis unavailable',
    hintDetail:
      'The command was retried until maxRetriesPerRequest while Redis stayed unreachable. See the dependency.down line for the cause.',
    retryable: true,
  },
  {
    key: 'REDIS_CONNECTION_CLOSED',
    dependency: 'redis',
    messageMatch: /^Connection is closed/,
    hint: 'Redis connection closed',
    hintDetail:
      'A command was sent on a closed connection, often during shutdown or after quit(). Check the client lifecycle.',
  },
  {
    // ioredis with enableOfflineQueue: false fails a command at once while the
    // connection is down. No dependency scope: an app.log line (e.g. a cache
    // fallback warning) carries this error without a dependency.type.
    key: 'REDIS_OFFLINE',
    messageMatch:
      /^Stream isn't writeable and enableOfflineQueue options is false/,
    hint: 'Redis unavailable',
    hintDetail:
      'The command failed at once because the connection is down and enableOfflineQueue is false. See the dependency.down line for the cause.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'NOAUTH',
    dependency: 'redis',
    hint: 'Redis password missing',
    hintDetail: 'Redis requires a password but none was sent. Check {env}.',
  },
  {
    key: 'WRONGPASS',
    dependency: 'redis',
    hint: 'Wrong Redis password',
    hintDetail: 'Redis rejected the username or password. Check {env}.',
  },
  {
    key: 'READONLY',
    dependency: 'redis',
    hint: 'Redis replica is read-only',
    hintDetail:
      'A write hit a replica, usually right after a failover. The client should reconnect to the new master.',
    retryable: true,
  },
  {
    key: 'LOADING',
    dependency: 'redis',
    hint: 'Redis is loading data',
    hintDetail:
      'Redis just restarted and is loading its dataset into memory. Retry in a few seconds.',
    retryable: true,
  },
  {
    key: 'OOM',
    dependency: 'redis',
    hint: 'Redis out of memory',
    hintDetail:
      'Redis reached maxmemory and refused the write. Check key TTLs, queue retention (removeOnComplete/Fail) and memory limits.',
    category: 'dependency',
    explain: explainCommand(
      (command) =>
        `${command} was refused: Redis is full. Find large key patterns without TTL (redis-cli --bigkeys) and old BullMQ jobs.`,
    ),
  },
  {
    key: 'WRONGTYPE',
    dependency: 'redis',
    hint: 'Redis key has another type',
    hintDetail:
      'A command expected another data type (e.g. HGET on a string). The key format changed between deploys, or two features share a key name.',
    category: 'bug',
    explain: explainCommand(
      (command) =>
        `${command}: the key holds another type. Delete the old key or give the new format a new key prefix.`,
    ),
  },
  {
    key: 'BUSY',
    dependency: 'redis',
    hint: 'Redis blocked by a Lua script',
    hintDetail:
      'A long-running Lua script (BullMQ uses many) is blocking Redis. Commands fail until it ends; check large queues or SCRIPT KILL.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'NOSCRIPT',
    dependency: 'redis',
    hint: 'Redis Lua script missing',
    hintDetail:
      'EVALSHA ran after Redis restarted or flushed its script cache. ioredis/BullMQ reload it; frequent cases mean Redis keeps restarting.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'REDIS_MAX_CLIENTS',
    dependency: 'redis',
    messageMatch: /max number of clients reached/,
    hint: 'Redis connection limit reached',
    hintDetail:
      'Redis refused a new connection: too many clients. Look for code that creates a Redis client per request or job instead of sharing one.',
    category: 'bug',
  },
]
