import { keyShape } from './explain-helpers'
import type { ErrorPattern, ExplainInput, Explanation } from './types'

// Sources:
// - https://github.com/redis/redis/blob/unstable/src/server.c (shared error replies: WRONGTYPE, OOM, LOADING, MISCONF, BUSY...)
// - https://github.com/redis/redis/tree/unstable/src (per-command error replies in acl.c, cluster.c, script.c, t_stream.c, networking.c)
// - https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/ (MOVED, ASK, TRYAGAIN, CLUSTERDOWN, CROSSSLOT, hash tags)
// - https://github.com/redis/ioredis/tree/main/lib (ioredis client errors and options)
// - https://nodejs.org/api/errors.html (Node.js socket error codes)
/** ioredis ReplyError.command: the command and the shape of its key. */
function redisCommand(error: any): string | undefined {
  const name = error?.command?.name
  if (typeof name !== 'string') return undefined
  const key = keyShape(error.command.args?.[0])
  return key ? `${name.toUpperCase()} ${key}` : name.toUpperCase()
}

function explainCommand(
  text: (command: string) => { detail?: string; howToFix?: string },
) {
  return ({ error }: ExplainInput): Explanation | undefined => {
    const command = redisCommand(error)
    return command ? { target: command, ...text(command) } : undefined
  }
}

