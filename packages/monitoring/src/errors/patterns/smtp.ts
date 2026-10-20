import type { ErrorPattern } from './types'

// nodemailer error codes; SMTP reply codes are surfaced as SMTP_<responseCode>.
export const smtpPatterns: ErrorPattern[] = [
  {
    key: 'EAUTH',
    hint: 'Wrong SMTP login',
    hintDetail:
      'The SMTP server rejected the username/password, or the account is locked. Check mail credentials in env.',
  },
  {
    key: 'ECONNECTION',
    hint: 'Cannot reach SMTP server',
    hintDetail:
      'Connecting to the mail server failed. Check the SMTP host, port and TLS settings in env.',
    retryable: true,
  },
  {
    key: 'EENVELOPE',
    hint: 'Invalid email recipient',
    hintDetail:
      'The sender or recipient address was rejected. Check the address format.',
    level: 'warn',
  },
  {
    key: 'EMESSAGE',
    hint: 'Email rejected by server',
    hintDetail:
      'The server refused the message content, often size or policy. Check attachments and sender domain.',
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
    key: 'SMTP_550',
    hint: 'Mailbox rejected',
    hintDetail:
      'The recipient does not exist or the server refused relaying. Check the address and sender policy.',
    level: 'warn',
  },
]
