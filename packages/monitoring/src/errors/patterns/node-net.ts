import type { ErrorPattern } from './types'

// Sources:
// - https://nodejs.org/api/errors.html (Common system errors, ERR_SOCKET_*, ERR_SERVER_*)
// - https://man7.org/linux/man-pages/man3/errno.3.html (POSIX/Linux errno names)
// - https://man7.org/linux/man-pages/man3/getaddrinfo.3.html (EAI_* DNS resolver errors)
// - https://github.com/axios/axios/blob/v1.x/lib/adapters/http.js (ECONNABORTED on a client timeout)
// - https://github.com/request/request/blob/master/request.js (ESOCKETTIMEDOUT)

// Node.js system error codes raised by sockets, DNS and the file system
// (nodejs.org/api/errors.html, "Common system errors").
export const nodeNetPatterns: ErrorPattern[] = [
  {
    key: 'ECONNREFUSED',
    hint: 'Connection refused',
    detail:
      'Nothing is listening at the address. The service may be stopped or restarting, or host/port in config is wrong.',
    howToFix: 'Check the service is running, and the host and port in config.',
    retryable: true,
  },
  {
    key: 'ETIMEDOUT',
    hint: 'No response',
    detail:
      'The other side did not answer in time. It may be overloaded, or the network/firewall is blocking.',
    howToFix:
      'Retry later; if it persists, check the remote load and the firewall rules.',
    retryable: true,
  },
  {
    key: 'ESOCKETTIMEDOUT',
    hint: 'Socket timed out',
    detail:
      'The socket stayed idle longer than its timeout while waiting for data. The remote service is slow or hung.',
    howToFix:
      'Retry later; if it persists, check the remote service health or the socket timeout.',
    retryable: true,
  },
  {
    key: 'ENOTFOUND',
    hint: 'Host not found',
    detail:
      'DNS could not resolve the hostname. It may be misspelled in env, or the service is not deployed in this environment.',
    howToFix:
      'Check the hostname in env, and that the service is deployed in this environment.',
  },
  {
    key: 'EAI_AGAIN',
    hint: 'DNS lookup failed',
    detail: 'The DNS server did not answer. Usually temporary.',
    howToFix: 'Retry; if it persists, check cluster DNS.',
    retryable: true,
  },
  {
    key: 'EAI_NODATA',
    hint: 'Host has no address',
    detail: 'DNS knows the name but has no A/AAAA record for it.',
    howToFix: 'Check the hostname and the DNS zone.',
  },
  {
    key: 'EAI_NONAME',
    hint: 'Host name unknown',
    detail:
      'DNS has no entry for this name; an empty or malformed host gives the same error.',
    howToFix: 'Check the hostname in env.',
  },
  {
    key: 'EAI_FAIL',
    hint: 'DNS resolver failed',
    detail: 'The resolver returned a permanent failure for this name.',
    howToFix: 'Check cluster DNS and the search domains.',
  },
  {
    key: 'ECONNRESET',
    hint: 'Server closed connection',
    detail:
      'The connection was cut unexpectedly (restart, idle timeout or overload). Usually temporary.',
    howToFix: 'Retry; if frequent, check the server logs.',
    retryable: true,
  },
  {
    key: 'ECONNABORTED',
    hint: 'Request timed out',
    detail:
      'The client gave up waiting for a response (timeout option). The remote service may be slow or down.',
    howToFix:
      'Retry later; if it persists, check the remote service or the timeout option.',
    retryable: true,
  },
  {
    key: 'EPIPE',
    hint: 'Connection already closed',
    detail:
      'Wrote to a socket the other side had closed. Usually follows a server restart.',
    howToFix: 'Retry; the next attempt reconnects.',
    retryable: true,
  },
  {
    key: 'EPROTO',
    hint: 'TLS handshake failed',
    detail: 'The TLS negotiation failed.',
    howToFix:
      'Check that the URL uses the right scheme (http vs https) and the certificate is valid.',
  },
  {
    key: 'EHOSTUNREACH',
    hint: 'Host unreachable',
    detail: 'No network route to the host.',
    howToFix: 'Check network policy, VPN or firewall rules.',
    retryable: true,
  },
  {
    key: 'ENETUNREACH',
    hint: 'Network unreachable',
    detail: 'No route to the destination network.',
    howToFix: 'Check the pod network, egress rules or VPN.',
    retryable: true,
  },
  {
    key: 'ENETDOWN',
    hint: 'Network is down',
    detail:
      'The local network interface is down. Usually clears when the interface comes back.',
    howToFix: 'Check the node network.',
    retryable: true,
  },
  {
    key: 'EHOSTDOWN',
    hint: 'Host is down',
    detail:
      'The remote host did not respond to ARP/ICMP. The machine or pod is off.',
    howToFix: 'Retry once the host is back.',
    retryable: true,
  },
  {
    key: 'EADDRINUSE',
    hint: 'Port already in use',
    detail:
      'Another process already listens on this port. A previous instance is still running, or two apps share the port.',
    howToFix: 'Stop the previous instance, or give each app its own port.',
    category: 'config',
  },
  {
    key: 'EADDRNOTAVAIL',
    hint: 'Address not available',
    detail:
      'The local address to bind is not on this machine, or all ephemeral ports are in use (connection churn).',
    howToFix: 'Check the bind host and keep-alive.',
    category: 'config',
  },
  {
    key: 'ENOENT',
    hint: 'File not found',
    detail:
      'A file or directory does not exist. A temp file may already be cleaned up, or the path is wrong.',
    howToFix:
      'Check how the path is built, and that the file still exists when it is used.',
  },
  {
    key: 'EEXIST',
    hint: 'File already exists',
    detail: 'The target of a create/rename already exists.',
    howToFix: 'Use overwrite, or remove the old file first.',
  },
  {
    key: 'EISDIR',
    hint: 'Path is a directory',
    detail: 'A file operation got a directory path.',
    howToFix: 'Check how the path is built (missing file name).',
    category: 'bug',
  },
  {
    key: 'ENOTDIR',
    hint: 'Path is not a directory',
    detail: 'A path component that should be a directory is a file.',
    howToFix: 'Check how the path is built.',
    category: 'bug',
  },
  {
    key: 'ENOTEMPTY',
    hint: 'Directory not empty',
    detail: 'rmdir/rename needs an empty directory.',
    howToFix: 'Use a recursive remove, or clean the folder first.',
  },
  {
    key: 'EACCES',
    hint: 'Permission denied',
    detail:
      'The process may not read or write this path or bind this port (<1024).',
    howToFix:
      'Check file ownership, the volume mount or the user the container runs as.',
    category: 'config',
  },
  {
    key: 'EPERM',
    hint: 'Operation not permitted',
    detail:
      'The operation needs privileges the process lacks (chown, locked file, read-only volume).',
    howToFix: 'Check the container user and mounts.',
    category: 'config',
  },
  {
    key: 'EROFS',
    hint: 'Read-only file system',
    detail: 'A write hit a read-only mount.',
    howToFix: 'Write temp files to /tmp or a writable volume.',
    category: 'config',
  },
  {
    key: 'EMFILE',
    hint: 'Too many open files',
    detail:
      'The process hit its file descriptor limit: a leak of sockets/files, or too many parallel opens.',
    howToFix: 'Check for unclosed streams and raise ulimit -n.',
    category: 'bug',
  },
  {
    key: 'ENFILE',
    hint: 'System file table full',
    detail:
      'The whole machine hit its open-file limit. Another process is leaking descriptors.',
    howToFix:
      'Find the process on the node that leaks descriptors, or raise the system-wide limit (fs.file-max).',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ENOSPC',
    hint: 'Disk full',
    detail: 'No space left on the volume (or inotify watch limit reached).',
    howToFix: 'Clean temp files and logs, or grow the volume.',
    category: 'dependency',
  },
  {
    key: 'ENOMEM',
    hint: 'Out of memory',
    detail:
      'The OS refused to allocate memory for the operation. The container is near its memory limit.',
    howToFix: 'Look for large buffers.',
    category: 'dependency',
  },
  {
    key: 'EBUSY',
    hint: 'Resource busy',
    detail:
      'The file or device is in use by another process (open handle, mount).',
    howToFix: 'Retry, or close the other handle.',
    retryable: true,
  },
  {
    key: 'EAGAIN',
    hint: 'Resource temporarily busy',
    detail:
      'A non-blocking operation would block (pipe full, fork limit). Usually transient.',
    howToFix: 'Retry with backoff.',
    retryable: true,
  },
  {
    key: 'EMSGSIZE',
    hint: 'Message too long',
    detail: 'A datagram or response exceeds the transport size limit.',
    howToFix: 'Split the payload.',
    category: 'bug',
  },
  {
    key: 'EINVAL',
    hint: 'Invalid argument to syscall',
    detail: 'The OS rejected an argument: an invalid path, port or option.',
    howToFix: 'Check how the value is built at the origin.',
    category: 'bug',
  },
  {
    key: 'ENAMETOOLONG',
    hint: 'Path too long',
    detail: 'A file name or path exceeds the OS limit.',
    howToFix: 'Shorten generated file names (hash instead of the full title).',
    category: 'bug',
  },
  {
    key: 'ELOOP',
    hint: 'Symlink loop',
    detail: 'Too many symbolic links were followed.',
    howToFix:
      'Check the symlinks along the path, including mounted ones, for a link that points back to itself.',
    category: 'config',
  },
  {
    key: 'ECANCELED',
    hint: 'Operation cancelled',
    detail:
      'The OS operation was cancelled before it finished, usually by an abort or shutdown.',
    howToFix:
      'Check whether the abort or shutdown was expected; otherwise retry the operation.',
  },
  {
    key: 'ERR_SOCKET_BAD_PORT',
    hint: 'Invalid port number',
    detail: 'A port outside 0-65535 (or not a number) was used.',
    howToFix: 'Check the port env var: it may be empty or contain a URL.',
    category: 'config',
  },
  {
    key: 'ERR_SOCKET_CLOSED',
    hint: 'Socket already closed',
    detail:
      'Code used a socket after it was closed. Usually a write after the client disconnected or after shutdown.',
    howToFix:
      'Check the socket is still open before writing, and stop work on close.',
    category: 'bug',
  },
  {
    key: 'ERR_SOCKET_CONNECTION_TIMEOUT',
    hint: 'Connect timed out',
    detail:
      'None of the addresses DNS returned accepted the connection in time. The host may be down or filtered.',
    howToFix:
      'Retry later; if it persists, check the host is up and not blocked by a firewall.',
    retryable: true,
  },
  {
    key: 'ERR_SERVER_ALREADY_LISTEN',
    hint: 'Server already listening',
    detail:
      'listen() was called twice on the same server, often in a bootstrap that runs twice.',
    howToFix:
      'Make sure listen() runs once, for example by guarding the bootstrap.',
    category: 'bug',
  },
  {
    key: 'ERR_SERVER_NOT_RUNNING',
    hint: 'Server not running',
    detail:
      'close() was called on a server that is not listening, often twice during shutdown.',
    howToFix: 'Call close() once, or check server.listening first.',
    category: 'bug',
  },
]