/** `-ERR …` covers many cases; the message says which. */
function explainGenericErr({
  error,
  message,
}: ExplainInput): Explanation | undefined {
  const command = redisCommand(error)
  const text = message.replace(/^ERR\s*/, '')
  // [message match, detail, howToFix]
  const cases: [RegExp, string, string?][] = [
    [
      /^unknown command/i,
      'Redis does not know this command: a Redis version too old for it, or a module (RedisJSON, Search) not loaded.',
    ],
    [
      /^wrong number of arguments/i,
      'The command was called with the wrong number of arguments.',
      'Check the call site and undefined values in the args.',
    ],
    [
      /not an integer or out of range/i,
      'A numeric argument (TTL, count, offset) is not an integer: undefined, NaN or a float was passed.',
    ],
    [
      /^invalid expire time/i,
      'The TTL is zero, negative, or so large that it overflows.',
      'Check the expire computation.',
    ],
    [
      /^syntax error/i,
      'An option flag (EX, NX, XX, LIMIT) is misplaced or misspelled in the command.',
    ],
    [
      /^max number of clients reached/i,
      'Redis refused a new connection: too many clients.',
      'Look for code creating a Redis client per request or job instead of sharing one.',
    ],
    [
      /^(AUTH <password> called without any password|Client sent AUTH, but no password is set)/i,
      'A password was sent but Redis has none configured.',
      'Remove the password from env for this environment.',
    ],
    [
      /^invalid password/i,
      'Redis rejected the password.',
      'Check the Redis env vars.',
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
      'Redis got malformed RESP data: an inline request too big, unbalanced quotes, or an invalid bulk length. Often a non-Redis client or a corrupted stream.',
    ],
    [
      /^Error running script|^user_script|^Error compiling script/i,
      'A Lua script (BullMQ, rate limiter) failed inside Redis. The message names the script line.',
    ],
    [
      /^value is not a valid float/i,
      'A score/increment is not a number: undefined or a string was passed to ZADD/INCRBYFLOAT.',
    ],
    [/^index out of range/i, 'LSET used an index past the end of the list.'],
    [
      /^no such key/i,
      'The key does not exist (RENAME, or LSET on a missing key).',
      'Check the key before the operation.',
    ],
    [
      /^The ID specified in XADD is equal or smaller/i,
      'A stream entry id is not greater than the last one.',
      'Use * to let Redis generate ids.',
    ],
    [
      /^Unsupported CONFIG parameter/i,
      'A CONFIG SET parameter is not supported on this server (managed Redis blocks many).',
    ],
  ]
  for (const [match, detail, howToFix] of cases) {
    if (match.test(text))
      return { target: command ?? text.slice(0, 60), detail, howToFix }
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
    detail:
      'Nothing is listening at {host}:{port}. {Type} may be stopped or restarting, or {env} is wrong.',
    howToFix: 'Check that {Type} is running and that {env} points to it.',
    retryable: true,
  },
  {
    key: 'ETIMEDOUT',
    dependency: 'redis',
    hint: '{Type} "{name}" not responding',
    detail:
      'No reply from {host}:{port} in time. {Type} may be overloaded or the network is blocking.',
    howToFix: 'Check the {Type} load and the network path to {host}:{port}.',
    retryable: true,
  },
  {
    key: 'ENOTFOUND',
    dependency: 'redis',
    hint: '{Type} "{name}" host not found',
    detail:
      'DNS could not resolve {host}. The Redis service may not exist in this environment.',
    howToFix: 'Check {env}.',
    category: 'config',
  },
  {
    key: 'ECONNRESET',
    dependency: 'redis',
    hint: '{Type} "{name}" connection reset',
    detail:
      '{Type} at {host}:{port} dropped the connection: restart, failover, or an idle timeout on a load balancer. ioredis reconnects.',
    howToFix:
      'Retry; if it repeats, check {Type} restarts and the load balancer idle timeout.',
    retryable: true,
  },
  {
    key: 'REDIS_COMMAND_TIMEOUT',
    dependency: 'redis',
    messageMatch: /^Command timed out/,
    hint: 'Redis command timed out',
    detail:
      'A command took longer than commandTimeout. Redis may be blocked by a slow command (KEYS, large HGETALL) or overloaded.',
    howToFix: 'Find slow commands in SLOWLOG, and replace KEYS with SCAN.',
    retryable: true,
  },
  {
    key: 'REDIS_SOCKET_TIMEOUT',
    messageMatch: /^Socket timeout\. Expecting data, but didn't receive any/,
    hint: 'Redis socket timed out',
    detail:
      'Commands were pending but no data arrived within socketTimeout. Redis is blocked (slow command, Lua script, fork) or the network stalled.',
    howToFix: 'Check SLOWLOG and long Lua scripts, then the network.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'MaxRetriesPerRequestError',
    dependency: 'redis',
    hint: 'Redis unavailable',
    detail:
      'The command was retried until maxRetriesPerRequest while Redis stayed unreachable.',
    howToFix: 'See the dependency.down line for the cause.',
    retryable: true,
  },
  {
    key: 'ClusterAllFailedError',
    dependency: 'redis',
    hint: 'Redis cluster unreachable',
    detail:
      'ioredis could not refresh the slot map from any startup node. The whole cluster is down, or {env} lists wrong nodes.',
    howToFix: 'Check the cluster status and the node list in {env}.',
    retryable: true,
  },
  {
    key: 'REDIS_CONNECTION_CLOSED',
    dependency: 'redis',
    messageMatch: /^Connection is closed/,
    hint: 'Redis connection closed',
    detail:
      'A command ran on a connection that has ended: after quit()/disconnect() during shutdown, or after retryStrategy stopped reconnecting.',
    howToFix:
      'Check the shutdown order and retryStrategy, and do not use the client after quit().',
  },
  {
    // ioredis with enableOfflineQueue: false fails a command at once while the
    // connection is down. No dependency scope: an app.log line (e.g. a cache
    // fallback warning) carries this error without a dependency.type.
    key: 'REDIS_OFFLINE',
    messageMatch:
      /^Stream isn't writeable and enableOfflineQueue options is false/,
    hint: 'Redis unavailable',
    detail:
      'The command failed at once because the connection is down and enableOfflineQueue is false.',
    howToFix: 'See the dependency.down line for the cause.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'REDIS_CLUSTER_OFFLINE',
    messageMatch:
      /^Cluster isn't ready and enableOfflineQueue options is false/,
    hint: 'Redis cluster not ready',
    detail:
      'A command ran before the cluster slot map was loaded and the offline queue is disabled.',
    howToFix: 'Wait for the ready event, or enable the queue.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'REDIS_CLUSTER_NO_NODES',
    messageMatch: /^None of startup nodes is available/,
    hint: 'Redis cluster nodes down',
    detail:
      'No startup node accepted a connection. The cluster is down or the node list in env is wrong.',
    howToFix: 'Check the cluster status and the node list in env.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'REDIS_CLUSTER_REDIRECTIONS',
    messageMatch: /^Too many Cluster redirections/,
    hint: 'Redis cluster unstable',
    detail:
      'A command was retried more than maxRedirections times on MOVED/ASK/TRYAGAIN/CLUSTERDOWN or a closed node connection. The message names the last error.',
    howToFix:
      'Read the last error in the message; it usually clears once resharding or failover ends.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'REDIS_SUBSCRIBER_MODE',
    messageMatch:
      /^Connection in subscriber mode, only subscriber commands may be used/,
    hint: 'Command on pub/sub client',
    detail: 'A regular command ran on a connection that has SUBSCRIBE active.',
    howToFix: 'Use a separate client for pub/sub.',
    category: 'bug',
  },
  {
    key: 'REDIS_ALREADY_CONNECTING',
    messageMatch: /^Redis is already connecting\/connected/,
    hint: 'connect() called twice',
    detail:
      'connect() was called on a client that is already connecting (lazyConnect false).',
    howToFix: 'Remove the extra connect().',
    category: 'bug',
  },
  {
    key: 'NOAUTH',
    dependency: 'redis',
    hint: 'Redis password missing',
    detail: 'Redis requires a password but none was sent.',
    howToFix: 'Check {env}.',
    category: 'config',
  },
  {
    key: 'WRONGPASS',
    dependency: 'redis',
    hint: 'Wrong Redis password',
    detail:
      'Redis rejected the username/password pair, or the ACL user is disabled.',
    howToFix: 'Check {env}.',
    category: 'config',
  },
  {
    key: 'NOPERM',
    dependency: 'redis',
    hint: 'Redis ACL denied command',
    detail:
      'The Redis user lacks permission for this command or key pattern (ACL).',
    howToFix: 'Grant it, or use the right user in {env}.',
    category: 'config',
  },
  {
    key: 'READONLY',
    dependency: 'redis',
    hint: 'Redis replica is read-only',
    detail: 'A write hit a replica, usually right after a failover.',
    howToFix: 'Reconnect the client to the new master.',
    retryable: true,
  },
  {
    key: 'MASTERDOWN',
    dependency: 'redis',
    hint: 'Redis master is down',
    detail: 'The replica lost its master and replica-serve-stale-data is off.',
    howToFix: 'Wait for the failover to elect a new master.',
    retryable: true,
  },
  {
    key: 'NOREPLICAS',
    dependency: 'redis',
    hint: 'Redis has too few replicas',
    detail:
      'min-replicas-to-write is not met: replicas are down or lagging. Writes resume when they catch up.',
    howToFix: 'Check replica health and lag, then retry.',
    retryable: true,
  },
  {
    key: 'MISCONF',
    dependency: 'redis',
    hint: 'Redis cannot persist to disk',
    detail:
      'Redis cannot persist to disk (a failed RDB snapshot with stop-writes-on-bgsave-error on, or AOF write errors), so writes are refused.',
    howToFix:
      'Check the Redis logs for the RDB/AOF error and fix the disk (space, permissions).',
    category: 'dependency',
  },
  {
    key: 'LOADING',
    dependency: 'redis',
    hint: 'Redis is loading data',
    detail: 'Redis just restarted and is loading its dataset into memory.',
    howToFix: 'Retry in a few seconds.',
    retryable: true,
  },
  {
    key: 'OOM',
    dependency: 'redis',
    hint: 'Redis out of memory',
    detail: 'Redis reached maxmemory and refused the write.',
    howToFix:
      'Check key TTLs, queue retention (removeOnComplete/Fail) and memory limits.',
    category: 'dependency',
    explain: explainCommand((command) => ({
      detail: `${command} was refused: Redis is full.`,
      howToFix:
        'Find large key patterns without TTL (redis-cli --bigkeys) and old BullMQ jobs.',
    })),
  },
  {
    key: 'WRONGTYPE',
    dependency: 'redis',
    hint: 'Redis key has another type',
    detail:
      'A command expected another data type (e.g. HGET on a string). The key format changed between deploys, or two features share a key name.',
    howToFix: 'Delete the old key, or give the new format a new key prefix.',
    category: 'bug',
    explain: explainCommand((command) => ({
      detail: `${command}: the key holds another type.`,
      howToFix: 'Delete the old key or give the new format a new key prefix.',
    })),
  },
  {
    key: 'BUSY',
    dependency: 'redis',
    hint: 'Redis blocked by a Lua script',
    detail:
      'A long-running Lua script (BullMQ uses many) is blocking Redis. Commands fail until it ends.',
    howToFix: 'Check large queues, or SCRIPT KILL.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'NOSCRIPT',
    dependency: 'redis',
    hint: 'Redis Lua script missing',
    detail:
      'EVALSHA ran after Redis restarted or flushed its script cache. ioredis/BullMQ reload it.',
    howToFix: 'If it is frequent, check why Redis keeps restarting.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'NOTBUSY',
    dependency: 'redis',
    hint: 'No script to kill',
    detail: 'SCRIPT KILL ran while no script was running.',
    howToFix: 'Check that a script is running before calling SCRIPT KILL.',
  },
  {
    key: 'UNKILLABLE',
    dependency: 'redis',
    hint: 'Redis script cannot be killed',
    detail: 'The running script already wrote data, so SCRIPT KILL refuses.',
    howToFix: 'Only SHUTDOWN NOSAVE stops it.',
    category: 'dependency',
  },
  {
    key: 'EXECABORT',
    dependency: 'redis',
    hint: 'Redis transaction discarded',
    detail:
      'A command queued inside MULTI was invalid, so EXEC aborted the whole transaction.',
    howToFix: 'Read the earlier reply error.',
    category: 'bug',
  },
  {
    key: 'BUSYKEY',
    dependency: 'redis',
    hint: 'Redis key already exists',
    detail: 'RESTORE (or MIGRATE) targets a key that already exists.',
    howToFix: 'Use REPLACE or delete it first.',
    level: 'warn',
  },
  {
    key: 'NOGROUP',
    dependency: 'redis',
    hint: 'Redis stream group missing',
    detail:
      'XREADGROUP/XACK names a consumer group or stream that does not exist.',
    howToFix: 'Create it with XGROUP CREATE (MKSTREAM) at startup.',
    category: 'config',
  },
  {
    key: 'BUSYGROUP',
    dependency: 'redis',
    hint: 'Stream group already exists',
    detail: 'XGROUP CREATE ran for a group that exists.',
    howToFix: 'Safe to ignore at startup; catch it.',
    level: 'warn',
  },
  {
    key: 'UNBLOCKED',
    dependency: 'redis',
    hint: 'Blocking command unblocked',
    detail:
      'A blocking command (BLPOP, XREAD BLOCK) was interrupted by CLIENT UNBLOCK or a failover.',
    howToFix: 'Retry the command.',
    retryable: true,
  },
  {
    key: 'MOVED',
    dependency: 'redis',
    hint: 'Redis slot moved',
    detail:
      'The key hash slot lives on another cluster node. A standalone client is talking to a cluster.',
    howToFix: 'Use the cluster client.',
    category: 'config',
  },
  {
    key: 'ASK',
    dependency: 'redis',
    hint: 'Redis slot migrating',
    detail:
      'The slot is being migrated; the cluster client follows the ASK redirect. Seeing it here means a non-cluster client is in use.',
    howToFix: 'Use the cluster client.',
    category: 'config',
  },
  {
    key: 'TRYAGAIN',
    dependency: 'redis',
    hint: 'Redis slot being resharded',
    detail: 'A multi-key command hit a slot in migration.',
    howToFix: 'Retry shortly; it clears when resharding finishes.',
    retryable: true,
  },
  {
    key: 'CLUSTERDOWN',
    dependency: 'redis',
    hint: 'Redis cluster is down',
    detail:
      'Some hash slots have no serving node (a master and its replicas are down). The cluster refuses commands until coverage is back.',
    howToFix: 'Check the cluster nodes, and retry once all slots are covered.',
    retryable: true,
  },
  {
    key: 'CROSSSLOT',
    dependency: 'redis',
    hint: 'Keys on different slots',
    detail:
      'A multi-key command (MGET, Lua, MULTI) used keys from different hash slots.',
    howToFix: 'Use hash tags {…} so related keys share a slot.',
    category: 'bug',
  },
  {
    key: 'NOPROTO',
    dependency: 'redis',
    hint: 'RESP version unsupported',
    detail: 'HELLO asked for a protocol version this Redis does not support.',
    howToFix: 'Use RESP2.',
    category: 'config',
  },
  {
    key: 'DENIED',
    dependency: 'redis',
    hint: 'Redis protected mode',
    detail:
      'Redis is in protected mode and refuses non-loopback clients without a password.',
    howToFix: 'Set a password or bind address on the server.',
    category: 'config',
  },
  {
    key: 'ERR',
    dependency: 'redis',
    hint: 'Redis rejected the command',
    detail:
      'Redis answered a generic ERR (see target): wrong arguments, an unknown command, a bad TTL, or a Lua script failure.',
    howToFix: 'Check the command and arguments named in the target.',
    category: 'bug',
    explain: explainGenericErr,
  },
  {
    key: 'REDIS_MAX_CLIENTS',
    dependency: 'redis',
    messageMatch: /max number of clients reached/,
    hint: 'Redis connection limit reached',
    detail: 'Redis refused a new connection: too many clients.',
    howToFix:
      'Look for code that creates a Redis client per request or job instead of sharing one.',
    category: 'bug',
  },
]
