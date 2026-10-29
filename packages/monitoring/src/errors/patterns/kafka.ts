import type { ErrorPattern } from './types'

// Sources:
// - https://kafka.apache.org/44/design/protocol/ (protocol error codes)
// - https://github.com/tulios/kafkajs/blob/master/src/errors.js (KafkaJS* errors; other files under src/ raise them)
// - https://kafka.js.org/docs/getting-started (client behaviour)

/** KafkaJSError / KafkaJSConnectionError: the message says what happened. */
function explainKafkaMessage({ message }: { message: string }) {
  const cases: { match: RegExp; detail: string; howToFix?: string }[] = [
    {
      match: /^The producer is disconnected/,
      detail: 'producer.send ran before connect() or after disconnect().',
      howToFix: 'Connect once at startup and keep the producer.',
    },
    {
      match: /^Not connected/,
      detail:
        'A request ran on a broker connection that is not open. The connection dropped; kafkajs reconnects on the next request.',
    },
    {
      match: /^Connection timeout/,
      detail:
        'The TCP connection to the broker did not open within connectionTimeout. Broker down, wrong port, or a network policy.',
    },
    {
      match: /^Connection closed by the server/,
      detail:
        'The broker closed the connection during SASL authentication: often rejected credentials, or SASL/TLS settings that do not match the listener.',
    },
    {
      match: /^Connection error: /,
      detail: 'The socket to the broker failed (see the reason).',
      howToFix: 'Check the broker list in env and the network.',
    },
    {
      match: /^Failed to connect: brokers (array is empty|should not be null)/,
      detail:
        'The brokers list is empty: the KAFKA brokers env var is missing or not split.',
    },
    {
      match: /^Failed to connect/,
      detail: 'kafkajs could not reach any broker.',
      howToFix: 'Check the broker list, TLS/SASL settings and the network.',
    },
    {
      match: /^Closed connection/,
      detail:
        'The connection closed while a request was in flight. kafkajs retries; frequent cases point at broker restarts.',
    },
    {
      match: /^Producing to topic without metadata|^Topic metadata not loaded/,
      detail:
        'The topic metadata was not fetched yet (first send, or a topic created moments ago). kafkajs retries after refreshing metadata.',
    },
    {
      match: /^Could not find the leader for the partition/,
      detail:
        'No leader for the partition: a broker is down or an election is in progress. Retries normally succeed.',
    },
    {
      match: /^No brokers in the broker pool/,
      detail:
        'The broker pool is empty: cluster metadata was never loaded or the client was disconnected.',
      howToFix:
        'Connect the client before use and check that the cluster is up.',
    },
    {
      match: /^Failed to find group coordinator/,
      detail:
        'The group coordinator broker is unavailable. The cluster is rebalancing or a broker is down.',
    },
    {
      match: /^Cannot subscribe to topic while consumer is running/,
      detail: 'consumer.subscribe was called after consumer.run.',
      howToFix: 'Subscribe to all topics before run().',
    },
    {
      match: /^Consumer groupId must be a non-empty string/,
      detail:
        'The consumer groupId is empty: the env var for the group id is missing.',
    },
    {
      match: /^Invalid topic/,
      detail:
        'The topic name is empty or invalid: the env var for the topic is missing.',
    },
    {
      match: /^Crash: /,
      detail:
        'The consumer crashed. kafkajs restarts it only for retriable errors and when retry.restartOnFailure allows it.',
      howToFix: 'See the inner error.',
    },
  ]
  for (const { match, detail, howToFix } of cases) {
    if (match.test(message)) {
      return { target: message.slice(0, 60), detail, howToFix }
    }
  }
  return undefined
}

