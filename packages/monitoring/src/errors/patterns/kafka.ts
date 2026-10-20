import type { ErrorPattern } from './types'

// kafkajs error class names and protocol error types.
export const kafkaPatterns: ErrorPattern[] = [
  {
    key: 'KafkaJSConnectionError',
    dependency: 'kafka',
    hint: 'Kafka broker unreachable',
    hintDetail:
      'Could not connect to a Kafka broker. Brokers may be restarting, or the broker list in {env} is wrong.',
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
  },
  {
    key: 'UNKNOWN_TOPIC_OR_PARTITION',
    dependency: 'kafka',
    hint: 'Kafka topic not found',
    hintDetail:
      'The topic does not exist and auto-creation is off. Create the topic or check its name.',
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
    key: 'NOT_LEADER_FOR_PARTITION',
    dependency: 'kafka',
    hint: 'Kafka leader moved',
    hintDetail:
      'Partition leadership changed, usually during a broker restart. kafkajs refreshes metadata and retries.',
    retryable: true,
  },
  {
    key: 'KAFKA_PUBLISH_TIMEOUT',
    hint: 'Kafka publish timed out',
    hintDetail:
      'The producer did not get an acknowledgement in time. The broker may be slow; the caller falls back or retries.',
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
    key: 'MESSAGE_TOO_LARGE',
    dependency: 'kafka',
    hint: 'Kafka message too large',
    hintDetail:
      'The message is bigger than the broker or topic max.message.bytes. Publish a reference (S3 key, id) instead of the whole payload.',
    category: 'bug',
  },
]
