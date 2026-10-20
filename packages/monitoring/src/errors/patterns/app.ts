import type { ErrorPattern } from './types'

// Framework errors and the errorCode values school-core-api throws most.
export const appPatterns: ErrorPattern[] = [
  {
    key: 'TokenExpiredError',
    hint: 'Token expired',
    hintDetail:
      'The JWT is past its exp time. The client should refresh or sign in again.',
    level: 'warn',
  },
  {
    key: 'JsonWebTokenError',
    hint: 'Invalid token',
    hintDetail:
      'The JWT signature or format is invalid. It may be tampered with or signed by another environment.',
    level: 'warn',
  },
  {
    key: 'INVALID_JSON',
    messageMatch:
      /(Unexpected token .* in JSON|is not valid JSON|Unexpected end of JSON input)/,
    hint: 'Invalid JSON',
    hintDetail:
      'JSON.parse received malformed text. Check the producer of the payload or message.',
  },
  {
    key: 'DUPLICATE_RECORD',
    hint: 'Duplicate record',
    hintDetail:
      'A unique constraint rejected the row (ORA-00001). Often a double submit or concurrent insert.',
    level: 'warn',
  },
  {
    key: 'RESOURCE_BUSY',
    hint: 'Record is locked',
    hintDetail: 'Another transaction holds the lock. Retry shortly.',
    retryable: true,
  },
  {
    key: 'VALUE_TOO_LONG',
    hint: 'Value too long',
    hintDetail: 'A value exceeds the column size (ORA-12899).',
    level: 'warn',
  },
  {
    key: 'REQUIRED_FIELD_MISSING',
    hint: 'Required field missing',
    hintDetail: 'A NOT NULL column was left empty (ORA-01400).',
    level: 'warn',
  },
  {
    key: 'RELATED_RECORD_NOT_FOUND',
    hint: 'Related record not found',
    hintDetail: 'A foreign key points to a missing record (ORA-02291).',
    level: 'warn',
  },
  {
    key: 'RELATED_RECORD_IN_USE',
    hint: 'Record still in use',
    hintDetail: 'Other records still reference this one (ORA-02292).',
    level: 'warn',
  },
  {
    key: 'VALIDATION_ERROR',
    hint: 'Invalid request',
    hintDetail: 'The request data failed validation.',
    level: 'warn',
  },
  {
    key: 'HEADER_VALIDATION_ERROR',
    hint: 'Wrong file headers',
    hintDetail: 'The uploaded file columns do not match the template.',
    level: 'warn',
  },
  {
    key: 'FILE_EMPTY',
    hint: 'Uploaded file is empty',
    hintDetail: 'The uploaded file has no data rows.',
    level: 'warn',
  },
  {
    key: 'FILE_ALREADY_PROCESSED',
    hint: 'File already processed',
    hintDetail: 'This import file was processed before.',
    level: 'warn',
  },
]
