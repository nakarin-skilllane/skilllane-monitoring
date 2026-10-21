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

/** `-ERR …` covers many cases; the message says which. */
function explainGenericErr({
  error,
  message,
}: ExplainInput): Explanation | undefined {
  const command = redisCommand(error)
  const text = message.replace(/^ERR\s*/, '')
  const cases: [RegExp, string][] = [
    [
      /^unknown command/i,
      'Redis does not know this command: a Redis version too old for it, or a module (RedisJSON, Search) not loaded.',
    ],
    [
      /^wrong number of arguments/i,
      'The command was called with the wrong number of arguments. Check the call site and undefined values in the args.',
    ],
    [
      /not an integer or out of range/i,
      'A numeric argument (TTL, count, offset) is not an integer: undefined, NaN or a float was passed.',
    ],
    [
      /^invalid expire time/i,
      'The TTL is zero, negative or not an integer. Check the expire computation.',
    ],
    [
      /^syntax error/i,
      'An option flag (EX, NX, XX, LIMIT) is misplaced or misspelled in the command.',
    ],
    [
      /^max number of clients reached/i,
      'Redis refused a new connection: too many clients. Look for code creating a Redis client per request or job instead of sharing one.',
    ],
    [
      /^(AUTH <password> called without any password|Client sent AUTH, but no password is set)/i,
      'A password was sent but Redis has none configured. Remove the password from env for this environment.',
    ],
    [
      /^invalid password/i,
      'Redis rejected the password. Check the Redis env vars.',
    ],
    [
      /^DB index is out of range/i,
      'The db number is outside the server range (0-15 by default, 0 only in cluster mode).',
    ],
    [
      /^unknown subcommand/i,
      'The subcommand does not exist on this Redis version.',
    ],
    [
      /^Protocol error/i,
      'Redis got malformed protocol data: an inline command too long or a binary payload sent without a bulk string.',
    ],
    [
      /^Error running script|^user_script|^Error compiling script/i,
      'A Lua script (BullMQ, rate limiter) failed inside Redis. The message names the script line.',
    ],
    [
      /^value is not a valid float/i,
      'A score/increment is not a number: undefined or a string was passed to ZADD/INCRBYFLOAT.',
    ],
    [
      /^index out of range/i,
      'LSET/LINDEX used an index past the end of the list.',
    ],
    [
      /^no such key/i,
      'The key does not exist (RENAME/MOVE). Check the key before the operation.',
    ],
    [
      /^The ID specified in XADD is equal or smaller/i,
      'A stream entry id is not greater than the last one. Use * to let Redis generate ids.',
    ],
    [
      /^Unsupported CONFIG parameter/i,
      'A CONFIG SET parameter is not supported on this server (managed Redis blocks many).',
    ],
  ]
  for (const [match, fix] of cases) {
    if (match.test(text)) return { target: command ?? text.slice(0, 60), fix }
  }
  return command ? { target: command } : undefined
}

