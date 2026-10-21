import type { ErrorPattern } from './types'

/** `NOT_FOUND - no queue 'x' in vhost '/'` → `queue 'x'`. */
const AMQP_RESOURCE = /(queue|exchange|vhost) '([^']+)'/

function explainAmqpReply({ message }: { message: string }) {
  const text =
    message.match(/\([A-Z-]+\) with message "([^"]+)"/)?.[1] ?? message
  const resource = text.match(AMQP_RESOURCE)
  const target = resource ? `${resource[1]} ${resource[2]}` : undefined
  if (/^PRECONDITION_FAILED - inequivalent arg/.test(text)) {
    const arg = text.match(/inequivalent arg '([^']+)'/)?.[1]
    return {
      target: target ?? arg,
      fix: `The ${resource?.[1] ?? 'queue'} already exists with a different "${arg}". Delete and recreate it, or declare it with the existing arguments.`,
    }
  }
  if (/^PRECONDITION_FAILED - unknown delivery tag/.test(text)) {
    return {
      target: 'delivery tag',
      fix: 'ack/nack used a delivery tag that is not outstanding on this channel: acked twice, or acked on another channel. Ack once, on the consuming channel.',
    }
  }
  if (/^PRECONDITION_FAILED - .*not empty/.test(text)) {
    return {
      target,
      fix: 'deleteQueue with ifEmpty failed because messages remain.',
    }
  }
  if (/^NOT_FOUND - no (queue|exchange)/.test(text)) {
    return {
      target,
      fix: `Assert the ${resource?.[1] ?? 'resource'} before using it, or check the name and vhost.`,
    }
  }
  if (/^NOT_FOUND - home node/.test(text)) {
    return {
      target,
      fix: 'The node hosting this (non-mirrored) queue is down. Wait for it, or use quorum queues.',
    }
  }
  if (/^ACCESS_REFUSED - .*exclusive/.test(text)) {
    return {
      target,
      fix: 'The queue is exclusive to another connection. Do not share exclusive queues between consumers.',
    }
  }
  if (/^ACCESS_REFUSED - Login was refused/.test(text)) {
    return {
      target: 'login',
      fix: 'The username/password were rejected. Check the RabbitMQ credentials in env.',
    }
  }
  if (/^ACCESS_REFUSED - access to (queue|exchange|vhost)/.test(text)) {
    return {
      target,
      fix: 'The user lacks configure/write/read permission on this resource. Grant it in RabbitMQ.',
    }
  }
  if (/^NOT_ALLOWED - access to vhost/.test(text)) {
    return {
      target,
      fix: 'The user has no permission on this vhost. Check the vhost in the URL and the user permissions.',
    }
  }
  if (/^NOT_ALLOWED - vhost .* not found/.test(text)) {
    return {
      target,
      fix: 'The vhost in the URL does not exist. Check the RabbitMQ URL in env (URL-encode "/" as %2F).',
    }
  }
  if (/^RESOURCE_LOCKED/.test(text)) {
    return {
      target,
      fix: 'Another connection holds the exclusive queue. Wait for it to close, or stop sharing the queue.',
    }
  }
  if (/^CONNECTION_FORCED/.test(text)) {
    return {
      target: 'connection',
      fix: 'The broker closed the connection on purpose (shutdown, admin action). Reconnect and re-register consumers.',
    }
  }
  if (/^INTERNAL_ERROR/.test(text)) {
    return {
      target,
      fix: 'The broker hit an internal error (often a queue on a stopped node). Check the RabbitMQ logs.',
    }
  }
  return target ? { target } : undefined
}