// kafkajs error classes and Kafka protocol error types (kafka Errors.java).
export const kafkaPatterns: ErrorPattern[] = [
  // --- kafkajs client errors ---
  {
    key: 'KafkaJSConnectionError',
    dependency: 'kafka',
    hint: 'Kafka broker unreachable',
    detail:
      'Could not connect to a Kafka broker. Brokers may be restarting, or the broker list in {env} is wrong.',
    howToFix:
      'Check that the brokers are up and that the broker list in {env} is correct.',
    retryable: true,
    explain: explainKafkaMessage,
  },
  {
    key: 'KafkaJSConnectionClosedError',
    dependency: 'kafka',
    hint: 'Kafka connection closed',
    detail:
      'The broker connection closed while a request was in flight (broker restart, idle timeout). kafkajs reconnects and retries.',
    howToFix:
      'No action needed if rare; check for broker restarts if it repeats.',
    retryable: true,
  },
  {
    key: 'KafkaJSRequestTimeoutError',
    dependency: 'kafka',
    hint: 'Kafka request timed out',
    detail:
      'A broker did not answer in time. The cluster may be overloaded or rebalancing.',
    howToFix:
      'Check broker load and rebalances; raise requestTimeout if the cluster is slow.',
    retryable: true,
  },
  {
    key: 'KafkaJSNumberOfRetriesExceeded',
    dependency: 'kafka',
    hint: 'Kafka retries exhausted',
    detail: 'kafkajs retried until its limit.',
    howToFix:
      'Look at the cause for the underlying error, usually a connection problem.',
    retryable: true,
  },
  {
    key: 'KafkaJSNonRetriableError',
    dependency: 'kafka',
    hint: 'Kafka rejected the request',
    detail:
      'kafkajs raised an error it will not retry: usually an invalid argument or config, e.g. an idempotent producer sending with acks other than -1.',
    howToFix:
      'Read error.message and fix the argument or client config it names.',
    explain: explainKafkaMessage,
  },
  {
    key: 'KafkaJSError',
    dependency: 'kafka',
    hint: 'Kafka client error',
    detail:
      'A generic kafkajs error: often producer.send ran before connect() or after disconnect().',
    howToFix:
      'Read error.message for the case; connect the producer once at startup.',
    explain: explainKafkaMessage,
  },
  {
    key: 'KafkaJSProtocolError',
    dependency: 'kafka',
    hint: 'Kafka protocol error',
    detail:
      'The broker answered with a Kafka protocol error code; error.type holds its name.',
    howToFix: 'Look up error.type in the Kafka protocol error codes.',
  },
  {
    key: 'KafkaJSSASLAuthenticationError',
    dependency: 'kafka',
    hint: 'Kafka SASL auth failed',
    detail: 'The broker rejected the SASL username/password or mechanism.',
    howToFix:
      'Check {env} and that the mechanism (PLAIN, SCRAM) matches the broker.',
    category: 'config',
  },
  {
    key: 'KafkaJSBrokerNotFound',
    dependency: 'kafka',
    hint: 'Kafka broker not found',
    detail:
      'The broker or partition leader is missing from cached metadata: a broker left the cluster or an election is in progress. Retries refresh metadata.',
    howToFix:
      'No action needed if transient; check broker health if it persists.',
    retryable: true,
    explain: explainKafkaMessage,
  },
  {
    key: 'KafkaJSNoBrokerAvailableError',
    dependency: 'kafka',
    hint: 'No Kafka broker available',
    detail:
      'The consumer had no brokers in its cluster metadata when starting its fetchers. The cluster is down, or {env} points to the wrong addresses.',
    howToFix:
      'Check that the cluster is up and that {env} lists the right broker addresses.',
    retryable: true,
  },
  {
    key: 'KafkaJSMetadataNotLoaded',
    dependency: 'kafka',
    hint: 'Kafka metadata not loaded',
    detail:
      'A send ran before topic metadata was fetched (first message after connect, or a brand-new topic). kafkajs refreshes and retries.',
    howToFix:
      'No action needed if transient; check that the topic exists if it repeats.',
    retryable: true,
  },
  {
    key: 'KafkaJSTopicMetadataNotLoaded',
    dependency: 'kafka',
    hint: 'Kafka topic metadata missing',
    detail:
      'Metadata for the topic is not loaded yet. Usually transient; if constant, the topic does not exist and auto-create is off.',
    howToFix: 'Create the topic if it does not exist, or check its name.',
    retryable: true,
  },
  {
    key: 'KafkaJSStaleTopicMetadataAssignment',
    dependency: 'kafka',
    hint: 'Kafka partitions changed',
    detail:
      'The topic partition count changed while the consumer ran. kafkajs re-joins the group with fresh metadata.',
    howToFix: 'No action needed.',
    retryable: true,
  },
  {
    key: 'KafkaJSGroupCoordinatorNotFound',
    dependency: 'kafka',
    hint: 'Kafka coordinator not found',
    detail:
      'The consumer group coordinator could not be located. The __consumer_offsets topic is unavailable or brokers are restarting.',
    howToFix:
      'Retry; check broker health and the __consumer_offsets topic if it persists.',
    retryable: true,
  },
  {
    key: 'KafkaJSMemberIdRequired',
    dependency: 'kafka',
    hint: 'Kafka group join retry',
    detail:
      'The broker assigned a member id and asked the consumer to re-join (KIP-394). Normal on first join; kafkajs handles it.',
    howToFix: 'No action needed.',
    retryable: true,
  },
  {
    key: 'KafkaJSTimeout',
    dependency: 'kafka',
    hint: 'Kafka operation timed out',
    detail:
      'A kafkajs admin wait timed out: createTopics with waitForLeaders saw no partition leaders within its timeout.',
    howToFix:
      'Check broker health; raise the createTopics timeout if leader election is slow.',
    retryable: true,
  },
  {
    key: 'KafkaJSLockTimeout',
    dependency: 'kafka',
    hint: 'Kafka internal lock timeout',
    detail:
      'kafkajs timed out waiting for an internal lock (broker connect or target-topic update): an earlier connect or metadata request is hung.',
    howToFix: 'Check broker reachability and load; the message names the lock.',
    retryable: true,
  },
  {
    key: 'KafkaJSPartialMessageError',
    dependency: 'kafka',
    hint: 'Kafka message too big to fetch',
    detail:
      'A fetch response ended in the middle of a message, so kafkajs could not decode it; a message larger than maxBytesPerPartition can stall the consumer.',
    howToFix:
      'Raise maxBytesPerPartition to at least the broker max message size, or shrink the messages.',
    category: 'config',
  },
  {
    key: 'KafkaJSServerDoesNotSupportApiKey',
    dependency: 'kafka',
    hint: 'Kafka broker too old',
    detail: 'The broker does not support an API this kafkajs version needs.',
    howToFix: 'Upgrade the broker or pin an older client.',
    category: 'config',
  },
  {
    key: 'KafkaJSInvariantViolation',
    dependency: 'kafka',
    hint: 'kafkajs internal bug',
    detail:
      'kafkajs hit an internal invariant (a duplicate request correlation id); kafkajs reports this as likely a bug.',
    howToFix: 'Report it with the message.',
    category: 'bug',
  },
  {
    key: 'KafkaJSCreateTopicError',
    dependency: 'kafka',
    hint: 'Kafka topic creation failed',
    detail:
      'admin.createTopics failed for a topic (see message): it exists, or partitions/replication are invalid for the cluster.',
    howToFix:
      'Check whether the topic exists and that partitions and replication fit the cluster.',
  },
  {
    key: 'KafkaJSDeleteTopicRecordsError',
    dependency: 'kafka',
    hint: 'Kafka delete records failed',
    detail: 'admin.deleteTopicRecords failed on at least one partition.',
    howToFix: 'Read error.partitions for the error of each partition.',
  },
  {
    key: 'KafkaJSDeleteGroupsError',
    dependency: 'kafka',
    hint: 'Kafka delete group failed',
    detail:
      'admin.deleteGroups failed for a group: it does not exist or is still active (NON_EMPTY_GROUP).',
    howToFix:
      'Check the group name, and stop its consumers before deleting it.',
  },
  {
    key: 'KafkaJSAggregateError',
    dependency: 'kafka',
    hint: 'Several Kafka errors',
    detail: 'Multiple operations failed.',
    howToFix: 'Read error.errors for each one.',
  },
  {
    key: 'KafkaJSFetcherRebalanceError',
    dependency: 'kafka',
    hint: 'Kafka rebalance during fetch',
    detail:
      'The set of brokers changed while fetching, so kafkajs stopped and recreated its fetchers. It is caught internally.',
    howToFix: 'No action needed.',
    retryable: true,
  },
  {
    key: 'KAFKA_PUBLISH_TIMEOUT',
    hint: 'Kafka publish timed out',
    detail:
      'The producer did not get an acknowledgement in time. The broker may be slow; the caller falls back or retries.',
    howToFix: 'Check broker load if it repeats.',
    retryable: true,
  },
  // --- broker protocol error types (KafkaJSProtocolError.type) ---
  {
    key: 'UNKNOWN_SERVER_ERROR',
    dependency: 'kafka',
    hint: 'Kafka broker internal error',
    detail: 'The broker hit an unexpected error processing the request.',
    howToFix: 'Check the broker logs; retry.',
    retryable: true,
  },
  {
    key: 'OFFSET_OUT_OF_RANGE',
    dependency: 'kafka',
    hint: 'Kafka offset no longer exists',
    detail:
      'The offset is outside the partition log, usually because retention deleted it while the group lagged. kafkajs resets to the default offset; the gap is skipped.',
    howToFix:
      'Check consumer lag; keep consumers within topic retention, or raise retention.',
    category: 'dependency',
  },
  {
    key: 'CORRUPT_MESSAGE',
    dependency: 'kafka',
    hint: 'Kafka message corrupted',
    detail:
      'A record failed its CRC, is too large, or has a null key on a compacted topic.',
    howToFix: 'Check the producer (key required for compacted topics).',
    category: 'bug',
  },
  {
    key: 'UNKNOWN_TOPIC_OR_PARTITION',
    dependency: 'kafka',
    hint: 'Kafka topic not found',
    detail:
      'The broker does not host this topic-partition: the topic does not exist (auto-creation off) or the client metadata is stale.',
    howToFix: 'Create the topic or check its name.',
    category: 'config',
  },
  {
    key: 'INVALID_FETCH_SIZE',
    dependency: 'kafka',
    hint: 'Kafka fetch size invalid',
    detail: 'The fetch request asked for an invalid fetch size.',
    howToFix: 'Check the consumer maxBytes and maxBytesPerPartition settings.',
    category: 'config',
  },
  {
    key: 'LEADER_NOT_AVAILABLE',
    dependency: 'kafka',
    hint: 'Kafka leader election',
    detail:
      'The partition has no leader right now (election in progress, or a topic just created). kafkajs retries.',
    howToFix:
      'No action needed if transient; check broker health if it persists.',
    retryable: true,
  },
  {
    key: 'NOT_LEADER_FOR_PARTITION',
    dependency: 'kafka',
    hint: 'Kafka leader moved',
    detail:
      'Partition leadership changed, usually during a broker restart. kafkajs refreshes metadata and retries.',
    howToFix:
      'No action needed if transient; check broker health if it persists.',
    retryable: true,
  },
  {
    key: 'NOT_LEADER_OR_FOLLOWER',
    dependency: 'kafka',
    hint: 'Kafka leader moved',
    detail:
      'The broker is no longer leader (or follower) for the partition after a restart or reassignment. kafkajs refreshes metadata and retries.',
    howToFix:
      'No action needed if transient; check broker health if it persists.',
    retryable: true,
  },
  {
    key: 'REQUEST_TIMED_OUT',
    dependency: 'kafka',
    hint: 'Kafka broker request timeout',
    detail:
      'The broker could not complete the request in time, e.g. replication to in-sync replicas was too slow.',
    howToFix: 'Retry; check broker load.',
    retryable: true,
  },
  {
    key: 'BROKER_NOT_AVAILABLE',
    dependency: 'kafka',
    hint: 'Kafka broker not available',
    detail: 'The broker is starting or shutting down.',
    howToFix: 'Retry.',
    retryable: true,
  },
  {
    key: 'REPLICA_NOT_AVAILABLE',
    dependency: 'kafka',
    hint: 'Kafka replica unavailable',
    detail:
      'A replica for the partition is offline. Usually transient during broker restarts.',
    howToFix: 'Retry; check the broker if it persists.',
    retryable: true,
  },
  {
    key: 'MESSAGE_TOO_LARGE',
    dependency: 'kafka',
    hint: 'Kafka message too large',
    detail: 'The message is bigger than the broker or topic max.message.bytes.',
    howToFix: 'Publish a reference (S3 key, id) instead of the whole payload.',
    category: 'bug',
  },
  {
    key: 'RECORD_LIST_TOO_LARGE',
    dependency: 'kafka',
    hint: 'Kafka batch too large',
    detail: 'The produce batch exceeds the broker segment size.',
    howToFix: 'Send fewer messages per batch.',
    category: 'bug',
  },
  {
    key: 'STALE_CONTROLLER_EPOCH',
    dependency: 'kafka',
    hint: 'Kafka controller moved',
    detail: 'The cluster controller changed broker.',
    howToFix: 'Retry.',
    retryable: true,
  },
  {
    key: 'OFFSET_METADATA_TOO_LARGE',
    dependency: 'kafka',
    hint: 'Kafka offset metadata too big',
    detail:
      'The metadata string attached to an offset commit exceeds the broker limit.',
    howToFix: 'Shorten the metadata string sent with the offset commit.',
    category: 'bug',
  },
  {
    key: 'NETWORK_EXCEPTION',
    dependency: 'kafka',
    hint: 'Kafka broker disconnected',
    detail: 'The broker disconnected before answering.',
    howToFix: 'Retry; check broker restarts.',
    retryable: true,
  },
  {
    key: 'COORDINATOR_LOAD_IN_PROGRESS',
    dependency: 'kafka',
    hint: 'Kafka coordinator loading',
    detail: 'The group coordinator is loading offsets after a broker change.',
    howToFix: 'Retry in a moment.',
    retryable: true,
  },
  {
    key: 'COORDINATOR_NOT_AVAILABLE',
    dependency: 'kafka',
    hint: 'Kafka coordinator unavailable',
    detail: 'The group coordinator broker is down or not yet elected.',
    howToFix: 'Retry.',
    retryable: true,
  },
  {
    key: 'NOT_COORDINATOR',
    dependency: 'kafka',
    hint: 'Kafka coordinator moved',
    detail:
      'The group coordinator moved to another broker. kafkajs rediscovers it and retries.',
    howToFix: 'No action needed if transient.',
    retryable: true,
  },
  {
    key: 'INVALID_TOPIC_EXCEPTION',
    dependency: 'kafka',
    hint: 'Kafka topic name invalid',
    detail:
      'The topic name is empty, too long, or has invalid characters (only [a-zA-Z0-9._-]).',
    howToFix: 'Check the topic env var.',
    category: 'config',
  },
  {
    key: 'NOT_ENOUGH_REPLICAS',
    dependency: 'kafka',
    hint: 'Kafka replicas not in sync',
    detail:
      'Fewer in-sync replicas than min.insync.replicas, so writes with acks=all are refused. A broker is down; writes resume when it catches up.',
    howToFix: 'Bring the down broker back, then retry.',
    retryable: true,
  },
  {
    key: 'NOT_ENOUGH_REPLICAS_AFTER_APPEND',
    dependency: 'kafka',
    hint: 'Kafka write under-replicated',
    detail:
      'The message was written to the leader but fewer replicas than required. Retrying may duplicate it.',
    howToFix: 'Enable idempotence on the producer.',
    retryable: true,
  },
  {
    key: 'INVALID_REQUIRED_ACKS',
    dependency: 'kafka',
    hint: 'Kafka acks value invalid',
    detail: 'The producer acks setting is not -1, 0 or 1.',
    howToFix: 'Fix the acks value in the producer config.',
    category: 'config',
  },
  {
    key: 'ILLEGAL_GENERATION',
    dependency: 'kafka',
    hint: 'Kafka consumer generation stale',
    detail:
      'The consumer committed with an old group generation: a rebalance happened while it was processing. kafkajs re-joins; the batch may be reprocessed.',
    howToFix:
      'Make the handler idempotent; shorten batch processing if rebalances are frequent.',
    retryable: true,
  },
  {
    key: 'INCONSISTENT_GROUP_PROTOCOL',
    dependency: 'kafka',
    hint: 'Kafka assigner mismatch',
    detail:
      "The member's protocols do not match the group's: different partition assigners, or another kind of client uses the same groupId.",
    howToFix:
      'Use the same assigners on every instance and a groupId unique to this consumer.',
    category: 'config',
  },
  {
    key: 'INVALID_GROUP_ID',
    dependency: 'kafka',
    hint: 'Kafka group id invalid',
    detail: 'The consumer groupId is empty or malformed.',
    howToFix: 'Check the env var.',
    category: 'config',
  },
  {
    key: 'UNKNOWN_MEMBER_ID',
    dependency: 'kafka',
    hint: 'Kafka consumer kicked out',
    detail:
      'The coordinator no longer knows this consumer: it missed heartbeats (sessionTimeout) because processing blocked too long. kafkajs re-joins.',
    howToFix: 'Shorten processing per batch or raise sessionTimeout.',
    retryable: true,
  },
  {
    key: 'INVALID_SESSION_TIMEOUT',
    dependency: 'kafka',
    hint: 'Kafka session timeout invalid',
    detail:
      'sessionTimeout is outside the broker group.min/max.session.timeout.ms range.',
    howToFix: 'Adjust the consumer config.',
    category: 'config',
  },
  {
    key: 'REBALANCE_IN_PROGRESS',
    dependency: 'kafka',
    hint: 'Kafka group rebalancing',
    detail:
      'The consumer group is rebalancing. Usually resolves by itself; if constant, a consumer is crashing or too slow.',
    howToFix:
      'If it is constant, check for consumers that crash or process too slowly.',
    retryable: true,
  },
  {
    key: 'INVALID_COMMIT_OFFSET_SIZE',
    dependency: 'kafka',
    hint: 'Kafka offset commit too big',
    detail: 'The offset commit payload is too large.',
    howToFix: 'Commit fewer partitions at once.',
    category: 'bug',
  },
  {
    key: 'TOPIC_AUTHORIZATION_FAILED',
    dependency: 'kafka',
    hint: 'Kafka topic access denied',
    detail: 'The Kafka user has no ACL for this topic (read/write).',
    howToFix:
      'Ask the Kafka admin to grant it, or check the credentials in {env}.',
    category: 'config',
  },
  {
    key: 'GROUP_AUTHORIZATION_FAILED',
    dependency: 'kafka',
    hint: 'Kafka group access denied',
    detail: 'The Kafka user has no ACL for this consumer group.',
    howToFix: 'Ask the Kafka admin to grant it.',
    category: 'config',
  },
  {
    key: 'CLUSTER_AUTHORIZATION_FAILED',
    dependency: 'kafka',
    hint: 'Kafka cluster access denied',
    detail:
      'The operation needs cluster-level ACL (idempotent producer, admin calls).',
    howToFix: 'Grant IdempotentWrite / Cluster ACL to the user.',
    category: 'config',
  },
  {
    key: 'INVALID_TIMESTAMP',
    dependency: 'kafka',
    hint: 'Kafka message timestamp invalid',
    detail: 'The message timestamp is outside the broker allowed range.',
    howToFix:
      'Check the clock on this host or the timestamp set on the message.',
    category: 'bug',
  },
  {
    key: 'UNSUPPORTED_SASL_MECHANISM',
    dependency: 'kafka',
    hint: 'Kafka SASL mechanism unsupported',
    detail:
      'The broker does not offer the SASL mechanism configured (PLAIN vs SCRAM-SHA-512).',
    howToFix: 'Match the mechanism the broker offers.',
    category: 'config',
  },
  {
    key: 'ILLEGAL_SASL_STATE',
    dependency: 'kafka',
    hint: 'Kafka SASL handshake broken',
    detail:
      'The SASL exchange is out of order: usually a plaintext client talking to a SASL listener, or vice versa.',
    howToFix: 'Match the client ssl/sasl settings to the broker listener.',
    category: 'config',
  },
  {
    key: 'SASL_AUTHENTICATION_FAILED',
    dependency: 'kafka',
    hint: 'Kafka login rejected',
    detail: 'The broker rejected the SASL credentials.',
    howToFix: 'Check the username/password in {env}.',
    category: 'config',
  },
  {
    key: 'UNSUPPORTED_VERSION',
    dependency: 'kafka',
    hint: 'Kafka API version unsupported',
    detail:
      'The broker does not support the API version the client sent. Broker and kafkajs versions are too far apart.',
    howToFix: 'Upgrade the broker or use a kafkajs version it supports.',
    category: 'config',
  },
  {
    key: 'TOPIC_ALREADY_EXISTS',
    dependency: 'kafka',
    hint: 'Kafka topic already exists',
    detail: 'createTopics ran for an existing topic.',
    howToFix: 'Safe to ignore at startup.',
    level: 'warn',
  },
  {
    key: 'INVALID_PARTITIONS',
    dependency: 'kafka',
    hint: 'Kafka partition count invalid',
    detail:
      'numPartitions is below 1, or below the current count when altering.',
    howToFix:
      'Set numPartitions to at least 1 and not below the current count.',
    category: 'config',
  },
  {
    key: 'INVALID_REPLICATION_FACTOR',
    dependency: 'kafka',
    hint: 'Kafka replication invalid',
    detail:
      'replicationFactor is below 1 or larger than the number of brokers (common on a single-broker dev cluster).',
    howToFix: 'Set replicationFactor between 1 and the number of brokers.',
    category: 'config',
  },
  {
    key: 'INVALID_REPLICA_ASSIGNMENT',
    dependency: 'kafka',
    hint: 'Kafka replica assignment bad',
    detail:
      'The explicit replica assignment names unknown brokers or duplicates.',
    howToFix: 'List only existing broker ids, each once, in the assignment.',
    category: 'config',
  },
  {
    key: 'INVALID_CONFIG',
    dependency: 'kafka',
    hint: 'Kafka topic config invalid',
    detail: 'A topic/broker config entry has an invalid name or value.',
    howToFix: 'Check the config entry name and value against the Kafka docs.',
    category: 'config',
  },
  {
    key: 'NOT_CONTROLLER',
    dependency: 'kafka',
    hint: 'Kafka controller moved',
    detail: 'An admin request went to a broker that is no longer controller.',
    howToFix: 'Retry.',
    retryable: true,
  },
  {
    key: 'INVALID_REQUEST',
    dependency: 'kafka',
    hint: 'Kafka request malformed',
    detail:
      'The broker could not parse the request: a client/broker version mismatch or a kafkajs bug.',
    howToFix: 'Check that the kafkajs and broker versions are compatible.',
    category: 'bug',
  },
  {
    key: 'UNSUPPORTED_FOR_MESSAGE_FORMAT',
    dependency: 'kafka',
    hint: 'Kafka message format too old',
    detail:
      'The topic message format version does not support this request (e.g. headers).',
    howToFix: 'Upgrade the topic format.',
    category: 'config',
  },
  {
    key: 'POLICY_VIOLATION',
    dependency: 'kafka',
    hint: 'Kafka policy rejected request',
    detail:
      'A broker-side create/alter policy rejected the request (naming, partitions, retention).',
    howToFix:
      'Change the request to meet the broker policy, or ask the Kafka admin.',
    category: 'config',
  },
  {
    key: 'OUT_OF_ORDER_SEQUENCE_NUMBER',
    dependency: 'kafka',
    hint: 'Kafka sequence out of order',
    detail:
      'The idempotent producer sent a sequence the broker did not expect: a previous batch was lost. kafkajs raises it as fatal.',
    howToFix: 'Recreate the producer.',
    category: 'dependency',
  },
  {
    key: 'DUPLICATE_SEQUENCE_NUMBER',
    dependency: 'kafka',
    hint: 'Kafka duplicate batch',
    detail:
      'The broker already has this batch (idempotent retry). Not an error; the message was written once.',
    howToFix: 'No action needed.',
    level: 'warn',
  },
  {
    key: 'INVALID_PRODUCER_EPOCH',
    dependency: 'kafka',
    hint: 'Kafka producer fenced',
    detail:
      'The producer used an old epoch: a newer producer with the same transactionalId took over, or the coordinator aborted a timed-out transaction.',
    howToFix:
      'Recreate the producer; if another instance owns the transactionalId, stop this one.',
    category: 'dependency',
  },
  {
    key: 'PRODUCER_FENCED',
    dependency: 'kafka',
    hint: 'Kafka producer fenced',
    detail:
      'Another producer with the same transactionalId started, fencing this one. Two instances share a transactional id.',
    howToFix: 'Give each instance its own transactionalId.',
    category: 'config',
  },
  {
    key: 'INVALID_TXN_STATE',
    dependency: 'kafka',
    hint: 'Kafka transaction state invalid',
    detail:
      'A transactional call ran in the wrong order (commit without begin, send after abort).',
    howToFix: 'Check the transaction flow.',
    category: 'bug',
  },
  {
    key: 'INVALID_PRODUCER_ID_MAPPING',
    dependency: 'kafka',
    hint: 'Kafka producer id expired',
    detail: 'The producer id no longer maps to the transactional id (expired).',
    howToFix: 'Recreate the producer.',
    category: 'dependency',
  },
  {
    key: 'INVALID_TRANSACTION_TIMEOUT',
    dependency: 'kafka',
    hint: 'Kafka txn timeout too large',
    detail: 'transactionTimeout exceeds the broker transaction.max.timeout.ms.',
    howToFix: 'Lower transactionTimeout.',
    category: 'config',
  },
  {
    key: 'CONCURRENT_TRANSACTIONS',
    dependency: 'kafka',
    hint: 'Kafka transaction still open',
    detail: 'The previous transaction for this id is still completing.',
    howToFix: 'Retry shortly.',
    retryable: true,
  },
  {
    key: 'TRANSACTION_COORDINATOR_FENCED',
    dependency: 'kafka',
    hint: 'Kafka txn coordinator moved',
    detail:
      'A transaction coordinator that is no longer current sent a transaction marker; a broker-to-broker error after the coordinator moved.',
    howToFix: 'Retry; check the broker logs if it repeats.',
    retryable: true,
  },
  {
    key: 'TRANSACTIONAL_ID_AUTHORIZATION_FAILED',
    dependency: 'kafka',
    hint: 'Kafka txn id access denied',
    detail: 'The user has no ACL for this transactional id.',
    howToFix: 'Grant TransactionalId ACL.',
    category: 'config',
  },
  {
    key: 'TRANSACTION_ABORTABLE',
    dependency: 'kafka',
    hint: 'Kafka transaction must abort',
    detail: 'The broker hit an error inside the transaction.',
    howToFix: 'Abort it and retry the whole unit of work.',
    retryable: true,
  },
  {
    key: 'KAFKA_STORAGE_ERROR',
    dependency: 'kafka',
    hint: 'Kafka broker disk error',
    detail:
      'The broker failed to read/write its log directory (disk full or failing).',
    howToFix: 'Alert the Kafka operators.',
    retryable: true,
  },
  {
    key: 'LOG_DIR_NOT_FOUND',
    dependency: 'kafka',
    hint: 'Kafka log dir missing',
    detail:
      'A broker log directory in the request does not exist. Broker configuration problem.',
    howToFix: 'Check the log directory against the broker log.dirs config.',
    category: 'config',
  },
  {
    key: 'UNKNOWN_PRODUCER_ID',
    dependency: 'kafka',
    hint: 'Kafka producer id unknown',
    detail:
      'The broker has no state for this producer id, e.g. retention deleted its records. kafkajs does not retry it; the send fails.',
    howToFix: 'Recreate the producer so it gets a new producer id.',
    retryable: true,
  },
  {
    key: 'REASSIGNMENT_IN_PROGRESS',
    dependency: 'kafka',
    hint: 'Kafka reassignment running',
    detail:
      'A partition reassignment is in progress; the admin operation must wait.',
    howToFix: 'Retry after the reassignment finishes.',
    retryable: true,
  },
  {
    key: 'NON_EMPTY_GROUP',
    dependency: 'kafka',
    hint: 'Kafka group still active',
    detail: 'deleteGroups / deleteOffsets needs an empty group.',
    howToFix: 'Stop the consumers first.',
    level: 'warn',
  },
  {
    key: 'GROUP_ID_NOT_FOUND',
    dependency: 'kafka',
    hint: 'Kafka group not found',
    detail:
      'The consumer group does not exist (never consumed, or offsets expired).',
    howToFix: 'Check the group id.',
    level: 'warn',
  },
  {
    key: 'GROUP_SUBSCRIBED_TO_TOPIC',
    dependency: 'kafka',
    hint: 'Kafka group subscribed',
    detail:
      'Offsets cannot be deleted while the group is subscribed to the topic.',
    howToFix: 'Stop the consumers first.',
    level: 'warn',
  },
  {
    key: 'FETCH_SESSION_ID_NOT_FOUND',
    dependency: 'kafka',
    hint: 'Kafka fetch session expired',
    detail:
      'The broker evicted the incremental fetch session. The client starts a new one; harmless.',
    howToFix: 'No action needed.',
    retryable: true,
  },
  {
    key: 'INVALID_FETCH_SESSION_EPOCH',
    dependency: 'kafka',
    hint: 'Kafka fetch session stale',
    detail:
      'The fetch session epoch is out of date. The client re-creates the session; harmless.',
    howToFix: 'No action needed.',
    retryable: true,
  },
  {
    key: 'LISTENER_NOT_FOUND',
    dependency: 'kafka',
    hint: 'Kafka listener mismatch',
    detail:
      'The leader broker has no listener matching the one the client connected to: advertised.listeners is misconfigured on the broker.',
    howToFix: 'Ask the Kafka admin to fix advertised.listeners on the brokers.',
    category: 'config',
  },
  {
    key: 'TOPIC_DELETION_DISABLED',
    dependency: 'kafka',
    hint: 'Kafka topic deletion disabled',
    detail: 'delete.topic.enable is false on the broker.',
    howToFix: 'Enable topic deletion on the broker, or skip the deletion.',
    category: 'config',
  },
  {
    key: 'FENCED_LEADER_EPOCH',
    dependency: 'kafka',
    hint: 'Kafka leader epoch stale',
    detail: 'The client used an old leader epoch after a leader change.',
    howToFix: 'No action needed; a metadata refresh fixes it.',
    retryable: true,
  },
  {
    key: 'UNKNOWN_LEADER_EPOCH',
    dependency: 'kafka',
    hint: 'Kafka leader epoch ahead',
    detail:
      'The client knows a newer leader epoch than this broker. The broker is catching up.',
    howToFix: 'Retry.',
    retryable: true,
  },
  {
    key: 'UNSUPPORTED_COMPRESSION_TYPE',
    dependency: 'kafka',
    hint: 'Kafka compression unsupported',
    detail:
      'The topic uses a compression codec this client lacks (zstd, snappy, lz4).',
    howToFix: 'Register the codec in kafkajs CompressionCodecs.',
    category: 'config',
  },
  {
    key: 'STALE_BROKER_EPOCH',
    dependency: 'kafka',
    hint: 'Kafka broker epoch stale',
    detail: 'Internal broker-to-controller error after a restart.',
    howToFix: 'Retry.',
    retryable: true,
  },
  {
    key: 'OFFSET_NOT_AVAILABLE',
    dependency: 'kafka',
    hint: 'Kafka offset not available',
    detail: 'The new leader high watermark is not caught up after an election.',
    howToFix: 'Retry shortly.',
    retryable: true,
  },
  {
    key: 'MEMBER_ID_REQUIRED',
    dependency: 'kafka',
    hint: 'Kafka group join retry',
    detail:
      'The broker assigned a member id and asks the consumer to re-join. Normal; kafkajs handles it.',
    howToFix: 'No action needed.',
    retryable: true,
  },
  {
    key: 'PREFERRED_LEADER_NOT_AVAILABLE',
    dependency: 'kafka',
    hint: 'Kafka preferred leader down',
    detail: 'The preferred replica cannot become leader right now.',
    howToFix: 'Retry.',
    retryable: true,
  },
  {
    key: 'GROUP_MAX_SIZE_REACHED',
    dependency: 'kafka',
    hint: 'Kafka group is full',
    detail:
      'The consumer group reached group.max.size. Too many consumer instances for this group.',
    howToFix:
      'Run fewer consumer instances in the group, or raise group.max.size.',
    category: 'config',
  },
  {
    key: 'FENCED_INSTANCE_ID',
    dependency: 'kafka',
    hint: 'Kafka static member replaced',
    detail:
      'Another consumer registered with the same group.instance.id. Two pods share a static member id.',
    howToFix: 'Give each pod its own group.instance.id.',
    category: 'config',
  },
  {
    key: 'ELIGIBLE_LEADERS_NOT_AVAILABLE',
    dependency: 'kafka',
    hint: 'Kafka no eligible leader',
    detail: 'No in-sync replica can become leader. Brokers are down.',
    howToFix: 'Bring the replica brokers back online, then retry.',
    retryable: true,
  },
  {
    key: 'INVALID_RECORD',
    dependency: 'kafka',
    hint: 'Kafka record rejected',
    detail:
      'The broker validation rejected a record: null key on a compacted topic, bad timestamp, or an invalid header.',
    howToFix: 'Check the producer.',
    category: 'bug',
  },
  {
    key: 'UNSTABLE_OFFSET_COMMIT',
    dependency: 'kafka',
    hint: 'Kafka offsets unstable',
    detail: 'A transactional offset commit is pending.',
    howToFix: 'Retry the fetch.',
    retryable: true,
  },
  {
    key: 'THROTTLING_QUOTA_EXCEEDED',
    dependency: 'kafka',
    hint: 'Kafka quota exceeded',
    detail:
      'Topic or partition create/delete requests exceeded the broker controller mutation quota (KIP-599).',
    howToFix:
      'Slow down topic and partition changes, or ask the Kafka admin to raise the quota.',
    retryable: true,
  },
  {
    key: 'RESOURCE_NOT_FOUND',
    dependency: 'kafka',
    hint: 'Kafka resource not found',
    detail:
      'An admin request referred to a resource (user, quota, config) that does not exist.',
    howToFix: 'Check the resource name in the admin request.',
    level: 'warn',
  },
  {
    key: 'DUPLICATE_RESOURCE',
    dependency: 'kafka',
    hint: 'Kafka duplicate resource',
    detail: 'An admin request named the same resource twice.',
    howToFix: 'Name each resource once per admin request.',
    category: 'bug',
  },
  {
    key: 'UNKNOWN_TOPIC_ID',
    dependency: 'kafka',
    hint: 'Kafka topic id unknown',
    detail:
      'The broker does not host this topic id: the topic was deleted or recreated, or the client metadata is stale.',
    howToFix: 'No action needed; a metadata refresh fixes it.',
    retryable: true,
  },
  {
    key: 'INCONSISTENT_TOPIC_ID',
    dependency: 'kafka',
    hint: 'Kafka topic id mismatch',
    detail:
      'The topic was recreated with the same name; the cached id is stale.',
    howToFix: 'No action needed; a metadata refresh fixes it.',
    retryable: true,
  },
  {
    key: 'INCONSISTENT_CLUSTER_ID',
    dependency: 'kafka',
    hint: 'Kafka cluster id mismatch',
    detail:
      'The broker belongs to another cluster than the one the client bootstrapped from.',
    howToFix: 'Check the broker list.',
    category: 'config',
  },
  {
    key: 'FENCED_MEMBER_EPOCH',
    dependency: 'kafka',
    hint: 'Kafka member epoch fenced',
    detail:
      'The consumer member epoch is fenced by the coordinator (KIP-848). It must drop its partitions and re-join.',
    howToFix: 'No action needed if transient.',
    retryable: true,
  },
  {
    key: 'STALE_MEMBER_EPOCH',
    dependency: 'kafka',
    hint: 'Kafka member epoch stale',
    detail:
      'The consumer used an old member epoch. It retries after the next heartbeat returns its current epoch.',
    howToFix: 'No action needed.',
    retryable: true,
  },
  {
    key: 'UNRELEASED_INSTANCE_ID',
    dependency: 'kafka',
    hint: 'Kafka instance id still used',
    detail:
      'The group.instance.id is still held by another member. The previous pod has not left yet.',
    howToFix: 'Retry after the previous pod leaves the group.',
    retryable: true,
  },
  {
    key: 'OFFSET_MOVED_TO_TIERED_STORAGE',
    dependency: 'kafka',
    hint: 'Kafka offset in tiered storage',
    detail:
      'The requested offset was moved to tiered (remote) storage and is no longer in the local log.',
    howToFix: 'Retry; if it repeats, check the broker tiered storage setup.',
    retryable: true,
  },
  {
    key: 'REBOOTSTRAP_REQUIRED',
    dependency: 'kafka',
    hint: 'Kafka client must re-bootstrap',
    detail: 'Client metadata is stale (all known brokers changed).',
    howToFix: 'Reconnect from the bootstrap list.',
    retryable: true,
  },
  {
    key: 'SECURITY_DISABLED',
    dependency: 'kafka',
    hint: 'Kafka security disabled',
    detail:
      'ACL operations were requested but the broker has no authorizer configured.',
    howToFix:
      'Configure an authorizer on the broker, or skip the ACL operations.',
    category: 'config',
  },
  {
    key: 'OPERATION_NOT_ATTEMPTED',
    dependency: 'kafka',
    hint: 'Kafka operation skipped',
    detail:
      'The broker skipped this operation because another one in the same batch failed.',
    howToFix: 'Retry it alone.',
    retryable: true,
  },
  {
    key: 'INVALID_PRINCIPAL_TYPE',
    dependency: 'kafka',
    hint: 'Kafka principal type invalid',
    detail: 'The ACL principal type is not supported.',
    howToFix: 'Use the User: principal type.',
    category: 'config',
  },
  {
    key: 'DELEGATION_TOKEN_EXPIRED',
    dependency: 'kafka',
    hint: 'Kafka token expired',
    detail: 'The delegation token used for auth has expired.',
    howToFix: 'Renew the token.',
    category: 'config',
  },
  {
    key: 'DELEGATION_TOKEN_NOT_FOUND',
    dependency: 'kafka',
    hint: 'Kafka token not found',
    detail: 'The delegation token is unknown to the broker.',
    howToFix: 'Create a new one.',
    category: 'config',
  },
  {
    key: 'DELEGATION_TOKEN_AUTH_DISABLED',
    dependency: 'kafka',
    hint: 'Kafka token auth disabled',
    detail: 'Delegation token auth is not enabled on the broker.',
    howToFix:
      'Enable delegation token auth on the broker, or use another auth method.',
    category: 'config',
  },
]
