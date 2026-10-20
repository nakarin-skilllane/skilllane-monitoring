import type { ErrorPattern } from './types'

// amqplib close codes, surfaced by the adapter as AMQP_<code>.
export const rabbitmqPatterns: ErrorPattern[] = [
  {
    key: 'ECONNREFUSED',
    dependency: 'rabbitmq',
    hint: '{Type} "{name}" unreachable',
    hintDetail:
      'Nothing is listening at {host}:{port}. RabbitMQ may be stopped or restarting, or {env} is wrong.',
    retryable: true,
  },
  {
    key: 'AMQP_320',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ closed connection',
    hintDetail:
      'The broker closed the connection (restart or forced close). The client reconnects; consumers must be registered again.',
    retryable: true,
  },
  {
    key: 'AMQP_406',
    dependency: 'rabbitmq',
    hint: 'Queue arguments mismatch',
    hintDetail:
      'PRECONDITION_FAILED: a queue or exchange was declared with different arguments than the existing one (e.g. a changed DLX).',
  },
  {
    key: 'AMQP_404',
    dependency: 'rabbitmq',
    hint: 'Queue or exchange missing',
    hintDetail:
      'NOT_FOUND: the queue or exchange does not exist. Check that it is asserted before use.',
  },
  {
    key: 'AMQP_403',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ access refused',
    hintDetail:
      'The user lacks permission on this vhost or resource. Check {env}.',
  },
  {
    key: 'RABBITMQ_RECONNECT_EXHAUSTED',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ reconnect gave up',
    hintDetail:
      'Reconnect attempts reached their limit. Messages are not consumed until the process restarts.',
  },
]
