import type { ErrorPattern } from './types'

// AWS SDK v3 S3 error names. aws.provider.ts rethrows as a plain Error with a
// fixed prefix, so the wrapped form is matched by message.
export const s3Patterns: ErrorPattern[] = [
  {
    key: 'NoSuchKey',
    dependency: 's3',
    hint: 'File not found in storage',
    hintDetail:
      'The object key does not exist in the bucket. It may have been deleted or the stored key is wrong.',
    level: 'warn',
  },
  {
    key: 'NotFound',
    dependency: 's3',
    hint: 'File not found in storage',
    hintDetail:
      'HEAD on the object returned 404. It may have been deleted or the stored key is wrong.',
    level: 'warn',
  },
  {
    key: 'AccessDenied',
    dependency: 's3',
    hint: 'Storage access denied',
    hintDetail:
      'The credentials lack permission for this bucket or key. Check the IAM policy and storage env vars.',
  },
  {
    key: 'NoSuchBucket',
    dependency: 's3',
    hint: 'Storage bucket missing',
    hintDetail: 'The bucket name in env does not exist in this region/account.',
  },
  {
    key: 'SignatureDoesNotMatch',
    dependency: 's3',
    hint: 'Storage credentials invalid',
    hintDetail:
      'The secret key is wrong or the server clock is skewed. Check storage credentials in env.',
  },
  {
    key: 'SlowDown',
    dependency: 's3',
    hint: 'Storage rate limited',
    hintDetail:
      'S3 asked the client to slow down. Reduce parallel uploads or add backoff.',
    retryable: true,
  },
  {
    key: 'RequestTimeout',
    dependency: 's3',
    hint: 'Storage request timed out',
    hintDetail:
      'The upload/download did not finish in time. Large files or a slow network; retry.',
    retryable: true,
  },
  {
    key: 'S3_WRAPPED_ERROR',
    messageMatch:
      /^(Error (putting|uploading|deleting|getting|copying|downloading|moving|checking) file|Get meta error)/,
    hint: 'Storage operation failed',
    hintDetail:
      'aws.provider rethrew the S3 error without its code. Read error.message for the original reason.',
  },
]