// amqplib: AMQP 0-9-1 reply codes (surfaced as AMQP_<code>) and its own
// connection/channel messages.
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
    key: 'ENOTFOUND',
    dependency: 'rabbitmq',
    hint: '{Type} "{name}" host not found',
    hintDetail:
      'DNS could not resolve {host}. Check the RabbitMQ URL in {env}.',
    category: 'config',
  },
  {
    key: 'ECONNRESET',
    dependency: 'rabbitmq',
    hint: '{Type} "{name}" connection reset',
    hintDetail:
      'RabbitMQ at {host}:{port} dropped the connection (restart, missed heartbeats, load balancer idle timeout). The client reconnects.',
    retryable: true,
  },
  {
    key: 'AMQP_311',
    dependency: 'rabbitmq',
    hint: 'Message too large',
    hintDetail:
      'CONTENT_TOO_LARGE: the message exceeds the broker max_message_size. Publish a reference instead of the whole payload.',
    category: 'bug',
  },
  {
    key: 'AMQP_312',
    dependency: 'rabbitmq',
    hint: 'Message not routable',
    hintDetail:
      'NO_ROUTE: a mandatory message matched no queue binding. Check the exchange, routing key and that the queue is bound.',
    category: 'config',
  },
  {
    key: 'AMQP_313',
    dependency: 'rabbitmq',
    hint: 'No consumers on queue',
    hintDetail:
      'NO_CONSUMERS: an immediate message found no consumer. The consumer service is down.',
    retryable: true,
  },
  {
    key: 'AMQP_320',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ closed connection',
    hintDetail:
      'CONNECTION_FORCED: the broker closed the connection (restart or admin action). The client reconnects; consumers must be registered again.',
    retryable: true,
    explain: explainAmqpReply,
  },
  {
    key: 'AMQP_402',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ vhost unknown',
    hintDetail:
      'INVALID_PATH: the vhost in the URL does not exist. Check {env}.',
    category: 'config',
  },
  {
    key: 'AMQP_403',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ access refused',
    hintDetail:
      'ACCESS_REFUSED: wrong login, or the user lacks permission on this vhost/queue/exchange, or the queue is exclusive to another connection. Check {env}.',
    category: 'config',
    explain: explainAmqpReply,
  },
  {
    key: 'AMQP_404',
    dependency: 'rabbitmq',
    hint: 'Queue or exchange missing',
    hintDetail:
      'NOT_FOUND: the queue or exchange does not exist. Check that it is asserted before use.',
    category: 'config',
    explain: explainAmqpReply,
  },
  {
    key: 'AMQP_405',
    dependency: 'rabbitmq',
    hint: 'Queue locked by another client',
    hintDetail:
      'RESOURCE_LOCKED: an exclusive queue is held by another connection. Two instances share an exclusive queue name.',
    category: 'bug',
    explain: explainAmqpReply,
  },
  {
    key: 'AMQP_406',
    dependency: 'rabbitmq',
    hint: 'Queue arguments mismatch',
    hintDetail:
      'PRECONDITION_FAILED: a queue or exchange was declared with different arguments than the existing one (e.g. a changed DLX), or an ack used an unknown delivery tag.',
    category: 'config',
    explain: explainAmqpReply,
  },
  {
    key: 'AMQP_501',
    dependency: 'rabbitmq',
    hint: 'AMQP frame error',
    hintDetail:
      'FRAME_ERROR: a malformed frame was sent. A client library bug or a non-AMQP endpoint.',
    category: 'bug',
  },
  {
    key: 'AMQP_502',
    dependency: 'rabbitmq',
    hint: 'AMQP syntax error',
    hintDetail:
      'SYNTAX_ERROR: a frame field had an illegal value. A client library bug.',
    category: 'bug',
  },
  {
    key: 'AMQP_503',
    dependency: 'rabbitmq',
    hint: 'AMQP command invalid',
    hintDetail:
      'COMMAND_INVALID: methods were sent in an invalid sequence, e.g. a second basic.consume with the same consumerTag.',
    category: 'bug',
  },
  {
    key: 'AMQP_504',
    dependency: 'rabbitmq',
    hint: 'AMQP channel error',
    hintDetail:
      'CHANNEL_ERROR: a method was sent on a channel that is not open (closed after an earlier error, or a second channel.open). Recreate the channel.',
    category: 'bug',
  },
  {
    key: 'AMQP_505',
    dependency: 'rabbitmq',
    hint: 'AMQP unexpected frame',
    hintDetail:
      'UNEXPECTED_FRAME: content frames arrived out of order. A client library bug or concurrent use of one channel.',
    category: 'bug',
  },
  {
    key: 'AMQP_506',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ out of resources',
    hintDetail:
      'RESOURCE_ERROR: the broker lacks resources (memory/disk alarm, too many channels). Check the broker alarms and channel leaks.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'AMQP_530',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ operation not allowed',
    hintDetail:
      'NOT_ALLOWED: the user may not access this vhost, or the operation is prohibited (e.g. deleting a queue in use). Check {env}.',
    category: 'config',
    explain: explainAmqpReply,
  },
  {
    key: 'AMQP_540',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ feature unsupported',
    hintDetail:
      'NOT_IMPLEMENTED: the broker does not implement the requested feature (e.g. immediate flag).',
    category: 'bug',
  },
  {
    key: 'AMQP_541',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ internal error',
    hintDetail:
      'INTERNAL_ERROR: the broker failed internally, often a queue whose node is down. Check the RabbitMQ logs and cluster state.',
    category: 'dependency',
    retryable: true,
    explain: explainAmqpReply,
  },
  {
    key: 'RABBITMQ_HANDSHAKE_REFUSED',
    messageMatch: /^Handshake terminated by server/,
    hint: 'RabbitMQ login refused',
    hintDetail:
      'The broker closed the connection during handshake: wrong credentials, unknown vhost, or the user lacks vhost access. Check the URL in env.',
    category: 'config',
    explain: explainAmqpReply,
  },
  {
    key: 'RABBITMQ_HANDSHAKE_SOCKET_CLOSED',
    messageMatch: /^Socket closed abruptly during opening handshake/,
    hint: 'RabbitMQ rejected connection',
    hintDetail:
      'The socket closed before the AMQP handshake finished: TLS expected (amqps) but amqp used, a non-AMQP port, or the broker is starting.',
    category: 'config',
    retryable: true,
  },
  {
    key: 'RABBITMQ_HEARTBEAT_TIMEOUT',
    messageMatch: /^Heartbeat timeout/,
    hint: 'RabbitMQ heartbeat missed',
    hintDetail:
      'No heartbeat from the broker within the interval: network partition, broker paused, or the event loop blocked so long heartbeats were not sent. The client reconnects.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'RABBITMQ_UNEXPECTED_CLOSE',
    messageMatch: /^Unexpected close$/,
    hint: 'RabbitMQ connection dropped',
    hintDetail:
      'The TCP connection closed without an AMQP close: broker restart, load balancer idle timeout, or network loss. The client reconnects.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'RABBITMQ_CHANNEL_ENDED',
    messageMatch: /^Channel ended, no reply will be forthcoming/,
    hint: 'RabbitMQ channel closed',
    hintDetail:
      'An RPC (assert, publish confirm) was pending when the channel closed, usually after a 404/406 error on the same channel. Recreate the channel.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'RABBITMQ_CHANNEL_CLOSED',
    messageMatch: /^(channel closed|Channel closed)$/,
    hint: 'RabbitMQ channel closed',
    hintDetail:
      'An operation ran on a closed channel. Channels close after any error; recreate the channel instead of reusing it.',
    category: 'bug',
  },
  {
    key: 'IllegalOperationError',
    hint: 'RabbitMQ channel closed',
    hintDetail:
      'amqplib refused an operation on a closed channel or connection. Channels close after any error; recreate the channel.',
    category: 'bug',
  },
  {
    key: 'RABBITMQ_MESSAGE_NACKED',
    messageMatch: /^message nacked$/,
    hint: 'RabbitMQ rejected message',
    hintDetail:
      'A publish confirm came back as nack: the broker could not persist the message (queue on a down node, memory alarm). Retry.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'RABBITMQ_CHANNEL_LIMIT',
    messageMatch: /^No channels left to allocate/,
    hint: 'RabbitMQ channel limit',
    hintDetail:
      'The connection ran out of channel numbers: channels are created per request/job and never closed. Share one channel per purpose.',
    category: 'bug',
  },
  {
    key: 'RABBITMQ_FRAME_SIZE',
    messageMatch: /^Frame size exceeds frame max/,
    hint: 'AMQP frame too large',
    hintDetail:
      'A frame exceeded the negotiated frame max. Usually a corrupted stream or non-AMQP data.',
    category: 'bug',
  },
  {
    key: 'RABBITMQ_SASL_MECHANISM',
    messageMatch: /^SASL mechanism .* is not provided by the server/,
    hint: 'RabbitMQ auth mechanism',
    hintDetail:
      'The broker does not offer the SASL mechanism the client wants (PLAIN/AMQPLAIN/EXTERNAL). Check the broker auth config.',
    category: 'config',
  },
  {
    key: 'RABBITMQ_RECONNECT_EXHAUSTED',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ reconnect gave up',
    hintDetail:
      'Reconnect attempts reached their limit. Messages are not consumed until the process restarts.',
  },
]
