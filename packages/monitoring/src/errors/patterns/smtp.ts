import type { ErrorPattern } from './types'

// Sources:
// - https://nodemailer.com/errors (nodemailer error codes and timeout types)
// - https://raw.githubusercontent.com/nodemailer/nodemailer/master/src/smtp-connection/index.ts (where each code and timeout message is raised)
// - https://www.rfc-editor.org/rfc/rfc5321.txt (SMTP reply codes, section 4.2.3)
// - https://www.rfc-editor.org/rfc/rfc4954.txt (AUTH reply codes 454, 530, 534, 535, 538)
// - https://www.rfc-editor.org/rfc/rfc3207.txt (STARTTLS reply codes 454 and 530)
// nodemailer error codes; SMTP reply codes (RFC 5321 §4.2.3, RFC 4954 for
// 530/534/535/538) are surfaced as SMTP_<responseCode>.
export const smtpPatterns: ErrorPattern[] = [
  {
    key: 'EAUTH',
    hint: 'Wrong SMTP login',
    detail:
      'The SMTP server rejected the username/password, or the account is locked.',
    howToFix: 'Check the mail credentials in env.',
    category: 'config',
  },
  {
    key: 'ECONNECTION',
    hint: 'Cannot reach SMTP server',
    detail:
      'The connection to the mail server failed or was closed unexpectedly, e.g. the server ended the session.',
    howToFix: 'Check the SMTP host, port and TLS settings in env.',
    retryable: true,
  },
  {
    key: 'ETLS',
    hint: 'SMTP TLS failed',
    detail:
      'STARTTLS or the TLS handshake with the mail server failed: wrong port for secure/STARTTLS, or an untrusted certificate.',
    howToFix:
      'Match the secure setting to the port (465 secure, 587 STARTTLS) and check the server certificate.',
    category: 'config',
  },
  {
    key: 'ESOCKET',
    hint: 'SMTP connection dropped',
    detail:
      'A low-level socket error with the mail server: connection refused or reset, or a broken pipe.',
    howToFix:
      'Retry the send; if it keeps failing, check the SMTP host and port in env and the network path.',
    retryable: true,
  },
  {
    key: 'EDNS',
    hint: 'SMTP host not found',
    detail: 'DNS could not resolve the mail server hostname.',
    howToFix: 'Check the SMTP host in env.',
    category: 'config',
  },
  {
    key: 'EPROTOCOL',
    hint: 'SMTP protocol error',
    detail:
      'The mail server answered something unexpected (non-SMTP port, a proxy page).',
    howToFix: 'Check host/port and TLS mode.',
    category: 'config',
  },
  {
    key: 'EENVELOPE',
    hint: 'Invalid email recipient',
    detail:
      'The envelope is invalid: no recipients, a malformed sender or recipient, or the server rejected them.',
    howToFix:
      'Check the from/to addresses; the server reply in error.message says which one was refused.',
    level: 'warn',
  },
  {
    key: 'EENVELOPEFORMAT',
    hint: 'Email address malformed',
    detail: 'A from/to address is not a valid email address.',
    howToFix: 'Validate addresses before sending.',
    level: 'warn',
  },
  {
    key: 'EMESSAGE',
    hint: 'Email rejected by server',
    detail: 'The server refused the message content, often for size or policy.',
    howToFix: 'Check attachments and sender domain.',
  },
  {
    key: 'ESTREAM',
    hint: 'Email stream failed',
    detail:
      'Reading the message body or an attachment stream failed (file missing, stream errored).',
    howToFix: 'Check the attachment source.',
    category: 'bug',
  },
  {
    key: 'ECOMPOSE',
    hint: 'Email could not be built',
    detail:
      'mail-composer failed to build the MIME message: invalid attachment or header.',
    howToFix: 'Check the mail options.',
    category: 'bug',
  },
  {
    key: 'SMTP_421',
    hint: 'SMTP server busy',
    detail: 'The mail server is temporarily unavailable or throttling.',
    howToFix: 'Retry later.',
    retryable: true,
  },
  {
    key: 'SMTP_450',
    hint: 'Mailbox busy, try later',
    detail: 'The recipient mailbox is busy or greylisted.',
    howToFix: 'Retry later.',
    retryable: true,
  },
  {
    key: 'SMTP_451',
    hint: 'SMTP local error, retry',
    detail:
      'The server aborted the action with a local processing error (often greylisting).',
    howToFix: 'Retry later.',
    retryable: true,
  },
  {
    key: 'SMTP_452',
    hint: 'SMTP server storage full',
    detail:
      'The server has insufficient storage or too many recipients in one message.',
    howToFix: 'Retry later or split recipients.',
    retryable: true,
  },
  {
    key: 'SMTP_454',
    hint: 'SMTP auth unavailable',
    detail: 'Temporary authentication failure or TLS not available right now.',
    howToFix: 'Retry later.',
    retryable: true,
  },
  {
    key: 'SMTP_455',
    hint: 'SMTP cannot accept params',
    detail: 'The server cannot accommodate the command parameters right now.',
    howToFix: 'Retry later.',
    retryable: true,
  },
  {
    key: 'SMTP_500',
    hint: 'SMTP command unrecognized',
    detail:
      'Syntax error or command line too long. Usually a non-SMTP endpoint or a huge header line.',
    howToFix:
      'Check that the host/port is an SMTP server and that no header line is oversized.',
    category: 'bug',
  },
  {
    key: 'SMTP_501',
    hint: 'SMTP argument invalid',
    detail:
      'Syntax error in a command argument, usually a malformed email address.',
    howToFix: 'Validate addresses.',
    level: 'warn',
  },
  {
    key: 'SMTP_502',
    hint: 'SMTP command unsupported',
    detail: 'The server does not implement the command (e.g. STARTTLS, AUTH).',
    howToFix: 'Check the transport options.',
    category: 'config',
  },
  {
    key: 'SMTP_503',
    hint: 'SMTP command out of order',
    detail:
      'Bad sequence of commands, often "authentication required" or MAIL FROM before EHLO.',
    howToFix: 'Check auth settings.',
    category: 'config',
  },
  {
    key: 'SMTP_504',
    hint: 'SMTP parameter unsupported',
    detail:
      'A command parameter is not implemented, e.g. an unsupported AUTH mechanism.',
    howToFix: 'Check the auth method.',
    category: 'config',
  },
  {
    key: 'SMTP_530',
    hint: 'SMTP auth required',
    detail: 'The server requires authentication (or TLS) before sending.',
    howToFix:
      'Set the SMTP credentials in env, and use STARTTLS or the secure port if the server requires TLS first.',
    category: 'config',
  },
  {
    key: 'SMTP_534',
    hint: 'SMTP auth too weak',
    detail:
      'The auth mechanism is too weak or an app password is required (Gmail).',
    howToFix: 'Use OAuth2 or an app password.',
    category: 'config',
  },
  {
    key: 'SMTP_535',
    hint: 'SMTP login rejected',
    detail: 'The authentication credentials are invalid.',
    howToFix: 'Check the SMTP username/password in env.',
    category: 'config',
  },
  {
    key: 'SMTP_538',
    hint: 'SMTP needs TLS for auth',
    detail: 'Encryption is required for the requested auth mechanism.',
    howToFix: 'Enable STARTTLS or use the secure port.',
    category: 'config',
  },
  {
    key: 'SMTP_541',
    hint: 'Email rejected as spam',
    detail:
      'The recipient server rejected the message by policy (spam, DMARC).',
    howToFix: 'Check SPF/DKIM for the sender domain.',
    level: 'warn',
  },
  {
    key: 'SMTP_550',
    hint: 'Mailbox rejected',
    detail: 'The recipient does not exist or the server refused relaying.',
    howToFix: 'Check the address and sender policy.',
    level: 'warn',
  },
  {
    key: 'SMTP_551',
    hint: 'Recipient not local',
    detail: 'The server does not host this mailbox and will not relay.',
    howToFix: 'Check the recipient address.',
    level: 'warn',
  },
  {
    key: 'SMTP_552',
    hint: 'Message too large',
    detail: 'The message exceeds the recipient storage or size limit.',
    howToFix: 'Shrink the attachments.',
    level: 'warn',
  },
  {
    key: 'SMTP_553',
    hint: 'Mailbox name invalid',
    detail: 'The recipient address syntax is not allowed.',
    howToFix: 'Validate the address.',
    level: 'warn',
  },
  {
    key: 'SMTP_554',
    hint: 'SMTP transaction failed',
    detail:
      'The server refused the message or the session (no valid recipients, blacklisted IP, policy).',
    howToFix: 'Read the server text in error.message for the reason.',
  },
  {
    key: 'SMTP_GREETING_TIMEOUT',
    messageMatch: /^Greeting never received/,
    hint: 'SMTP server silent',
    detail:
      'The server accepted the connection but never sent its greeting: secure:false on implicit-TLS port 465, a firewall, or a stalled server.',
    howToFix:
      'Check the port, the secure setting and any firewall between the app and the server.',
    category: 'config',
    retryable: true,
  },
  {
    key: 'SMTP_CONNECTION_TIMEOUT',
    messageMatch: /^(Connection timeout|Timeout)$/,
    hint: 'SMTP connection timed out',
    detail:
      'Connecting to the mail server exceeded connectionTimeout, or an open session stayed idle past socketTimeout.',
    howToFix: 'Check host/port and the network.',
    category: 'dependency',
    retryable: true,
  },
]
