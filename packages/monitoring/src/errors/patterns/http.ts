import type { ErrorPattern } from './types'

// Outbound HTTP (axios) and the external APIs school-core-api calls.
export const httpPatterns: ErrorPattern[] = [
  {
    key: 'ETIMEDOUT',
    dependency: 'http',
    hint: '"{name}" API not responding',
    hintDetail:
      'No reply from {host} in time. The external API may be slow or down.',
    retryable: true,
  },
  {
    key: 'ECONNABORTED',
    dependency: 'http',
    hint: '"{name}" API timed out',
    hintDetail:
      'The request hit its timeout before {host} answered. The external API may be slow or down.',
    retryable: true,
  },
  {
    key: 'ERR_BAD_RESPONSE',
    dependency: 'http',
    hint: '"{name}" API returned 5xx',
    hintDetail:
      '{host} failed on its side. Usually temporary; check the provider status if it persists.',
    retryable: true,
  },
  {
    key: 'ERR_BAD_REQUEST',
    dependency: 'http',
    hint: '"{name}" API rejected request',
    hintDetail:
      '{host} answered 4xx. Check credentials (401/403), the URL (404) or the payload (400); 429 means rate limited.',
  },
  {
    key: 'ERR_NETWORK',
    dependency: 'http',
    hint: '"{name}" API network error',
    hintDetail:
      'The request failed before a response arrived. Check DNS, network policy or proxy settings for {host}.',
    retryable: true,
  },
  {
    key: 'ERR_CANCELED',
    dependency: 'http',
    hint: 'Request cancelled',
    hintDetail:
      'The request was aborted by the caller (AbortController or shutdown). Usually not an error by itself.',
  },
  {
    key: 'InvalidCredentialsError',
    hint: 'LDAP login rejected',
    hintDetail:
      'Oracle IAM rejected the bind credentials (LDAP 49). Check the service account in env or the user password.',
    level: 'warn',
  },
  {
    key: 'NoSuchObjectError',
    hint: 'LDAP entry not found',
    hintDetail: 'The DN does not exist in Oracle IAM (LDAP 32).',
    level: 'warn',
  },
  {
    key: 'EntryAlreadyExistsError',
    hint: 'LDAP entry already exists',
    hintDetail: 'Oracle IAM already has this entry (LDAP 68).',
    level: 'warn',
  },
  {
    key: 'InsufficientAccessError',
    hint: 'LDAP access denied',
    hintDetail:
      'The service account lacks rights for this LDAP operation (LDAP 50). Check its ACLs.',
  },
  {
    key: 'LDAP_SOCKET_TIMEOUT',
    messageMatch: /^(Operation timed out|Connection timeout)/,
    hint: 'LDAP server not responding',
    hintDetail:
      'Oracle IAM did not answer in time. The directory server may be overloaded or unreachable.',
    retryable: true,
  },
]