// ioredis errors. Reply errors carry the first word of the Redis reply as code
// (redis/src/server.c shared replies, cluster-spec redirections).
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
    key: 'ENOTFOUND',
    dependency: 'redis',
    hint: '{Type} "{name}" host not found',
    hintDetail:
      'DNS could not resolve {host}. Check {env}; the Redis service may not exist in this environment.',
    category: 'config',
  },
  {
    key: 'ECONNRESET',
    dependency: 'redis',
    hint: '{Type} "{name}" connection reset',
    hintDetail:
      '{Type} at {host}:{port} dropped the connection: restart, failover, or an idle timeout on a load balancer. ioredis reconnects.',
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
    key: 'REDIS_SOCKET_TIMEOUT',
    messageMatch: /^Socket timeout\. Expecting data, but didn't receive any/,
    hint: 'Redis socket timed out',
    hintDetail:
      'Commands were pending but no data arrived within socketTimeout. Redis is blocked (slow command, Lua script, fork) or the network stalled.',
    category: 'dependency',
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
    key: 'ClusterAllFailedError',
    dependency: 'redis',
    hint: 'Redis cluster unreachable',
    hintDetail:
      'ioredis could not refresh the slot map from any startup node. The whole cluster is down, or {env} lists wrong nodes.',
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
    key: 'REDIS_CLUSTER_OFFLINE',
    messageMatch:
      /^Cluster isn't ready and enableOfflineQueue options is false/,
    hint: 'Redis cluster not ready',
    hintDetail:
      'A command ran before the cluster slot map was loaded and the offline queue is disabled. Wait for the ready event, or enable the queue.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'REDIS_CLUSTER_NO_NODES',
    messageMatch: /^None of startup nodes is available/,
    hint: 'Redis cluster nodes down',
    hintDetail:
      'No startup node accepted a connection. The cluster is down or the node list in env is wrong.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'REDIS_CLUSTER_REDIRECTIONS',
    messageMatch: /^Too many Cluster redirections/,
    hint: 'Redis cluster unstable',
    hintDetail:
      'MOVED/ASK redirects exceeded maxRedirections: slots are migrating or the slot map is stale. Usually clears after resharding ends.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'REDIS_SUBSCRIBER_MODE',
    messageMatch:
      /^Connection in subscriber mode, only subscriber commands may be used/,
    hint: 'Command on pub/sub client',
    hintDetail:
      'A regular command ran on a connection that has SUBSCRIBE active. Use a separate client for pub/sub.',
    category: 'bug',
  },
  {
    key: 'REDIS_ALREADY_CONNECTING',
    messageMatch: /^Redis is already connecting\/connected/,
    hint: 'connect() called twice',
    hintDetail:
      'connect() was called on a client that is already connecting (lazyConnect false). Remove the extra connect().',
    category: 'bug',
  },
  {
    key: 'NOAUTH',
    dependency: 'redis',
    hint: 'Redis password missing',
    hintDetail: 'Redis requires a password but none was sent. Check {env}.',
    category: 'config',
  },
  {
    key: 'WRONGPASS',
    dependency: 'redis',
    hint: 'Wrong Redis password',
    hintDetail: 'Redis rejected the username or password. Check {env}.',
    category: 'config',
  },
  {
    key: 'NOPERM',
    dependency: 'redis',
    hint: 'Redis ACL denied command',
    hintDetail:
      'The Redis user lacks permission for this command or key pattern (ACL). Grant it, or use the right user in {env}.',
    category: 'config',
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
    key: 'MASTERDOWN',
    dependency: 'redis',
    hint: 'Redis master is down',
    hintDetail:
      'The replica lost its master and replica-serve-stale-data is off. Wait for the failover to elect a new master.',
    retryable: true,
  },
  {
    key: 'NOREPLICAS',
    dependency: 'redis',
    hint: 'Redis has too few replicas',
    hintDetail:
      'min-replicas-to-write is not met: replicas are down or lagging. Writes resume when they catch up.',
    retryable: true,
  },
  {
    key: 'MISCONF',
    dependency: 'redis',
    hint: 'Redis cannot persist to disk',
    hintDetail:
      'RDB snapshots fail (disk full or permissions) and stop-writes-on-bgsave-error is on, so writes are refused. Fix the Redis disk.',
    category: 'dependency',
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
    key: 'NOTBUSY',
    dependency: 'redis',
    hint: 'No script to kill',
    hintDetail: 'SCRIPT KILL ran while no script was running.',
  },
  {
    key: 'UNKILLABLE',
    dependency: 'redis',
    hint: 'Redis script cannot be killed',
    hintDetail:
      'The running script already wrote data, so SCRIPT KILL refuses. Only SHUTDOWN NOSAVE stops it.',
    category: 'dependency',
  },
  {
    key: 'EXECABORT',
    dependency: 'redis',
    hint: 'Redis transaction discarded',
    hintDetail:
      'A command queued inside MULTI was invalid, so EXEC aborted the whole transaction. Read the earlier reply error.',
    category: 'bug',
  },
  {
    key: 'BUSYKEY',
    dependency: 'redis',
    hint: 'Redis key already exists',
    hintDetail:
      'RESTORE/RENAMENX targets a key that exists. Use REPLACE or delete it first.',
    level: 'warn',
  },
  {
    key: 'NOGROUP',
    dependency: 'redis',
    hint: 'Redis stream group missing',
    hintDetail:
      'XREADGROUP/XACK names a consumer group or stream that does not exist. Create it with XGROUP CREATE (MKSTREAM) at startup.',
    category: 'config',
  },
  {
    key: 'BUSYGROUP',
    dependency: 'redis',
    hint: 'Stream group already exists',
    hintDetail:
      'XGROUP CREATE ran for a group that exists. Safe to ignore at startup; catch it.',
    level: 'warn',
  },
  {
    key: 'UNBLOCKED',
    dependency: 'redis',
    hint: 'Blocking command unblocked',
    hintDetail:
      'A blocking command (BLPOP, XREAD BLOCK) was interrupted by CLIENT UNBLOCK or a failover. Retry.',
    retryable: true,
  },
  {
    key: 'MOVED',
    dependency: 'redis',
    hint: 'Redis slot moved',
    hintDetail:
      'The key hash slot lives on another cluster node. A standalone client is talking to a cluster: use the cluster client.',
    category: 'config',
  },
  {
    key: 'ASK',
    dependency: 'redis',
    hint: 'Redis slot migrating',
    hintDetail:
      'The slot is being migrated; the cluster client follows the ASK redirect. Seeing it here means a non-cluster client is in use.',
    category: 'config',
  },
  {
    key: 'TRYAGAIN',
    dependency: 'redis',
    hint: 'Redis slot being resharded',
    hintDetail:
      'A multi-key command hit a slot in migration. Retry shortly; it clears when resharding finishes.',
    retryable: true,
  },
  {
    key: 'CLUSTERDOWN',
    dependency: 'redis',
    hint: 'Redis cluster is down',
    hintDetail:
      'Some hash slots have no serving node (a master and its replicas are down). The cluster refuses commands until coverage is back.',
    retryable: true,
  },
  {
    key: 'CROSSSLOT',
    dependency: 'redis',
    hint: 'Keys on different slots',
    hintDetail:
      'A multi-key command (MGET, Lua, MULTI) used keys from different hash slots. Use hash tags {…} so related keys share a slot.',
    category: 'bug',
  },
  {
    key: 'NOPROTO',
    dependency: 'redis',
    hint: 'RESP version unsupported',
    hintDetail:
      'HELLO asked for a protocol version this Redis does not support. Use RESP2.',
    category: 'config',
  },
  {
    key: 'DENIED',
    dependency: 'redis',
    hint: 'Redis protected mode',
    hintDetail:
      'Redis is in protected mode and refuses non-loopback clients without a password. Set a password or bind address on the server.',
    category: 'config',
  },
  {
    key: 'ERR',
    dependency: 'redis',
    hint: 'Redis rejected the command',
    hintDetail:
      'Redis answered a generic ERR (see target and fix): wrong arguments, an unknown command, a bad TTL, or a Lua script failure.',
    category: 'bug',
    explain: explainGenericErr,
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
