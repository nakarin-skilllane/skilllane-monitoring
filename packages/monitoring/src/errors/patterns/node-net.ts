import type { ErrorPattern } from './types'

// Node.js system error codes raised by sockets and DNS.
export const nodeNetPatterns: ErrorPattern[] = [
  {
    key: 'ECONNREFUSED',
    hint: 'Connection refused',
    hintDetail:
      'Nothing is listening at the address. The service may be stopped or restarting, or host/port in config is wrong.',
    retryable: true,
  },
  {
    key: 'ETIMEDOUT',
    hint: 'No response',
    hintDetail:
      'The other side did not answer in time. It may be overloaded, or the network/firewall is blocking.',
    retryable: true,
  },
  {
    key: 'ENOTFOUND',
    hint: 'Host not found',
    hintDetail:
      'DNS could not resolve the hostname. It may be misspelled in env, or the service is not deployed in this environment.',
  },
  {
    key: 'EAI_AGAIN',
    hint: 'DNS lookup failed',
    hintDetail:
      'The DNS server did not answer. Usually temporary; if it persists, check cluster DNS.',
    retryable: true,
  },
  {
    key: 'ECONNRESET',
    hint: 'Server closed connection',
    hintDetail:
      'The connection was cut unexpectedly (restart, idle timeout or overload). Usually temporary; if frequent, check the server logs.',
    retryable: true,
  },
  {
    key: 'ECONNABORTED',
    hint: 'Request timed out',
    hintDetail:
      'The client gave up waiting for a response (timeout option). The remote service may be slow or down.',
    retryable: true,
  },
  {
    key: 'EPIPE',
    hint: 'Connection already closed',
    hintDetail:
      'Wrote to a socket the other side had closed. Usually follows a server restart; the next attempt reconnects.',
    retryable: true,
  },
  {
    key: 'EPROTO',
    hint: 'TLS handshake failed',
    hintDetail:
      'The TLS negotiation failed. Check that the URL uses the right scheme (http vs https) and the certificate is valid.',
  },
  {
    key: 'EHOSTUNREACH',
    hint: 'Host unreachable',
    hintDetail:
      'No network route to the host. Check network policy, VPN or firewall rules.',
    retryable: true,
  },
  {
    key: 'ENOENT',
    hint: 'File not found',
    hintDetail:
      'A file or directory does not exist. A temp file may already be cleaned up, or the path is wrong.',
  },
]
