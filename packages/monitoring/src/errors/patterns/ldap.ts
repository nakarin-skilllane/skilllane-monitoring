import type { ErrorPattern } from './types'

// ldapts error classes, one per LDAP result code (RFC 4511).
export const ldapPatterns: ErrorPattern[] = [
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
    category: 'config',
  },
  {
    key: 'StrongAuthRequiredError',
    hint: 'LDAP needs secure bind',
    hintDetail:
      'The directory requires TLS or a stronger auth for this operation (LDAP 8). Use ldaps:// or StartTLS.',
    category: 'config',
  },
  {
    key: 'ConfidentialityRequiredError',
    hint: 'LDAP needs TLS',
    hintDetail:
      'The directory refuses this operation over a plain connection (LDAP 13). Use ldaps://.',
    category: 'config',
  },
  {
    key: 'InappropriateAuthError',
    hint: 'LDAP auth method rejected',
    hintDetail:
      'The bind used an auth method the entry does not allow (LDAP 48), e.g. simple bind on an entry without a password.',
    category: 'config',
  },
  {
    key: 'BusyError',
    hint: 'LDAP server busy',
    hintDetail:
      'The directory is too busy to answer (LDAP 51). Retry with backoff.',
    retryable: true,
  },
  {
    key: 'UnavailableError',
    hint: 'LDAP server unavailable',
    hintDetail:
      'The directory is shutting down or a subsystem is down (LDAP 52). Retry later.',
    retryable: true,
  },
  {
    key: 'UnwillingToPerformError',
    hint: 'LDAP refused operation',
    hintDetail:
      'The directory refuses this operation by policy (LDAP 53): password policy, read-only replica, or a disabled account.',
    level: 'warn',
  },
  {
    key: 'TimeLimitExceededError',
    hint: 'LDAP search timed out',
    hintDetail:
      'The search exceeded the server time limit (LDAP 3). Narrow the filter or base DN.',
    retryable: true,
  },
  {
    key: 'SizeLimitExceededError',
    hint: 'LDAP result too large',
    hintDetail:
      'The search matched more entries than the server size limit (LDAP 4). Narrow the filter or page the results.',
    category: 'bug',
  },
  {
    key: 'AdminLimitExceededError',
    hint: 'LDAP admin limit exceeded',
    hintDetail:
      'The search exceeded a server-side administrative limit (LDAP 11). Narrow the query or ask the directory admin.',
  },
  {
    key: 'ResultsTooLargeError',
    hint: 'LDAP result too large',
    hintDetail:
      'The result set is too large for the server (LDAP 70). Page or narrow the search.',
    category: 'bug',
  },
  {
    key: 'ConstraintViolationError',
    hint: 'LDAP value rejected',
    hintDetail:
      'An attribute value violates a directory constraint (LDAP 19): password policy, length, or a reused password.',
    level: 'warn',
  },
  {
    key: 'AttributeOrValueExistsError',
    hint: 'LDAP value already exists',
    hintDetail:
      'Adding an attribute value that the entry already has (LDAP 20). Use replace instead of add.',
    level: 'warn',
  },
  {
    key: 'NoSuchAttributeError',
    hint: 'LDAP attribute missing',
    hintDetail:
      'The modify targets an attribute the entry does not have (LDAP 16). Check the attribute name and the entry.',
    level: 'warn',
  },
  {
    key: 'UndefinedTypeError',
    hint: 'LDAP attribute unknown',
    hintDetail:
      'The attribute type is not in the directory schema (LDAP 17). Check the name.',
    category: 'bug',
  },
  {
    key: 'InvalidSyntaxError',
    hint: 'LDAP value syntax invalid',
    hintDetail:
      'An attribute value does not match its schema syntax (LDAP 21), e.g. a non-numeric uidNumber.',
    level: 'warn',
  },
  {
    key: 'InvalidDNSyntaxError',
    hint: 'LDAP DN malformed',
    hintDetail:
      'The DN is not valid (LDAP 34): unescaped comma/plus in a value, or a wrong base DN in env.',
    category: 'bug',
  },
  {
    key: 'NamingViolationError',
    hint: 'LDAP naming violation',
    hintDetail: 'The RDN does not match the entry attributes (LDAP 64).',
    category: 'bug',
  },
  {
    key: 'ObjectClassViolationError',
    hint: 'LDAP object class violation',
    hintDetail:
      'The entry lacks a required attribute or has one its object classes do not allow (LDAP 65).',
    category: 'bug',
  },
  {
    key: 'ObjectClassModsProhibitedError',
    hint: 'LDAP object class locked',
    hintDetail:
      'The object class of an existing entry cannot be modified (LDAP 69).',
    category: 'bug',
  },
  {
    key: 'NotAllowedOnNonLeafError',
    hint: 'LDAP entry has children',
    hintDetail:
      'Delete/rename is not allowed on an entry with children (LDAP 66). Remove the children first.',
    level: 'warn',
  },
  {
    key: 'NotAllowedOnRDNError',
    hint: 'LDAP RDN attribute locked',
    hintDetail:
      'The attribute is part of the RDN and cannot be removed (LDAP 67). Rename the entry instead.',
    category: 'bug',
  },
  {
    key: 'AliasProblemError',
    hint: 'LDAP alias problem',
    hintDetail: 'An alias points to a missing entry (LDAP 33).',
  },
  {
    key: 'AliasDerefProblemError',
    hint: 'LDAP alias dereference failed',
    hintDetail:
      'An alias could not be followed (LDAP 36), often a permissions issue.',
  },
  {
    key: 'AffectsMultipleDSAsError',
    hint: 'LDAP operation spans servers',
    hintDetail:
      'The operation would affect more than one directory server (LDAP 71).',
  },
  {
    key: 'LoopDetectError',
    hint: 'LDAP referral loop',
    hintDetail: 'The server detected a referral/alias loop (LDAP 54).',
    category: 'config',
  },
  {
    key: 'UnavailableCriticalExtensionError',
    hint: 'LDAP control unsupported',
    hintDetail:
      'A critical control (paging, sorting) is not supported by this server (LDAP 12).',
    category: 'bug',
  },
  {
    key: 'SaslBindInProgressError',
    hint: 'LDAP SASL bind in progress',
    hintDetail:
      'A SASL bind needs more steps (LDAP 14). The client library should continue it.',
  },
  {
    key: 'TLSNotSupportedError',
    hint: 'LDAP StartTLS unsupported',
    hintDetail: 'The server does not support StartTLS. Use ldaps:// instead.',
    category: 'config',
  },
  {
    key: 'LDAP_SOCKET_TIMEOUT',
    messageMatch: /^(Operation timed out|Connection timeout)/,
    hint: 'LDAP server not responding',
    hintDetail:
      'Oracle IAM did not answer in time. The directory server may be overloaded or unreachable.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'LDAP_NOT_CONNECTED',
    messageMatch: /^Connection is not connected|^Connection is unbound/i,
    hint: 'LDAP client not connected',
    hintDetail:
      'A search/modify ran before bind() or after unbind(). Check the client lifecycle.',
    category: 'bug',
  },
]
