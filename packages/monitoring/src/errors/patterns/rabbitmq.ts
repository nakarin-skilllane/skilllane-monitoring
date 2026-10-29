import type { ErrorPattern } from './types'

// Sources:
// - https://github.com/rabbitmq/amqp-0.9.1-spec/blob/main/docs/amqp-0-9-1-reference.md (AMQP 0-9-1 reply codes and method rules)
// - https://github.com/rabbitmq/rabbitmq-server/blob/main/deps/rabbit/src/rabbit_channel.erl (RabbitMQ channel reply texts)
// - https://github.com/rabbitmq/rabbitmq-server/tree/main/deps/rabbit/src (reader, queue and access-control reply texts)
// - https://github.com/amqp-node/amqplib/tree/main/lib (amqplib connection and channel messages)
// - https://www.rabbitmq.com/docs/channels (channel exceptions, channel_max, channel leaks)
// - https://www.rabbitmq.com/docs/confirms (when a publish is nacked)
// - https://www.rabbitmq.com/docs/maxlength (reject-publish overflow nacks)
// - https://nodejs.org/api/errors.html (Node.js socket error codes)
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
      detail: `The ${resource?.[1] ?? 'queue'} already exists with a different "${arg}".`,
      howToFix:
        'Delete and recreate it, or declare it with the existing arguments.',
    }
  }
  if (/^PRECONDITION_FAILED - unknown delivery tag/.test(text)) {
    return {
      target: 'delivery tag',
      detail:
        'ack/nack used a delivery tag that is not outstanding on this channel: acked twice, or acked on another channel.',
      howToFix: 'Ack once, on the consuming channel.',
    }
  }
  if (/^PRECONDITION_FAILED - .*not empty/.test(text)) {
    return {
      target,
      detail: 'deleteQueue with ifEmpty failed because messages remain.',
    }
  }
  if (/^NOT_FOUND - no (queue|exchange)/.test(text)) {
    return {
      target,
      howToFix: `Assert the ${resource?.[1] ?? 'resource'} before using it, or check the name and vhost.`,
    }
  }
  if (/^NOT_FOUND - home node/.test(text)) {
    return {
      target,
      detail: 'The node hosting this (non-mirrored) queue is down.',
      howToFix: 'Wait for the node, or use quorum queues.',
    }
  }
  if (/^ACCESS_REFUSED - .*exclusive/.test(text)) {
    return {
      target,
      detail:
        'Another consumer holds this queue with exclusive consume, or exclusive consume was requested while other consumers exist.',
      howToFix: 'Do not mix exclusive and regular consumers on one queue.',
    }
  }
  if (/^ACCESS_REFUSED - Login was refused/.test(text)) {
    return {
      target: 'login',
      detail: 'The username/password were rejected.',
      howToFix: 'Check the RabbitMQ credentials in env.',
    }
  }
  if (/^ACCESS_REFUSED - access to (queue|exchange|vhost)/.test(text)) {
    return {
      target,
      detail:
        'The user lacks configure/write/read permission on this resource.',
      howToFix: 'Grant the permission in RabbitMQ.',
    }
  }
  if (/^NOT_ALLOWED - access to vhost/.test(text)) {
    return {
      target,
      detail:
        'The user may not connect to this vhost: no permission, or a vhost or user connection limit is reached.',
      howToFix:
        'Check the vhost in the URL, the user permissions and the connection limits.',
    }
  }
  if (/^NOT_ALLOWED - vhost .* not found/.test(text)) {
    return {
      target,
      detail: 'The vhost in the URL does not exist.',
      howToFix: 'Check the RabbitMQ URL in env (URL-encode "/" as %2F).',
    }
  }
  if (/^RESOURCE_LOCKED/.test(text)) {
    return {
      target,
      detail: 'Another connection holds the exclusive queue.',
      howToFix: 'Wait for it to close, or stop sharing the queue.',
    }
  }
  if (/^CONNECTION_FORCED/.test(text)) {
    return {
      target: 'connection',
      detail:
        'The broker closed the connection on purpose (shutdown, admin action).',
      howToFix: 'Reconnect and re-register consumers.',
    }
  }
  if (/^INTERNAL_ERROR/.test(text)) {
    return {
      target,
      detail:
        'The broker hit an internal error (often a queue on a stopped node).',
      howToFix: 'Check the RabbitMQ logs.',
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
    detail:
      'Nothing is listening at {host}:{port}. RabbitMQ may be stopped or restarting, or {env} is wrong.',
    howToFix:
      'Check that RabbitMQ is running and that {env} points to the right host and port.',
    retryable: true,
  },
  {
    key: 'ENOTFOUND',
    dependency: 'rabbitmq',
    hint: '{Type} "{name}" host not found',
    detail: 'DNS could not resolve {host}.',
    howToFix: 'Check the RabbitMQ URL in {env}.',
    category: 'config',
  },
  {
    key: 'ECONNRESET',
    dependency: 'rabbitmq',
    hint: '{Type} "{name}" connection reset',
    detail:
      'RabbitMQ at {host}:{port} dropped the connection (restart, missed heartbeats, load balancer idle timeout). The client reconnects.',
    howToFix:
      'No action needed if rare; check broker restarts, heartbeats and the load balancer idle timeout if it repeats.',
    retryable: true,
  },
  {
    key: 'AMQP_311',
    dependency: 'rabbitmq',
    hint: 'Message too large',
    detail:
      'CONTENT_TOO_LARGE: the server could not accept content this large at present. RabbitMQ reports a message over max_message_size as 406 instead.',
    howToFix: 'Publish a reference instead of the whole payload.',
    category: 'bug',
  },
  {
    key: 'AMQP_312',
    dependency: 'rabbitmq',
    hint: 'Message not routable',
    detail: 'NO_ROUTE: a mandatory message matched no queue binding.',
    howToFix: 'Check the exchange, routing key and that the queue is bound.',
    category: 'config',
  },
  {
    key: 'AMQP_313',
    dependency: 'rabbitmq',
    hint: 'No consumers on queue',
    detail:
      'NO_CONSUMERS: a message published with the immediate flag found no ready consumer. RabbitMQ rejects the immediate flag with 540 instead.',
    howToFix: 'Start the consumer service, then retry.',
    retryable: true,
  },
  {
    key: 'AMQP_320',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ closed connection',
    detail:
      'CONNECTION_FORCED: the broker closed the connection (restart or admin action). The client reconnects.',
    howToFix: 'Register the consumers again after the reconnect.',
    retryable: true,
    explain: explainAmqpReply,
  },
  {
    key: 'AMQP_402',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ vhost unknown',
    detail: 'INVALID_PATH: the vhost in the URL does not exist.',
    howToFix: 'Check {env}.',
    category: 'config',
  },
  {
    key: 'AMQP_403',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ access refused',
    detail:
      'ACCESS_REFUSED: wrong login, or the user lacks permission on this vhost/queue/exchange, or the queue is in exclusive use by another consumer.',
    howToFix:
      'Check the credentials in {env} and the user permissions on the vhost.',
    category: 'config',
    explain: explainAmqpReply,
  },
  {
    key: 'AMQP_404',
    dependency: 'rabbitmq',
    hint: 'Queue or exchange missing',
    detail: 'NOT_FOUND: the queue or exchange does not exist.',
    howToFix: 'Check that the queue or exchange is asserted before use.',
    category: 'config',
    explain: explainAmqpReply,
  },
  {
    key: 'AMQP_405',
    dependency: 'rabbitmq',
    hint: 'Queue locked by another client',
    detail:
      'RESOURCE_LOCKED: an exclusive queue declared by another connection was used, or redeclared with another exclusive flag. Two instances share its name.',
    howToFix:
      'Give each instance its own exclusive queue name, or make the queue non-exclusive.',
    category: 'bug',
    explain: explainAmqpReply,
  },
  {
    key: 'AMQP_406',
    dependency: 'rabbitmq',
    hint: 'Queue arguments mismatch',
    detail:
      'PRECONDITION_FAILED: a queue or exchange was redeclared with other arguments (e.g. a changed DLX), an ack used an unknown delivery tag, or a message exceeded max_message_size.',
    howToFix:
      'Declare with the existing arguments (or delete and recreate it), and ack each delivery once on its own channel.',
    category: 'config',
    explain: explainAmqpReply,
  },
  {
    key: 'AMQP_501',
    dependency: 'rabbitmq',
    hint: 'AMQP frame error',
    detail:
      'FRAME_ERROR: a malformed frame was sent. A client library bug or a non-AMQP endpoint.',
    howToFix:
      'Check that the URL points to an AMQP port, and upgrade amqplib if it persists.',
    category: 'bug',
  },
  {
    key: 'AMQP_502',
    dependency: 'rabbitmq',
    hint: 'AMQP syntax error',
    detail:
      'SYNTAX_ERROR: a frame field had an illegal value. A client library bug.',
    howToFix:
      'Upgrade amqplib and check the arguments passed to the failing call.',
    category: 'bug',
  },
  {
    key: 'AMQP_503',
    dependency: 'rabbitmq',
    hint: 'AMQP command invalid',
    detail:
      'COMMAND_INVALID: the client sent a command the server considers invalid, e.g. an unknown auth mechanism or an unimplemented method.',
    howToFix:
      'Check the auth mechanism and the channel methods called, and upgrade amqplib if it persists.',
    category: 'bug',
  },
  {
    key: 'AMQP_504',
    dependency: 'rabbitmq',
    hint: 'AMQP channel error',
    detail:
      'CHANNEL_ERROR: a method was sent on a channel that is not open (closed after an earlier error, or a second channel.open).',
    howToFix: 'Recreate the channel.',
    category: 'bug',
  },
  {
    key: 'AMQP_505',
    dependency: 'rabbitmq',
    hint: 'AMQP unexpected frame',
    detail:
      'UNEXPECTED_FRAME: content frames arrived out of order. A client library bug or concurrent use of one channel.',
    howToFix:
      'Do not use one channel concurrently; upgrade amqplib if it persists.',
    category: 'bug',
  },
  {
    key: 'AMQP_506',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ out of resources',
    detail:
      'RESOURCE_ERROR: the broker lacked resources to complete the method, e.g. too many replies pending delivery to a slow client, or a stream unavailable.',
    howToFix:
      'Check the RabbitMQ logs for the exhausted resource, and consume replies faster on this connection.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'AMQP_530',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ operation not allowed',
    detail:
      'NOT_ALLOWED: the vhost does not exist or the user may not access it, a connection/channel/consumer limit was reached, or a consumer tag was reused.',
    howToFix:
      'Check the vhost in {env}, the user permissions and the broker limits.',
    category: 'config',
    explain: explainAmqpReply,
  },
  {
    key: 'AMQP_540',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ feature unsupported',
    detail:
      'NOT_IMPLEMENTED: the broker does not implement the requested feature (e.g. immediate flag).',
    howToFix: 'Remove the unsupported option from the call.',
    category: 'bug',
  },
  {
    key: 'AMQP_541',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ internal error',
    detail:
      'INTERNAL_ERROR: the broker failed internally, often a queue whose node is down.',
    howToFix: 'Check the RabbitMQ logs and cluster state.',
    category: 'dependency',
    retryable: true,
    explain: explainAmqpReply,
  },
  {
    key: 'RABBITMQ_HANDSHAKE_REFUSED',
    messageMatch: /^Handshake terminated by server/,
    hint: 'RabbitMQ login refused',
    detail:
      'The broker closed the connection during handshake: wrong credentials, unknown vhost, or the user lacks vhost access.',
    howToFix: 'Check the URL in env.',
    category: 'config',
    explain: explainAmqpReply,
  },
  {
    key: 'RABBITMQ_HANDSHAKE_SOCKET_CLOSED',
    messageMatch: /^Socket closed abruptly during opening handshake/,
    hint: 'RabbitMQ rejected connection',
    detail:
      'The socket closed before the AMQP handshake finished: TLS expected (amqps) but amqp used, a non-AMQP port, or the broker is starting.',
    howToFix:
      'Check the URL scheme (amqp or amqps) and port, and retry if the broker is starting.',
    category: 'config',
    retryable: true,
  },
  {
    key: 'RABBITMQ_HEARTBEAT_TIMEOUT',
    messageMatch: /^Heartbeat timeout/,
    hint: 'RabbitMQ heartbeat missed',
    detail:
      'No heartbeat from the broker within the interval: network partition, broker paused, or the event loop blocked so long heartbeats were not sent. The client reconnects.',
    howToFix:
      'Check the network and broker health, and keep the event loop from blocking.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'RABBITMQ_UNEXPECTED_CLOSE',
    messageMatch: /^Unexpected close$/,
    hint: 'RabbitMQ connection dropped',
    detail:
      'The TCP connection closed without an AMQP close: broker restart, load balancer idle timeout, or network loss. The client reconnects.',
    howToFix:
      'No action needed if rare; check broker restarts, the load balancer idle timeout and the network if it repeats.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'RABBITMQ_CHANNEL_ENDED',
    messageMatch: /^Channel ended, no reply will be forthcoming/,
    hint: 'RabbitMQ channel closed',
    detail:
      'An RPC (assertQueue, bindQueue, etc.) was awaiting its reply when the channel closed, usually after a 404/406 error on the same channel.',
    howToFix: 'Recreate the channel.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'RABBITMQ_CHANNEL_CLOSED',
    messageMatch: /^(channel closed|Channel closed)$/,
    hint: 'RabbitMQ channel closed',
    detail:
      'The channel closed with publishes still unconfirmed, or an operation ran on a closed channel. Channels close after any channel error.',
    howToFix: 'Recreate the channel instead of reusing it.',
    category: 'bug',
  },
  {
    key: 'IllegalOperationError',
    hint: 'RabbitMQ channel closed',
    detail:
      'amqplib refused an operation on a closed channel or connection. Channels close after any error.',
    howToFix: 'Recreate the channel.',
    category: 'bug',
  },
  {
    key: 'RABBITMQ_MESSAGE_NACKED',
    messageMatch: /^message nacked$/,
    hint: 'RabbitMQ rejected message',
    detail:
      'A publish confirm came back as nack: the queue is full with overflow reject-publish, or the queue process hit an internal error.',
    howToFix:
      'Check the queue length limit and overflow policy, then retry the publish.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'RABBITMQ_CHANNEL_LIMIT',
    messageMatch: /^No channels left to allocate/,
    hint: 'RabbitMQ channel limit',
    detail:
      'The connection ran out of channel numbers: channels are created per request/job and never closed.',
    howToFix: 'Share one channel per purpose.',
    category: 'bug',
  },
  {
    key: 'RABBITMQ_FRAME_SIZE',
    messageMatch: /^Frame size exceeds frame max/,
    hint: 'AMQP frame too large',
    detail:
      'A frame exceeded the negotiated frame max. Usually a corrupted stream or non-AMQP data.',
    howToFix:
      'Check that the URL points to an AMQP port and that frameMax matches the broker.',
    category: 'bug',
  },
  {
    key: 'RABBITMQ_SASL_MECHANISM',
    messageMatch: /^SASL mechanism .* is not provided by the server/,
    hint: 'RabbitMQ auth mechanism',
    detail:
      'The broker does not offer the SASL mechanism the client wants (PLAIN/AMQPLAIN/EXTERNAL).',
    howToFix: 'Check the broker auth config.',
    category: 'config',
  },
  {
    key: 'RABBITMQ_RECONNECT_EXHAUSTED',
    dependency: 'rabbitmq',
    hint: 'RabbitMQ reconnect gave up',
    detail:
      'Reconnect attempts reached their limit. Messages are not consumed until the process restarts.',
    howToFix:
      'Restart the process once RabbitMQ is reachable, and check why the reconnects failed.',
  },
]
