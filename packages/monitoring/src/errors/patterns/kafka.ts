import type { ErrorPattern } from './types'

/** KafkaJSError / KafkaJSConnectionError: the message says what happened. */
function explainKafkaMessage({ message }: { message: string }) {
  const cases: [RegExp, string][] = [
    [
      /^The producer is disconnected/,
      'producer.send ran before connect() or after disconnect(). Connect once at startup and keep the producer.',
    ],
    [
      /^Not connected/,
      'A request ran on a broker connection that is not open. The connection dropped; kafkajs reconnects on the next request.',
    ],
    [
      /^Connection timeout/,
      'The TCP connection to the broker did not open within connectionTimeout. Broker down, wrong port, or a network policy.',
    ],
    [
      /^Connection closed by the server/,
      'The broker closed the connection: idle timeout, broker restart, or an SASL/TLS mismatch (plaintext client on a TLS listener).',
    ],
    [
      /^Connection error: /,
      'The socket to the broker failed (see the reason). Check the broker list in env and the network.',
    ],
    [
      /^Failed to connect: brokers (array is empty|should not be null)/,
      'The brokers list is empty: the KAFKA brokers env var is missing or not split.',
    ],
    [
      /^Failed to connect/,
      'kafkajs could not reach any broker. Check the broker list, TLS/SASL settings and the network.',
    ],
    [
      /^Closed connection/,
      'The connection closed while a request was in flight. kafkajs retries; frequent cases point at broker restarts.',
    ],
    [
      /^Producing to topic without metadata|^Topic metadata not loaded/,
      'The topic metadata was not fetched yet (first send, or a topic created moments ago). kafkajs retries after refreshing metadata.',
    ],
    [
      /^Could not find the leader for the partition/,
      'No leader for the partition: a broker is down or an election is in progress. Retries normally succeed.',
    ],
    [
      /^No brokers in the broker pool/,
      'The broker pool is empty: every bootstrap broker failed. Check the broker addresses and whether the cluster is up.',
    ],
    [
      /^Failed to find group coordinator/,
      'The group coordinator broker is unavailable. The cluster is rebalancing or a broker is down.',
    ],
    [
      /^Cannot subscribe to topic while consumer is running/,
      'consumer.subscribe was called after consumer.run. Subscribe to all topics before run().',
    ],
    [
      /^Consumer groupId must be a non-empty string/,
      'The consumer groupId is empty: the env var for the group id is missing.',
    ],
    [
      /^Invalid topic/,
      'The topic name is empty or invalid: the env var for the topic is missing.',
    ],
    [
      /^Crash: /,
      'The consumer crashed and will restart (retry.restartOnFailure). See the inner error.',
    ],
  ]
  for (const [match, fix] of cases) {
    if (match.test(message)) return { target: message.slice(0, 60), fix }
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
    hintDetail:
      'Could not connect to a Kafka broker. Brokers may be restarting, or the broker list in {env} is wrong.',
    retryable: true,
    explain: explainKafkaMessage,
  },
  {
    key: 'KafkaJSConnectionClosedError',
    dependency: 'kafka',
    hint: 'Kafka connection closed',
    hintDetail:
      'The broker connection closed while a request was in flight (broker restart, idle timeout). kafkajs reconnects and retries.',
    retryable: true,
  },
  {
    key: 'KafkaJSRequestTimeoutError',
    dependency: 'kafka',
    hint: 'Kafka request timed out',
    hintDetail:
      'A broker did not answer in time. The cluster may be overloaded or rebalancing.',
    retryable: true,
  },
  {
    key: 'KafkaJSNumberOfRetriesExceeded',
    dependency: 'kafka',
    hint: 'Kafka retries exhausted',
    hintDetail:
      'kafkajs retried until its limit. Look at the cause for the underlying error, usually a connection problem.',
    retryable: true,
  },
  {
    key: 'KafkaJSNonRetriableError',
    dependency: 'kafka',
    hint: 'Kafka rejected the request',
    hintDetail:
      'The broker returned an error that retry will not fix, e.g. an idempotent producer without acks=-1. Check producer config.',
    explain: explainKafkaMessage,
  },
  {
    key: 'KafkaJSError',
    dependency: 'kafka',
    hint: 'Kafka client error',
    hintDetail:
      'A generic kafkajs error (see fix): often a producer used before connect, or metadata not loaded yet.',
    explain: explainKafkaMessage,
  },
  {
    key: 'KafkaJSProtocolError',
    dependency: 'kafka',
    hint: 'Kafka protocol error',
    hintDetail:
      'The broker answered with an error code kafkajs did not map. Read error.message for the type.',
  },
  {
    key: 'KafkaJSSASLAuthenticationError',
    dependency: 'kafka',
    hint: 'Kafka SASL auth failed',
    hintDetail:
      'The broker rejected the SASL username/password or mechanism. Check {env} and that the mechanism (PLAIN, SCRAM) matches the broker.',
    category: 'config',
  },
  {
    key: 'KafkaJSBrokerNotFound',
    dependency: 'kafka',
    hint: 'Kafka broker not found',
    hintDetail:
      'The broker or partition leader is missing from cached metadata: a broker left the cluster or an election is in progress. Retries refresh metadata.',
    retryable: true,
    explain: explainKafkaMessage,
  },
  {
    key: 'KafkaJSNoBrokerAvailableError',
    dependency: 'kafka',
    hint: 'No Kafka broker available',
    hintDetail:
      'Every broker in the list is unreachable. The cluster is down, or {env} points to the wrong addresses.',
    retryable: true,
  },
  {
    key: 'KafkaJSMetadataNotLoaded',
    dependency: 'kafka',
    hint: 'Kafka metadata not loaded',
    hintDetail:
      'A send ran before topic metadata was fetched (first message after connect, or a brand-new topic). kafkajs refreshes and retries.',
    retryable: true,
  },
  {
    key: 'KafkaJSTopicMetadataNotLoaded',
    dependency: 'kafka',
    hint: 'Kafka topic metadata missing',
    hintDetail:
      'Metadata for the topic is not loaded yet. Usually transient; if constant, the topic does not exist and auto-create is off.',
    retryable: true,
  },
  {
    key: 'KafkaJSStaleTopicMetadataAssignment',
    dependency: 'kafka',
    hint: 'Kafka partitions changed',
    hintDetail:
      'The topic partition count changed while the consumer ran. kafkajs re-joins the group with fresh metadata.',
    retryable: true,
  },
  {
    key: 'KafkaJSGroupCoordinatorNotFound',
    dependency: 'kafka',
    hint: 'Kafka coordinator not found',
    hintDetail:
      'The consumer group coordinator could not be located. The __consumer_offsets topic is unavailable or brokers are restarting.',
    retryable: true,
  },
  {
    key: 'KafkaJSMemberIdRequired',
    dependency: 'kafka',
    hint: 'Kafka group join retry',
    hintDetail:
      'The broker assigned a member id and asked the consumer to re-join (KIP-394). Normal on first join; kafkajs handles it.',
    retryable: true,
  },
  {
    key: 'KafkaJSTimeout',
    dependency: 'kafka',
    hint: 'Kafka operation timed out',
    hintDetail:
      'A kafkajs operation (consumer stop, transaction) exceeded its timeout. A broker or the processing loop is stuck.',
    retryable: true,
  },
  {
    key: 'KafkaJSLockTimeout',
    dependency: 'kafka',
    hint: 'Kafka internal lock timeout',
    hintDetail:
      'kafkajs waited too long for its connection lock: a request is hung on a broker. Usually the broker is overloaded.',
    retryable: true,
  },
  {
    key: 'KafkaJSPartialMessageError',
    dependency: 'kafka',
    hint: 'Kafka message too big to fetch',
    hintDetail:
      'A message is larger than the consumer maxBytesPerPartition, so the fetch returns a partial record. Raise maxBytes or shrink the messages.',
    category: 'config',
  },
  {
    key: 'KafkaJSServerDoesNotSupportApiKey',
    dependency: 'kafka',
    hint: 'Kafka broker too old',
    hintDetail:
      'The broker does not support an API this kafkajs version needs. Upgrade the broker or pin an older client.',
    category: 'config',
  },
  {
    key: 'KafkaJSInvariantViolation',
    dependency: 'kafka',
    hint: 'kafkajs internal bug',
    hintDetail:
      'kafkajs hit an internal invariant (e.g. duplicate correlation id). Report with the message; usually follows a connection reuse bug.',
    category: 'bug',
  },
  {
    key: 'KafkaJSCreateTopicError',
    dependency: 'kafka',
    hint: 'Kafka topic creation failed',
    hintDetail:
      'admin.createTopics failed for a topic (see message): it exists, or partitions/replication are invalid for the cluster.',
  },
  {
    key: 'KafkaJSDeleteTopicRecordsError',
    dependency: 'kafka',
    hint: 'Kafka delete records failed',
    hintDetail:
      'admin.deleteTopicRecords failed on at least one partition. See the inner errors.',
  },
  {
    key: 'KafkaJSDeleteGroupsError',
    dependency: 'kafka',
    hint: 'Kafka delete group failed',
    hintDetail:
      'admin.deleteGroups failed for a group: it does not exist or is still active (NON_EMPTY_GROUP).',
  },
  {
    key: 'KafkaJSAggregateError',
    dependency: 'kafka',
    hint: 'Several Kafka errors',
    hintDetail: 'Multiple operations failed; read error.errors for each one.',
  },
  {
    key: 'KafkaJSFetcherRebalanceError',
    dependency: 'kafka',
    hint: 'Kafka rebalance during fetch',
    hintDetail:
      'A rebalance interrupted the fetch loop. kafkajs re-joins; messages are not lost.',
    retryable: true,
  },
  {
    key: 'KAFKA_PUBLISH_TIMEOUT',
    hint: 'Kafka publish timed out',
    hintDetail:
      'The producer did not get an acknowledgement in time. The broker may be slow; the caller falls back or retries.',
    retryable: true,
  },
  // --- broker protocol error types (KafkaJSProtocolError.type) ---
  {
    key: 'UNKNOWN_SERVER_ERROR',
    dependency: 'kafka',
    hint: 'Kafka broker internal error',
    hintDetail:
      'The broker hit an unexpected error processing the request. Check the broker logs; retry.',
    retryable: true,
  },
  {
    key: 'OFFSET_OUT_OF_RANGE',
    dependency: 'kafka',
    hint: 'Kafka offset no longer exists',
    hintDetail:
      'The consumer group was behind longer than topic retention, so its offset was deleted. Messages in that gap were lost.',
    category: 'dependency',
  },
  {
    key: 'CORRUPT_MESSAGE',
    dependency: 'kafka',
    hint: 'Kafka message corrupted',
    hintDetail:
      'A record failed its CRC, is too large, or has a null key on a compacted topic. Check the producer (key required for compacted topics).',
    category: 'bug',
  },
  {
    key: 'UNKNOWN_TOPIC_OR_PARTITION',
    dependency: 'kafka',
    hint: 'Kafka topic not found',
    hintDetail:
      'The topic does not exist and auto-creation is off. Create the topic or check its name.',
    category: 'config',
  },
  {
    key: 'INVALID_FETCH_SIZE',
    dependency: 'kafka',
    hint: 'Kafka fetch size invalid',
    hintDetail: 'The consumer maxBytes value is invalid (zero or negative).',
    category: 'config',
  },
  {
    key: 'LEADER_NOT_AVAILABLE',
    dependency: 'kafka',
    hint: 'Kafka leader election',
    hintDetail:
      'The partition has no leader right now (election in progress, or a topic just created). kafkajs retries.',
    retryable: true,
  },
  {
    key: 'NOT_LEADER_FOR_PARTITION',
    dependency: 'kafka',
    hint: 'Kafka leader moved',
    hintDetail:
      'Partition leadership changed, usually during a broker restart. kafkajs refreshes metadata and retries.',
    retryable: true,
  },
  {
    key: 'NOT_LEADER_OR_FOLLOWER',
    dependency: 'kafka',
    hint: 'Kafka leader moved',
    hintDetail:
      'The broker is no longer leader (or follower) for the partition after a restart or reassignment. kafkajs refreshes metadata and retries.',
    retryable: true,
  },
  {
    key: 'REQUEST_TIMED_OUT',
    dependency: 'kafka',
    hint: 'Kafka broker request timeout',
    hintDetail:
      'The broker could not complete the request in time (replication to in-sync replicas too slow). Retry; check broker load.',
    retryable: true,
  },
  {
    key: 'BROKER_NOT_AVAILABLE',
    dependency: 'kafka',
    hint: 'Kafka broker not available',
    hintDetail: 'The broker is starting or shutting down. Retry.',
    retryable: true,
  },
  {
    key: 'REPLICA_NOT_AVAILABLE',
    dependency: 'kafka',
    hint: 'Kafka replica unavailable',
    hintDetail:
      'A replica for the partition is offline. Usually transient during broker restarts.',
    retryable: true,
  },
  {
    key: 'MESSAGE_TOO_LARGE',
    dependency: 'kafka',
    hint: 'Kafka message too large',
    hintDetail:
      'The message is bigger than the broker or topic max.message.bytes. Publish a reference (S3 key, id) instead of the whole payload.',
    category: 'bug',
  },
  {
    key: 'RECORD_LIST_TOO_LARGE',
    dependency: 'kafka',
    hint: 'Kafka batch too large',
    hintDetail:
      'The produce batch exceeds the broker segment size. Send fewer messages per batch.',
    category: 'bug',
  },
  {
    key: 'STALE_CONTROLLER_EPOCH',
    dependency: 'kafka',
    hint: 'Kafka controller moved',
    hintDetail: 'The cluster controller changed broker. Retry.',
    retryable: true,
  },
  {
    key: 'OFFSET_METADATA_TOO_LARGE',
    dependency: 'kafka',
    hint: 'Kafka offset metadata too big',
    hintDetail:
      'The metadata string attached to an offset commit exceeds the broker limit.',
    category: 'bug',
  },
  {
    key: 'NETWORK_EXCEPTION',
    dependency: 'kafka',
    hint: 'Kafka broker disconnected',
    hintDetail:
      'The broker disconnected before answering. Retry; check broker restarts.',
    retryable: true,
  },
  {
    key: 'COORDINATOR_LOAD_IN_PROGRESS',
    dependency: 'kafka',
    hint: 'Kafka coordinator loading',
    hintDetail:
      'The group coordinator is loading offsets after a broker change. Retry in a moment.',
    retryable: true,
  },
  {
    key: 'COORDINATOR_NOT_AVAILABLE',
    dependency: 'kafka',
    hint: 'Kafka coordinator unavailable',
    hintDetail:
      'The group coordinator broker is down or not yet elected. Retry.',
    retryable: true,
  },
  {
    key: 'NOT_COORDINATOR',
    dependency: 'kafka',
    hint: 'Kafka coordinator moved',
    hintDetail:
      'The group coordinator moved to another broker. kafkajs rediscovers it and retries.',
    retryable: true,
  },
  {
    key: 'INVALID_TOPIC_EXCEPTION',
    dependency: 'kafka',
    hint: 'Kafka topic name invalid',
    hintDetail:
      'The topic name is empty, too long, or has invalid characters (only [a-zA-Z0-9._-]). Check the topic env var.',
    category: 'config',
  },
  {
    key: 'NOT_ENOUGH_REPLICAS',
    dependency: 'kafka',
    hint: 'Kafka replicas not in sync',
    hintDetail:
      'Fewer in-sync replicas than min.insync.replicas, so writes with acks=all are refused. A broker is down; writes resume when it catches up.',
    retryable: true,
  },
  {
    key: 'NOT_ENOUGH_REPLICAS_AFTER_APPEND',
    dependency: 'kafka',
    hint: 'Kafka write under-replicated',
    hintDetail:
      'The message was written to the leader but fewer replicas than required. Retrying may duplicate it; enable idempotence.',
    retryable: true,
  },
  {
    key: 'INVALID_REQUIRED_ACKS',
    dependency: 'kafka',
    hint: 'Kafka acks value invalid',
    hintDetail: 'The producer acks setting is not -1, 0 or 1.',
    category: 'config',
  },
  {
    key: 'ILLEGAL_GENERATION',
    dependency: 'kafka',
    hint: 'Kafka consumer generation stale',
    hintDetail:
      'The consumer committed with an old group generation: a rebalance happened while it was processing. kafkajs re-joins; the batch may be reprocessed.',
    retryable: true,
  },
  {
    key: 'INCONSISTENT_GROUP_PROTOCOL',
    dependency: 'kafka',
    hint: 'Kafka assigner mismatch',
    hintDetail:
      'Consumers in the group use different partition assigners. Deploy the same kafkajs config to every instance.',
    category: 'config',
  },
  {
    key: 'INVALID_GROUP_ID',
    dependency: 'kafka',
    hint: 'Kafka group id invalid',
    hintDetail:
      'The consumer groupId is empty or malformed. Check the env var.',
    category: 'config',
  },
  {
    key: 'UNKNOWN_MEMBER_ID',
    dependency: 'kafka',
    hint: 'Kafka consumer kicked out',
    hintDetail:
      'The coordinator no longer knows this consumer: it missed heartbeats (sessionTimeout) because processing blocked too long. kafkajs re-joins.',
    retryable: true,
  },
  {
    key: 'INVALID_SESSION_TIMEOUT',
    dependency: 'kafka',
    hint: 'Kafka session timeout invalid',
    hintDetail:
      'sessionTimeout is outside the broker group.min/max.session.timeout.ms range. Adjust the consumer config.',
    category: 'config',
  },
  {
    key: 'REBALANCE_IN_PROGRESS',
    dependency: 'kafka',
    hint: 'Kafka group rebalancing',
    hintDetail:
      'The consumer group is rebalancing. Usually resolves by itself; if constant, a consumer is crashing or too slow.',
    retryable: true,
  },
  {
    key: 'INVALID_COMMIT_OFFSET_SIZE',
    dependency: 'kafka',
    hint: 'Kafka offset commit too big',
    hintDetail:
      'The offset commit payload is too large. Commit fewer partitions at once.',
    category: 'bug',
  },
  {
    key: 'TOPIC_AUTHORIZATION_FAILED',
    dependency: 'kafka',
    hint: 'Kafka topic access denied',
    hintDetail:
      'The Kafka user has no ACL for this topic (read/write). Ask the Kafka admin to grant it, or check the credentials in {env}.',
    category: 'config',
  },
  {
    key: 'GROUP_AUTHORIZATION_FAILED',
    dependency: 'kafka',
    hint: 'Kafka group access denied',
    hintDetail:
      'The Kafka user has no ACL for this consumer group. Ask the Kafka admin to grant it.',
    category: 'config',
  },
  {
    key: 'CLUSTER_AUTHORIZATION_FAILED',
    dependency: 'kafka',
    hint: 'Kafka cluster access denied',
    hintDetail:
      'The operation needs cluster-level ACL (idempotent producer, admin calls). Grant IdempotentWrite / Cluster ACL to the user.',
    category: 'config',
  },
  {
    key: 'INVALID_TIMESTAMP',
    dependency: 'kafka',
    hint: 'Kafka message timestamp invalid',
    hintDetail:
      'The message timestamp is outside the broker allowed range. Check the clock on this host or the timestamp set on the message.',
    category: 'bug',
  },
  {
    key: 'UNSUPPORTED_SASL_MECHANISM',
    dependency: 'kafka',
    hint: 'Kafka SASL mechanism unsupported',
    hintDetail:
      'The broker does not offer the SASL mechanism configured (PLAIN vs SCRAM-SHA-512). Match the broker.',
    category: 'config',
  },
  {
    key: 'ILLEGAL_SASL_STATE',
    dependency: 'kafka',
    hint: 'Kafka SASL handshake broken',
    hintDetail:
      'The SASL exchange is out of order: usually a plaintext client talking to a SASL listener, or vice versa.',
    category: 'config',
  },
  {
    key: 'SASL_AUTHENTICATION_FAILED',
    dependency: 'kafka',
    hint: 'Kafka login rejected',
    hintDetail:
      'The broker rejected the SASL credentials. Check the username/password in {env}.',
    category: 'config',
  },
  {
    key: 'UNSUPPORTED_VERSION',
    dependency: 'kafka',
    hint: 'Kafka API version unsupported',
    hintDetail:
      'The broker does not support the API version the client sent. Broker and kafkajs versions are too far apart.',
    category: 'config',
  },
  {
    key: 'TOPIC_ALREADY_EXISTS',
    dependency: 'kafka',
    hint: 'Kafka topic already exists',
    hintDetail:
      'createTopics ran for an existing topic. Safe to ignore at startup.',
    level: 'warn',
  },
  {
    key: 'INVALID_PARTITIONS',
    dependency: 'kafka',
    hint: 'Kafka partition count invalid',
    hintDetail:
      'numPartitions is below 1, or below the current count when altering.',
    category: 'config',
  },
  {
    key: 'INVALID_REPLICATION_FACTOR',
    dependency: 'kafka',
    hint: 'Kafka replication invalid',
    hintDetail:
      'replicationFactor is below 1 or larger than the number of brokers (common on a single-broker dev cluster).',
    category: 'config',
  },
  {
    key: 'INVALID_REPLICA_ASSIGNMENT',
    dependency: 'kafka',
    hint: 'Kafka replica assignment bad',
    hintDetail:
      'The explicit replica assignment names unknown brokers or duplicates.',
    category: 'config',
  },
  {
    key: 'INVALID_CONFIG',
    dependency: 'kafka',
    hint: 'Kafka topic config invalid',
    hintDetail: 'A topic/broker config entry has an invalid name or value.',
    category: 'config',
  },
  {
    key: 'NOT_CONTROLLER',
    dependency: 'kafka',
    hint: 'Kafka controller moved',
    hintDetail:
      'An admin request went to a broker that is no longer controller. Retry.',
    retryable: true,
  },
  {
    key: 'INVALID_REQUEST',
    dependency: 'kafka',
    hint: 'Kafka request malformed',
    hintDetail:
      'The broker could not parse the request: a client/broker version mismatch or a kafkajs bug.',
    category: 'bug',
  },
  {
    key: 'UNSUPPORTED_FOR_MESSAGE_FORMAT',
    dependency: 'kafka',
    hint: 'Kafka message format too old',
    hintDetail:
      'The topic message format version does not support this request (e.g. headers). Upgrade the topic format.',
    category: 'config',
  },
  {
    key: 'POLICY_VIOLATION',
    dependency: 'kafka',
    hint: 'Kafka policy rejected request',
    hintDetail:
      'A broker-side create/alter policy rejected the request (naming, partitions, retention).',
    category: 'config',
  },
  {
    key: 'OUT_OF_ORDER_SEQUENCE_NUMBER',
    dependency: 'kafka',
    hint: 'Kafka sequence out of order',
    hintDetail:
      'The idempotent producer sent a sequence the broker did not expect: a previous batch was lost. kafkajs raises it as fatal; recreate the producer.',
    category: 'dependency',
  },
  {
    key: 'DUPLICATE_SEQUENCE_NUMBER',
    dependency: 'kafka',
    hint: 'Kafka duplicate batch',
    hintDetail:
      'The broker already has this batch (idempotent retry). Not an error; the message was written once.',
    level: 'warn',
  },
  {
    key: 'INVALID_PRODUCER_EPOCH',
    dependency: 'kafka',
    hint: 'Kafka producer fenced',
    hintDetail:
      'A newer producer with the same transactional id replaced this one (epoch bump). This instance must stop producing.',
    category: 'dependency',
  },
  {
    key: 'PRODUCER_FENCED',
    dependency: 'kafka',
    hint: 'Kafka producer fenced',
    hintDetail:
      'Another producer with the same transactionalId started, fencing this one. Two instances share a transactional id.',
    category: 'config',
  },
  {
    key: 'INVALID_TXN_STATE',
    dependency: 'kafka',
    hint: 'Kafka transaction state invalid',
    hintDetail:
      'A transactional call ran in the wrong order (commit without begin, send after abort). Check the transaction flow.',
    category: 'bug',
  },
  {
    key: 'INVALID_PRODUCER_ID_MAPPING',
    dependency: 'kafka',
    hint: 'Kafka producer id expired',
    hintDetail:
      'The producer id no longer maps to the transactional id (expired). Recreate the producer.',
    category: 'dependency',
  },
  {
    key: 'INVALID_TRANSACTION_TIMEOUT',
    dependency: 'kafka',
    hint: 'Kafka txn timeout too large',
    hintDetail:
      'transactionTimeout exceeds the broker transaction.max.timeout.ms. Lower it.',
    category: 'config',
  },
  {
    key: 'CONCURRENT_TRANSACTIONS',
    dependency: 'kafka',
    hint: 'Kafka transaction still open',
    hintDetail:
      'The previous transaction for this id is still completing. Retry shortly.',
    retryable: true,
  },
  {
    key: 'TRANSACTION_COORDINATOR_FENCED',
    dependency: 'kafka',
    hint: 'Kafka txn coordinator moved',
    hintDetail:
      'The transaction coordinator changed. Abort and restart the transaction.',
    retryable: true,
  },
  {
    key: 'TRANSACTIONAL_ID_AUTHORIZATION_FAILED',
    dependency: 'kafka',
    hint: 'Kafka txn id access denied',
    hintDetail:
      'The user has no ACL for this transactional id. Grant TransactionalId ACL.',
    category: 'config',
  },
  {
    key: 'TRANSACTION_ABORTABLE',
    dependency: 'kafka',
    hint: 'Kafka transaction must abort',
    hintDetail:
      'The broker hit an error inside the transaction. Abort it and retry the whole unit of work.',
    retryable: true,
  },
  {
    key: 'KAFKA_STORAGE_ERROR',
    dependency: 'kafka',
    hint: 'Kafka broker disk error',
    hintDetail:
      'The broker failed to read/write its log directory (disk full or failing). Alert the Kafka operators.',
    retryable: true,
  },
  {
    key: 'LOG_DIR_NOT_FOUND',
    dependency: 'kafka',
    hint: 'Kafka log dir missing',
    hintDetail:
      'A broker log directory in the request does not exist. Broker configuration problem.',
    category: 'config',
  },
  {
    key: 'UNKNOWN_PRODUCER_ID',
    dependency: 'kafka',
    hint: 'Kafka producer id unknown',
    hintDetail:
      'The broker expired the producer state (idle producer, retention). kafkajs re-initializes the producer id on the next send.',
    retryable: true,
  },
  {
    key: 'REASSIGNMENT_IN_PROGRESS',
    dependency: 'kafka',
    hint: 'Kafka reassignment running',
    hintDetail:
      'A partition reassignment is in progress; the admin operation must wait.',
    retryable: true,
  },
  {
    key: 'NON_EMPTY_GROUP',
    dependency: 'kafka',
    hint: 'Kafka group still active',
    hintDetail:
      'deleteGroups / deleteOffsets needs an empty group. Stop the consumers first.',
    level: 'warn',
  },
  {
    key: 'GROUP_ID_NOT_FOUND',
    dependency: 'kafka',
    hint: 'Kafka group not found',
    hintDetail:
      'The consumer group does not exist (never consumed, or offsets expired).',
    level: 'warn',
  },
  {
    key: 'GROUP_SUBSCRIBED_TO_TOPIC',
    dependency: 'kafka',
    hint: 'Kafka group subscribed',
    hintDetail:
      'Offsets cannot be deleted while the group is subscribed to the topic. Stop the consumers first.',
    level: 'warn',
  },
  {
    key: 'FETCH_SESSION_ID_NOT_FOUND',
    dependency: 'kafka',
    hint: 'Kafka fetch session expired',
    hintDetail:
      'The broker evicted the incremental fetch session. The client starts a new one; harmless.',
    retryable: true,
  },
  {
    key: 'INVALID_FETCH_SESSION_EPOCH',
    dependency: 'kafka',
    hint: 'Kafka fetch session stale',
    hintDetail:
      'The fetch session epoch is out of date. The client re-creates the session; harmless.',
    retryable: true,
  },
  {
    key: 'LISTENER_NOT_FOUND',
    dependency: 'kafka',
    hint: 'Kafka listener mismatch',
    hintDetail:
      'The leader broker has no listener matching the one the client connected to. advertised.listeners is misconfigured on the broker.',
    category: 'config',
  },
  {
    key: 'TOPIC_DELETION_DISABLED',
    dependency: 'kafka',
    hint: 'Kafka topic deletion disabled',
    hintDetail: 'delete.topic.enable is false on the broker.',
    category: 'config',
  },
  {
    key: 'FENCED_LEADER_EPOCH',
    dependency: 'kafka',
    hint: 'Kafka leader epoch stale',
    hintDetail:
      'The client used an old leader epoch after a leader change. Metadata refresh fixes it.',
    retryable: true,
  },
  {
    key: 'UNKNOWN_LEADER_EPOCH',
    dependency: 'kafka',
    hint: 'Kafka leader epoch ahead',
    hintDetail:
      'The client knows a newer leader epoch than this broker. The broker is catching up; retry.',
    retryable: true,
  },
  {
    key: 'UNSUPPORTED_COMPRESSION_TYPE',
    dependency: 'kafka',
    hint: 'Kafka compression unsupported',
    hintDetail:
      'The topic uses a compression codec this client lacks (zstd, snappy, lz4). Register the codec in kafkajs CompressionCodecs.',
    category: 'config',
  },
  {
    key: 'STALE_BROKER_EPOCH',
    dependency: 'kafka',
    hint: 'Kafka broker epoch stale',
    hintDetail: 'Internal broker-to-controller error after a restart. Retry.',
    retryable: true,
  },
  {
    key: 'OFFSET_NOT_AVAILABLE',
    dependency: 'kafka',
    hint: 'Kafka offset not available',
    hintDetail:
      'The new leader high watermark is not caught up after an election. Retry shortly.',
    retryable: true,
  },
  {
    key: 'MEMBER_ID_REQUIRED',
    dependency: 'kafka',
    hint: 'Kafka group join retry',
    hintDetail:
      'The broker assigned a member id and asks the consumer to re-join. Normal; kafkajs handles it.',
    retryable: true,
  },
  {
    key: 'PREFERRED_LEADER_NOT_AVAILABLE',
    dependency: 'kafka',
    hint: 'Kafka preferred leader down',
    hintDetail: 'The preferred replica cannot become leader right now. Retry.',
    retryable: true,
  },
  {
    key: 'GROUP_MAX_SIZE_REACHED',
    dependency: 'kafka',
    hint: 'Kafka group is full',
    hintDetail:
      'The consumer group reached group.max.size. Too many consumer instances for this group.',
    category: 'config',
  },
  {
    key: 'FENCED_INSTANCE_ID',
    dependency: 'kafka',
    hint: 'Kafka static member replaced',
    hintDetail:
      'Another consumer registered with the same group.instance.id. Two pods share a static member id.',
    category: 'config',
  },
  {
    key: 'ELIGIBLE_LEADERS_NOT_AVAILABLE',
    dependency: 'kafka',
    hint: 'Kafka no eligible leader',
    hintDetail:
      'No in-sync replica can become leader. Brokers are down; wait for recovery.',
    retryable: true,
  },
  {
    key: 'INVALID_RECORD',
    dependency: 'kafka',
    hint: 'Kafka record rejected',
    hintDetail:
      'The broker validation rejected a record: null key on a compacted topic, bad timestamp, or an invalid header. Check the producer.',
    category: 'bug',
  },
  {
    key: 'UNSTABLE_OFFSET_COMMIT',
    dependency: 'kafka',
    hint: 'Kafka offsets unstable',
    hintDetail: 'A transactional offset commit is pending. Retry the fetch.',
    retryable: true,
  },
  {
    key: 'THROTTLING_QUOTA_EXCEEDED',
    dependency: 'kafka',
    hint: 'Kafka quota exceeded',
    hintDetail:
      'The client exceeded its broker quota and was throttled. Reduce the rate or raise the quota.',
    retryable: true,
  },
  {
    key: 'RESOURCE_NOT_FOUND',
    dependency: 'kafka',
    hint: 'Kafka resource not found',
    hintDetail:
      'An admin request referred to a resource (user, quota, config) that does not exist.',
    level: 'warn',
  },
  {
    key: 'DUPLICATE_RESOURCE',
    dependency: 'kafka',
    hint: 'Kafka duplicate resource',
    hintDetail: 'An admin request named the same resource twice.',
    category: 'bug',
  },
  {
    key: 'UNKNOWN_TOPIC_ID',
    dependency: 'kafka',
    hint: 'Kafka topic id unknown',
    hintDetail:
      'The broker does not know this topic id: the topic was deleted and recreated. Metadata refresh fixes it.',
    retryable: true,
  },
  {
    key: 'INCONSISTENT_TOPIC_ID',
    dependency: 'kafka',
    hint: 'Kafka topic id mismatch',
    hintDetail:
      'The topic was recreated with the same name; the cached id is stale. Metadata refresh fixes it.',
    retryable: true,
  },
  {
    key: 'INCONSISTENT_CLUSTER_ID',
    dependency: 'kafka',
    hint: 'Kafka cluster id mismatch',
    hintDetail:
      'The broker belongs to another cluster than the one the client bootstrapped from. Check the broker list.',
    category: 'config',
  },
  {
    key: 'FENCED_MEMBER_EPOCH',
    dependency: 'kafka',
    hint: 'Kafka member epoch fenced',
    hintDetail:
      'The consumer member epoch is fenced by the coordinator (KIP-848). It must drop its partitions and re-join.',
    retryable: true,
  },
  {
    key: 'STALE_MEMBER_EPOCH',
    dependency: 'kafka',
    hint: 'Kafka member epoch stale',
    hintDetail:
      'The consumer used an old member epoch. It re-joins after the next heartbeat.',
    retryable: true,
  },
  {
    key: 'UNRELEASED_INSTANCE_ID',
    dependency: 'kafka',
    hint: 'Kafka instance id still used',
    hintDetail:
      'The group.instance.id is still held by another member. The previous pod has not left yet.',
    retryable: true,
  },
  {
    key: 'OFFSET_MOVED_TO_TIERED_STORAGE',
    dependency: 'kafka',
    hint: 'Kafka offset in tiered storage',
    hintDetail:
      'The requested offset is in remote storage. The broker fetches it; retry.',
    retryable: true,
  },
  {
    key: 'REBOOTSTRAP_REQUIRED',
    dependency: 'kafka',
    hint: 'Kafka client must re-bootstrap',
    hintDetail:
      'Client metadata is stale (all known brokers changed). Reconnect from the bootstrap list.',
    retryable: true,
  },
  {
    key: 'SECURITY_DISABLED',
    dependency: 'kafka',
    hint: 'Kafka security disabled',
    hintDetail:
      'ACL operations were requested but the broker has no authorizer configured.',
    category: 'config',
  },
  {
    key: 'OPERATION_NOT_ATTEMPTED',
    dependency: 'kafka',
    hint: 'Kafka operation skipped',
    hintDetail:
      'The broker skipped this operation because another one in the same batch failed. Retry it alone.',
    retryable: true,
  },
  {
    key: 'INVALID_PRINCIPAL_TYPE',
    dependency: 'kafka',
    hint: 'Kafka principal type invalid',
    hintDetail: 'The ACL principal type is not supported (use User:).',
    category: 'config',
  },
  {
    key: 'DELEGATION_TOKEN_EXPIRED',
    dependency: 'kafka',
    hint: 'Kafka token expired',
    hintDetail: 'The delegation token used for auth has expired. Renew it.',
    category: 'config',
  },
  {
    key: 'DELEGATION_TOKEN_NOT_FOUND',
    dependency: 'kafka',
    hint: 'Kafka token not found',
    hintDetail:
      'The delegation token is unknown to the broker. Create a new one.',
    category: 'config',
  },
  {
    key: 'DELEGATION_TOKEN_AUTH_DISABLED',
    dependency: 'kafka',
    hint: 'Kafka token auth disabled',
    hintDetail: 'Delegation token auth is not enabled on the broker.',
    category: 'config',
  },
]
