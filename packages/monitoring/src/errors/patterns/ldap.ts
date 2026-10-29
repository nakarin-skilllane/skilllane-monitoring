import type { ErrorPattern } from './types'

// Sources:
// - https://www.rfc-editor.org/rfc/rfc4511.txt (LDAP result codes and their meanings, Appendix A)
// - https://github.com/ldapts/ldapts/tree/main/src/errors/resultCodeErrors (ldapts error classes per result code)
// - https://github.com/ldapts/ldapts/blob/main/src/Client.ts (connection and operation timeout messages)

// ldapts error classes, one per LDAP result code (RFC 4511).
export const ldapPatterns: ErrorPattern[] = [
  {
    key: 'InvalidCredentialsError',
    hint: 'LDAP login rejected',
    detail: 'The directory rejected the bind credentials (LDAP 49).',
    howToFix: 'Check the service account in env or the user password.',
    level: 'warn',
  },
  {
    key: 'NoSuchObjectError',
    hint: 'LDAP entry not found',
    detail: 'The DN does not exist in the directory (LDAP 32).',
    howToFix: 'Check the DN and base DN, and whether the entry was deleted.',
    level: 'warn',
  },
  {
    key: 'EntryAlreadyExistsError',
    hint: 'LDAP entry already exists',
    detail:
      'An entry with the target DN already exists, so the add or rename was refused (LDAP 68).',
    howToFix:
      'Check whether the entry exists before adding it, or modify the existing one.',
    level: 'warn',
  },
  {
    key: 'InsufficientAccessError',
    hint: 'LDAP access denied',
    detail:
      'The service account lacks rights for this LDAP operation (LDAP 50).',
    howToFix: 'Check the service account ACLs.',
    category: 'config',
  },
  {
    key: 'StrongAuthRequiredError',
    hint: 'LDAP needs secure bind',
    detail:
      'The directory requires TLS or a stronger auth for this operation (LDAP 8).',
    howToFix: 'Use ldaps:// or StartTLS.',
    category: 'config',
  },
  {
    key: 'ConfidentialityRequiredError',
    hint: 'LDAP needs TLS',
    detail:
      'The directory refuses this operation over a plain connection (LDAP 13).',
    howToFix: 'Use ldaps://.',
    category: 'config',
  },
  {
    key: 'InappropriateAuthError',
    hint: 'LDAP auth method rejected',
    detail:
      'The bind was anonymous or had no credentials where the server requires them (LDAP 48), e.g. a simple bind with an empty password.',
    howToFix:
      'Bind with a DN and a non-empty password, or the auth method the server requires.',
    category: 'config',
  },
  {
    key: 'BusyError',
    hint: 'LDAP server busy',
    detail: 'The directory is too busy to answer (LDAP 51).',
    howToFix: 'Retry with backoff.',
    retryable: true,
  },
  {
    key: 'UnavailableError',
    hint: 'LDAP server unavailable',
    detail: 'The directory is shutting down or a subsystem is down (LDAP 52).',
    howToFix: 'Retry later.',
    retryable: true,
  },
  {
    key: 'UnwillingToPerformError',
    hint: 'LDAP refused operation',
    detail:
      'The directory refuses this operation by policy (LDAP 53): password policy, read-only replica, or a disabled account.',
    howToFix:
      'Check the password policy, whether the server is a read-only replica, and the account status.',
    level: 'warn',
  },
  {
    key: 'TimeLimitExceededError',
    hint: 'LDAP search timed out',
    detail:
      'The search ran past its time limit, set by the client request or the server (LDAP 3).',
    howToFix: 'Narrow the filter or base DN.',
    retryable: true,
  },
  {
    key: 'SizeLimitExceededError',
    hint: 'LDAP result too large',
    detail:
      'The search matched more entries than the size limit, set by the client request or the server (LDAP 4).',
    howToFix: 'Narrow the filter or page the results.',
    category: 'bug',
  },
  {
    key: 'AdminLimitExceededError',
    hint: 'LDAP admin limit exceeded',
    detail: 'The search exceeded a server-side administrative limit (LDAP 11).',
    howToFix: 'Narrow the query or ask the directory admin.',
  },
  {
    key: 'ResultsTooLargeError',
    hint: 'LDAP result too large',
    detail: 'The result set is too large for the server (LDAP 70).',
    howToFix: 'Page or narrow the search.',
    category: 'bug',
  },
  {
    key: 'ConstraintViolationError',
    hint: 'LDAP value rejected',
    detail:
      'An attribute value violates a directory constraint (LDAP 19): password policy, length, or a reused password.',
    howToFix:
      'Check the value against the directory password policy and length rules.',
    level: 'warn',
  },
  {
    key: 'AttributeOrValueExistsError',
    hint: 'LDAP value already exists',
    detail:
      'An attribute value was added that the entry already has (LDAP 20).',
    howToFix: 'Use replace instead of add.',
    level: 'warn',
  },
  {
    key: 'NoSuchAttributeError',
    hint: 'LDAP attribute missing',
    detail:
      'The modify or compare names an attribute or value the entry does not have (LDAP 16).',
    howToFix: 'Check the attribute name and the entry.',
    level: 'warn',
  },
  {
    key: 'UndefinedTypeError',
    hint: 'LDAP attribute unknown',
    detail: 'The attribute type is not in the directory schema (LDAP 17).',
    howToFix: 'Check the attribute name.',
    category: 'bug',
  },
  {
    key: 'InvalidSyntaxError',
    hint: 'LDAP value syntax invalid',
    detail:
      'An attribute value does not match its schema syntax (LDAP 21), e.g. a non-numeric uidNumber.',
    howToFix: 'Format the value to match the attribute syntax in the schema.',
    level: 'warn',
  },
  {
    key: 'InvalidDNSyntaxError',
    hint: 'LDAP DN malformed',
    detail:
      'The DN is not valid (LDAP 34): unescaped comma/plus in a value, or a wrong base DN in env.',
    howToFix:
      'Escape special characters in DN values, and check the base DN in env.',
    category: 'bug',
  },
  {
    key: 'NamingViolationError',
    hint: 'LDAP naming violation',
    detail:
      'The entry name violates the directory naming rules (LDAP 64): the RDN attribute or the parent is not allowed by the schema.',
    howToFix:
      'Build the DN with an RDN attribute and parent that the schema allows for this object class.',
    category: 'bug',
  },
  {
    key: 'ObjectClassViolationError',
    hint: 'LDAP object class violation',
    detail:
      'The entry lacks a required attribute or has one its object classes do not allow (LDAP 65).',
    howToFix:
      'Add the required attributes, or remove the ones the object classes do not allow.',
    category: 'bug',
  },
  {
    key: 'ObjectClassModsProhibitedError',
    hint: 'LDAP object class locked',
    detail:
      'The object class of an existing entry cannot be modified (LDAP 69).',
    howToFix:
      'Leave the object class unchanged, or delete and recreate the entry.',
    category: 'bug',
  },
  {
    key: 'NotAllowedOnNonLeafError',
    hint: 'LDAP entry has children',
    detail: 'Delete/rename is not allowed on an entry with children (LDAP 66).',
    howToFix: 'Remove the children first.',
    level: 'warn',
  },
  {
    key: 'NotAllowedOnRDNError',
    hint: 'LDAP RDN attribute locked',
    detail: 'The attribute is part of the RDN and cannot be removed (LDAP 67).',
    howToFix: 'Rename the entry instead.',
    category: 'bug',
  },
  {
    key: 'AliasProblemError',
    hint: 'LDAP alias problem',
    detail: 'An alias points to a missing entry (LDAP 33).',
    howToFix: 'Fix or remove the alias entry.',
  },
  {
    key: 'AliasDerefProblemError',
    hint: 'LDAP alias dereference failed',
    detail:
      'An alias could not be followed (LDAP 36), often a permissions issue.',
    howToFix: 'Check the service account rights on the alias target.',
  },
  {
    key: 'AffectsMultipleDSAsError',
    hint: 'LDAP operation spans servers',
    detail:
      'The operation would affect more than one directory server (LDAP 71).',
    howToFix: 'Split the operation so each part stays on one directory server.',
  },
  {
    key: 'LoopDetectError',
    hint: 'LDAP referral loop',
    detail: 'The server detected a referral/alias loop (LDAP 54).',
    howToFix: 'Check the referral and alias configuration on the directory.',
    category: 'config',
  },
  {
    key: 'UnavailableCriticalExtensionError',
    hint: 'LDAP control unsupported',
    detail:
      'A critical control (paging, sorting) is not supported by this server (LDAP 12).',
    howToFix: 'Remove the control, or mark it non-critical.',
    category: 'bug',
  },
  {
    key: 'SaslBindInProgressError',
    hint: 'LDAP SASL bind in progress',
    detail: 'A SASL bind needs more steps (LDAP 14).',
    howToFix: 'Let the client library continue the SASL bind.',
  },
  {
    key: 'TLSNotSupportedError',
    hint: 'LDAP StartTLS unsupported',
    detail: 'The server does not support StartTLS.',
    howToFix: 'Use ldaps:// instead.',
    category: 'config',
  },
  {
    key: 'LDAP_SOCKET_TIMEOUT',
    messageMatch: /^(Operation timed out|Connection timeout)/,
    hint: 'LDAP server not responding',
    detail:
      'The directory did not answer in time. The directory server may be overloaded or unreachable.',
    howToFix:
      'Retry later, and check the directory server load and network reachability.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'LDAP_NOT_CONNECTED',
    messageMatch: /^Connection is not connected|^Connection is unbound/i,
    hint: 'LDAP client not connected',
    detail: 'A search/modify ran before bind() or after unbind().',
    howToFix: 'Check the client lifecycle.',
    category: 'bug',
  },
]
