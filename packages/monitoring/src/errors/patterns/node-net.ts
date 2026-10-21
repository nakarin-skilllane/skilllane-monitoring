import type { ErrorPattern } from './types'

// Node.js system error codes raised by sockets, DNS and the file system
// (nodejs.org/api/errors.html, "Common system errors").
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
    key: 'ESOCKETTIMEDOUT',
    hint: 'Socket timed out',
    hintDetail:
      'The socket stayed idle longer than its timeout while waiting for data. The remote service is slow or hung.',
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
    key: 'EAI_NODATA',
    hint: 'Host has no address',
    hintDetail:
      'DNS knows the name but has no A/AAAA record for it. Check the hostname and the DNS zone.',
  },
  {
    key: 'EAI_NONAME',
    hint: 'Host name unknown',
    hintDetail:
      'DNS has no entry for this name. Check the hostname in env; an empty or malformed host gives the same error.',
  },
  {
    key: 'EAI_FAIL',
    hint: 'DNS resolver failed',
    hintDetail:
      'The resolver returned a permanent failure for this name. Check cluster DNS and the search domains.',
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
    key: 'ENETUNREACH',
    hint: 'Network unreachable',
    hintDetail:
      'No route to the destination network. Check the pod network, egress rules or VPN.',
    retryable: true,
  },
  {
    key: 'ENETDOWN',
    hint: 'Network is down',
    hintDetail:
      'The local network interface is down. Check the node network; usually clears when the interface comes back.',
    retryable: true,
  },
  {
    key: 'EHOSTDOWN',
    hint: 'Host is down',
    hintDetail:
      'The remote host did not respond to ARP/ICMP. The machine or pod is off; retry once it is back.',
    retryable: true,
  },
  {
    key: 'EADDRINUSE',
    hint: 'Port already in use',
    hintDetail:
      'Another process already listens on this port. A previous instance is still running, or two apps share the port.',
    category: 'config',
  },
  {
    key: 'EADDRNOTAVAIL',
    hint: 'Address not available',
    hintDetail:
      'The local address to bind is not on this machine, or all ephemeral ports are in use (connection churn). Check the bind host and keep-alive.',
    category: 'config',
  },
  {
    key: 'ENOENT',
    hint: 'File not found',
    hintDetail:
      'A file or directory does not exist. A temp file may already be cleaned up, or the path is wrong.',
  },
  {
    key: 'EEXIST',
    hint: 'File already exists',
    hintDetail:
      'The target of a create/rename already exists. Use overwrite, or remove the old file first.',
  },
  {
    key: 'EISDIR',
    hint: 'Path is a directory',
    hintDetail:
      'A file operation got a directory path. Check how the path is built (missing file name).',
    category: 'bug',
  },
  {
    key: 'ENOTDIR',
    hint: 'Path is not a directory',
    hintDetail:
      'A path component that should be a directory is a file. Check how the path is built.',
    category: 'bug',
  },
  {
    key: 'ENOTEMPTY',
    hint: 'Directory not empty',
    hintDetail:
      'rmdir/rename needs an empty directory. Use a recursive remove, or clean the folder first.',
  },
  {
    key: 'EACCES',
    hint: 'Permission denied',
    hintDetail:
      'The process may not read or write this path or bind this port (<1024). Check file ownership, the volume mount or the user the container runs as.',
    category: 'config',
  },
  {
    key: 'EPERM',
    hint: 'Operation not permitted',
    hintDetail:
      'The operation needs privileges the process lacks (chown, locked file, read-only volume). Check the container user and mounts.',
    category: 'config',
  },
  {
    key: 'EROFS',
    hint: 'Read-only file system',
    hintDetail:
      'A write hit a read-only mount. Write temp files to /tmp or a writable volume.',
    category: 'config',
  },
  {
    key: 'EMFILE',
    hint: 'Too many open files',
    hintDetail:
      'The process hit its file descriptor limit: a leak of sockets/files, or too many parallel opens. Check for unclosed streams and raise ulimit -n.',
    category: 'bug',
  },
  {
    key: 'ENFILE',
    hint: 'System file table full',
    hintDetail:
      'The whole machine hit its open-file limit. Another process is leaking descriptors; check the node.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'ENOSPC',
    hint: 'Disk full',
    hintDetail:
      'No space left on the volume (or inotify watch limit reached). Clean temp files and logs, or grow the volume.',
    category: 'dependency',
  },
  {
    key: 'ENOMEM',
    hint: 'Out of memory',
    hintDetail:
      'The OS refused to allocate memory for the operation. The container is near its memory limit; look for large buffers.',
    category: 'dependency',
  },
  {
    key: 'EBUSY',
    hint: 'Resource busy',
    hintDetail:
      'The file or device is in use by another process (open handle, mount). Retry, or close the other handle.',
    retryable: true,
  },
  {
    key: 'EAGAIN',
    hint: 'Resource temporarily busy',
    hintDetail:
      'A non-blocking operation would block (pipe full, fork limit). Usually transient; retry with backoff.',
    retryable: true,
  },
  {
    key: 'EMSGSIZE',
    hint: 'Message too long',
    hintDetail:
      'A datagram or response exceeds the transport size limit. Split the payload.',
    category: 'bug',
  },
  {
    key: 'EINVAL',
    hint: 'Invalid argument to syscall',
    hintDetail:
      'The OS rejected an argument: an invalid path, port or option. Check how the value is built at the origin.',
    category: 'bug',
  },
  {
    key: 'ENAMETOOLONG',
    hint: 'Path too long',
    hintDetail:
      'A file name or path exceeds the OS limit. Shorten generated file names (hash instead of the full title).',
    category: 'bug',
  },
  {
    key: 'ELOOP',
    hint: 'Symlink loop',
    hintDetail: 'Too many symbolic links were followed. Check the mount.',
    category: 'config',
  },
  {
    key: 'ECANCELED',
    hint: 'Operation cancelled',
    hintDetail:
      'The OS operation was cancelled before it finished, usually by an abort or shutdown.',
  },
  {
    key: 'ERR_SOCKET_BAD_PORT',
    hint: 'Invalid port number',
    hintDetail:
      'A port outside 0-65535 (or not a number) was used. Check the port env var: it may be empty or contain a URL.',
    category: 'config',
  },
  {
    key: 'ERR_SOCKET_CLOSED',
    hint: 'Socket already closed',
    hintDetail:
      'Code used a socket after it was closed. Usually a write after the client disconnected or after shutdown.',
    category: 'bug',
  },
  {
    key: 'ERR_SOCKET_CONNECTION_TIMEOUT',
    hint: 'Connect timed out',
    hintDetail:
      'None of the addresses DNS returned accepted the connection in time. The host may be down or filtered.',
    retryable: true,
  },
  {
    key: 'ERR_SERVER_ALREADY_LISTEN',
    hint: 'Server already listening',
    hintDetail:
      'listen() was called twice on the same server, often in a bootstrap that runs twice.',
    category: 'bug',
  },
  {
    key: 'ERR_SERVER_NOT_RUNNING',
    hint: 'Server not running',
    hintDetail:
      'close() was called on a server that is not listening, often twice during shutdown.',
    category: 'bug',
  },
]
