import type { ErrorPattern } from './types'

// nodemailer error codes; SMTP reply codes (RFC 5321 §4.2.3, RFC 4954 for
// 530/534/535/538) are surfaced as SMTP_<responseCode>.
export const smtpPatterns: ErrorPattern[] = [
  {
    key: 'EAUTH',
    hint: 'Wrong SMTP login',
    hintDetail:
      'The SMTP server rejected the username/password, or the account is locked. Check mail credentials in env.',
    category: 'config',
  },
  {
    key: 'ECONNECTION',
    hint: 'Cannot reach SMTP server',
    hintDetail:
      'Connecting to the mail server failed. Check the SMTP host, port and TLS settings in env.',
    retryable: true,
  },
  {
    key: 'ETLS',
    hint: 'SMTP TLS failed',
    hintDetail:
      'STARTTLS or the TLS handshake with the mail server failed: wrong port for secure/STARTTLS, or an untrusted certificate.',
    category: 'config',
  },
  {
    key: 'ESOCKET',
    hint: 'SMTP connection dropped',
    hintDetail:
      'The socket to the mail server errored or closed mid-session (timeout, reset). Usually temporary; retry.',
    retryable: true,
  },
  {
    key: 'EDNS',
    hint: 'SMTP host not found',
    hintDetail:
      'DNS could not resolve the mail server hostname. Check the SMTP host in env.',
    category: 'config',
  },
  {
    key: 'EPROTOCOL',
    hint: 'SMTP protocol error',
    hintDetail:
      'The mail server answered something unexpected (non-SMTP port, a proxy page). Check host/port and TLS mode.',
    category: 'config',
  },
  {
    key: 'EENVELOPE',
    hint: 'Invalid email recipient',
    hintDetail:
      'The sender or recipient address was rejected. Check the address format.',
    level: 'warn',
  },
  {
    key: 'EENVELOPEFORMAT',
    hint: 'Email address malformed',
    hintDetail:
      'A from/to address is not a valid email address. Validate addresses before sending.',
    level: 'warn',
  },
  {
    key: 'EMESSAGE',
    hint: 'Email rejected by server',
    hintDetail:
      'The server refused the message content, often size or policy. Check attachments and sender domain.',
  },
  {
    key: 'ESTREAM',
    hint: 'Email stream failed',
    hintDetail:
      'Reading the message body or an attachment stream failed (file missing, stream errored). Check the attachment source.',
    category: 'bug',
  },
  {
    key: 'ECOMPOSE',
    hint: 'Email could not be built',
    hintDetail:
      'mail-composer failed to build the MIME message: invalid attachment or header. Check the mail options.',
    category: 'bug',
  },
  {
    key: 'SMTP_421',
    hint: 'SMTP server busy',
    hintDetail:
      'The mail server is temporarily unavailable or throttling. Retry later.',
    retryable: true,
  },
  {
    key: 'SMTP_450',
    hint: 'Mailbox busy, try later',
    hintDetail: 'The recipient mailbox is busy or greylisted. Retry later.',
    retryable: true,
  },
  {
    key: 'SMTP_451',
    hint: 'SMTP local error, retry',
    hintDetail:
      'The server aborted the action with a local processing error (often greylisting). Retry later.',
    retryable: true,
  },
  {
    key: 'SMTP_452',
    hint: 'SMTP server storage full',
    hintDetail:
      'The server has insufficient storage or too many recipients in one message. Retry later or split recipients.',
    retryable: true,
  },
  {
    key: 'SMTP_454',
    hint: 'SMTP auth unavailable',
    hintDetail:
      'Temporary authentication failure or TLS not available right now. Retry later.',
    retryable: true,
  },
  {
    key: 'SMTP_455',
    hint: 'SMTP cannot accept params',
    hintDetail:
      'The server cannot accommodate the command parameters right now. Retry later.',
    retryable: true,
  },
  {
    key: 'SMTP_500',
    hint: 'SMTP command unrecognized',
    hintDetail:
      'Syntax error or command line too long. Usually a non-SMTP endpoint or a huge header line.',
    category: 'bug',
  },
  {
    key: 'SMTP_501',
    hint: 'SMTP argument invalid',
    hintDetail:
      'Syntax error in a command argument, usually a malformed email address. Validate addresses.',
    level: 'warn',
  },
  {
    key: 'SMTP_502',
    hint: 'SMTP command unsupported',
    hintDetail:
      'The server does not implement the command (e.g. STARTTLS, AUTH). Check the transport options.',
    category: 'config',
  },
  {
    key: 'SMTP_503',
    hint: 'SMTP command out of order',
    hintDetail:
      'Bad sequence of commands, often "authentication required" or MAIL FROM before EHLO. Check auth settings.',
    category: 'config',
  },
  {
    key: 'SMTP_504',
    hint: 'SMTP parameter unsupported',
    hintDetail:
      'A command parameter is not implemented, e.g. an unsupported AUTH mechanism. Check the auth method.',
    category: 'config',
  },
  {
    key: 'SMTP_530',
    hint: 'SMTP auth required',
    hintDetail:
      'The server requires authentication (or TLS) before sending. Set the SMTP credentials in env.',
    category: 'config',
  },
  {
    key: 'SMTP_534',
    hint: 'SMTP auth too weak',
    hintDetail:
      'The auth mechanism is too weak or an app password is required (Gmail). Use OAuth2 or an app password.',
    category: 'config',
  },
  {
    key: 'SMTP_535',
    hint: 'SMTP login rejected',
    hintDetail:
      'Authentication credentials invalid. Check the SMTP username/password in env.',
    category: 'config',
  },
  {
    key: 'SMTP_538',
    hint: 'SMTP needs TLS for auth',
    hintDetail:
      'Encryption is required for the requested auth mechanism. Enable STARTTLS or use the secure port.',
    category: 'config',
  },
  {
    key: 'SMTP_541',
    hint: 'Email rejected as spam',
    hintDetail:
      'The recipient server rejected the message by policy (spam, DMARC). Check SPF/DKIM for the sender domain.',
    level: 'warn',
  },
  {
    key: 'SMTP_550',
    hint: 'Mailbox rejected',
    hintDetail:
      'The recipient does not exist or the server refused relaying. Check the address and sender policy.',
    level: 'warn',
  },
  {
    key: 'SMTP_551',
    hint: 'Recipient not local',
    hintDetail:
      'The server does not host this mailbox and will not relay. Check the recipient address.',
    level: 'warn',
  },
  {
    key: 'SMTP_552',
    hint: 'Message too large',
    hintDetail:
      'The message exceeds the recipient storage or size limit. Shrink the attachments.',
    level: 'warn',
  },
  {
    key: 'SMTP_553',
    hint: 'Mailbox name invalid',
    hintDetail:
      'The recipient address syntax is not allowed. Validate the address.',
    level: 'warn',
  },
  {
    key: 'SMTP_554',
    hint: 'SMTP transaction failed',
    hintDetail:
      'The server refused the message or the session (no valid recipients, blacklisted IP, policy). Read the server text.',
  },
  {
    key: 'SMTP_GREETING_TIMEOUT',
    messageMatch: /^Greeting never received/,
    hint: 'SMTP server silent',
    hintDetail:
      'The server accepted the connection but never sent its greeting: wrong port (465 vs 587), a firewall, or secure:true on a STARTTLS port.',
    category: 'config',
    retryable: true,
  },
  {
    key: 'SMTP_CONNECTION_TIMEOUT',
    messageMatch: /^(Connection timeout|Timeout)$/,
    hint: 'SMTP connection timed out',
    hintDetail:
      'The mail server did not respond within the timeout. Check host/port and the network.',
    category: 'dependency',
    retryable: true,
  },
]
