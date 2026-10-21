import type { ErrorPattern } from './types'

// AWS SDK v3 S3 error codes (S3 API ErrorResponses) plus the SDK/STS client
// errors. aws.provider.ts rethrows as a plain Error with a fixed prefix, so
// the wrapped form is matched by message.
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
    key: 'NoSuchVersion',
    dependency: 's3',
    hint: 'File version not found',
    hintDetail:
      'The object version id does not exist. It was deleted or never existed.',
    level: 'warn',
  },
  {
    key: 'NoSuchUpload',
    dependency: 's3',
    hint: 'Multipart upload not found',
    hintDetail:
      'The multipart upload id is unknown: it was completed, aborted, or expired by a lifecycle rule. Start a new upload.',
    level: 'warn',
  },
  {
    key: 'AccessDenied',
    dependency: 's3',
    hint: 'Storage access denied',
    hintDetail:
      'The credentials lack permission for this bucket or key. Check the IAM policy and storage env vars.',
    category: 'config',
  },
  {
    key: 'AccessDeniedException',
    dependency: 's3',
    hint: 'AWS access denied',
    hintDetail:
      'The IAM identity may not call this AWS API. Check the policy attached to the credentials.',
    category: 'config',
  },
  {
    key: 'Forbidden',
    dependency: 's3',
    hint: 'Storage access denied',
    hintDetail:
      'HEAD returned 403: no permission for this key, or the bucket exists in another account. Check the IAM policy.',
    category: 'config',
  },
  {
    key: 'AllAccessDisabled',
    dependency: 's3',
    hint: 'Bucket access disabled',
    hintDetail:
      'All access to this bucket has been disabled by AWS or the account owner.',
    category: 'config',
  },
  {
    key: 'AccountProblem',
    dependency: 's3',
    hint: 'AWS account problem',
    hintDetail:
      'The AWS account has a billing or verification problem. Contact the AWS admin.',
    category: 'config',
  },
  {
    key: 'NoSuchBucket',
    dependency: 's3',
    hint: 'Storage bucket missing',
    hintDetail: 'The bucket name in env does not exist in this region/account.',
    category: 'config',
  },
  {
    key: 'BucketAlreadyExists',
    dependency: 's3',
    hint: 'Bucket name taken',
    hintDetail:
      'Bucket names are global; this one belongs to another account. Choose another name.',
    category: 'config',
  },
  {
    key: 'BucketAlreadyOwnedByYou',
    dependency: 's3',
    hint: 'Bucket already exists',
    hintDetail:
      'createBucket ran for a bucket this account already owns. Safe to ignore.',
    level: 'warn',
  },
  {
    key: 'BucketNotEmpty',
    dependency: 's3',
    hint: 'Bucket not empty',
    hintDetail:
      'deleteBucket needs an empty bucket. Delete the objects (and versions) first.',
    level: 'warn',
  },
  {
    key: 'InvalidBucketName',
    dependency: 's3',
    hint: 'Invalid bucket name',
    hintDetail:
      'The bucket name breaks the naming rules (uppercase, underscore, too long). Check the env var.',
    category: 'config',
  },
  {
    key: 'PermanentRedirect',
    dependency: 's3',
    hint: 'Bucket in another region',
    hintDetail:
      'The bucket lives in a different region than the client. Set the region env var to the bucket region.',
    category: 'config',
  },
  {
    key: 'TemporaryRedirect',
    dependency: 's3',
    hint: 'Bucket endpoint redirect',
    hintDetail:
      'S3 asks to use another endpoint (new bucket DNS propagation). Retry shortly.',
    retryable: true,
  },
  {
    key: 'AuthorizationHeaderMalformed',
    dependency: 's3',
    hint: 'Storage region mismatch',
    hintDetail:
      'The signature was made for another region than the bucket (or the header is malformed). Set the region env var to the bucket region.',
    category: 'config',
  },
  {
    key: 'SignatureDoesNotMatch',
    dependency: 's3',
    hint: 'Storage credentials invalid',
    hintDetail:
      'The secret key is wrong or the server clock is skewed. Check storage credentials in env.',
    category: 'config',
  },
  {
    key: 'InvalidSignatureException',
    dependency: 's3',
    hint: 'AWS signature invalid',
    hintDetail:
      'The request signature is wrong: bad secret key or a skewed clock. Check the credentials in env.',
    category: 'config',
  },
  {
    key: 'InvalidAccessKeyId',
    dependency: 's3',
    hint: 'Storage access key unknown',
    hintDetail:
      'The access key id does not exist (deleted, rotated, or from another account). Check the storage credentials in env.',
    category: 'config',
  },
  {
    key: 'UnrecognizedClientException',
    dependency: 's3',
    hint: 'AWS access key unknown',
    hintDetail:
      'The access key id is not recognized. Check the credentials in env.',
    category: 'config',
  },
  {
    key: 'ExpiredToken',
    dependency: 's3',
    hint: 'Storage session token expired',
    hintDetail:
      'The temporary credentials (session token) expired. Refresh them; check the credential provider.',
    category: 'config',
  },
  {
    key: 'ExpiredTokenException',
    dependency: 's3',
    hint: 'AWS session token expired',
    hintDetail: 'The STS session token expired. Refresh the credentials.',
    category: 'config',
  },
  {
    key: 'InvalidToken',
    dependency: 's3',
    hint: 'Storage session token invalid',
    hintDetail:
      'The session token is malformed or not valid for this region. Check the credential provider.',
    category: 'config',
  },
  {
    key: 'TokenRefreshRequired',
    dependency: 's3',
    hint: 'Storage token must refresh',
    hintDetail:
      'The token must be refreshed before use. The credential provider is not refreshing it.',
    category: 'config',
  },
  {
    key: 'RequestTimeTooSkewed',
    dependency: 's3',
    hint: 'Server clock skewed',
    hintDetail:
      'The request time differs from AWS time by more than 15 minutes. Fix NTP on the host/node.',
    category: 'config',
  },
  {
    key: 'CredentialsProviderError',
    dependency: 's3',
    hint: 'Storage credentials missing',
    hintDetail:
      'The SDK found no credentials: env vars, profile or IAM role are missing in this environment. Set the storage credentials.',
    category: 'config',
  },
  {
    key: 'ProviderError',
    dependency: 's3',
    hint: 'AWS credential provider failed',
    hintDetail:
      'A credential/region provider failed (metadata service unreachable, bad profile). Check the SDK config.',
    category: 'config',
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
    key: 'ServiceUnavailable',
    dependency: 's3',
    hint: 'Storage unavailable',
    hintDetail:
      'S3 is temporarily unable to handle the request (503). Retry with backoff.',
    retryable: true,
  },
  {
    key: 'Throttling',
    dependency: 's3',
    hint: 'AWS throttled request',
    hintDetail:
      'The AWS API throttled the client. Retry with backoff; reduce concurrency.',
    retryable: true,
  },
  {
    key: 'ThrottlingException',
    dependency: 's3',
    hint: 'AWS throttled request',
    hintDetail:
      'The AWS API throttled the client. Retry with backoff; reduce concurrency.',
    retryable: true,
  },
  {
    key: 'TooManyRequestsException',
    dependency: 's3',
    hint: 'AWS rate limited',
    hintDetail: 'Too many requests to the AWS API. Retry with backoff.',
    retryable: true,
  },
  {
    key: 'InternalError',
    dependency: 's3',
    hint: 'Storage internal error',
    hintDetail: 'S3 failed on its side (500). Retry with backoff.',
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
    key: 'TimeoutError',
    dependency: 's3',
    hint: 'Storage request timed out',
    hintDetail:
      'The SDK requestTimeout elapsed before S3 answered. Large files or a slow network; retry, or raise the timeout for big uploads.',
    retryable: true,
  },
  {
    key: 'EntityTooLarge',
    dependency: 's3',
    hint: 'Upload too large',
    hintDetail:
      'A single PUT is limited to 5 GB. Use multipart upload (lib-storage Upload) for large files.',
    category: 'bug',
  },
  {
    key: 'EntityTooSmall',
    dependency: 's3',
    hint: 'Multipart part too small',
    hintDetail:
      'Every part except the last must be at least 5 MB. Raise the part size.',
    category: 'bug',
  },
  {
    key: 'InvalidPart',
    dependency: 's3',
    hint: 'Multipart part missing',
    hintDetail:
      'completeMultipartUpload listed a part that was not uploaded or whose ETag does not match.',
    category: 'bug',
  },
  {
    key: 'InvalidPartOrder',
    dependency: 's3',
    hint: 'Multipart parts out of order',
    hintDetail:
      'Parts must be listed in ascending part number. Sort them before completing.',
    category: 'bug',
  },
  {
    key: 'InvalidObjectState',
    dependency: 's3',
    hint: 'File is archived',
    hintDetail:
      'The object is in Glacier/Deep Archive and must be restored before reading. Check the lifecycle rule.',
    category: 'config',
  },
  {
    key: 'InvalidRange',
    dependency: 's3',
    hint: 'Byte range invalid',
    hintDetail:
      'The Range header is beyond the object size. Check the range calculation.',
    level: 'warn',
  },
  {
    key: 'PreconditionFailed',
    dependency: 's3',
    hint: 'Storage precondition failed',
    hintDetail:
      'An If-Match/If-None-Match condition did not hold: the object changed. Re-read and retry.',
    level: 'warn',
  },
  {
    key: 'ConditionalRequestConflict',
    dependency: 's3',
    hint: 'Concurrent storage write',
    hintDetail:
      'Another conditional write to the same key happened at the same time. Retry.',
    retryable: true,
  },
  {
    key: 'KeyTooLongError',
    dependency: 's3',
    hint: 'Object key too long',
    hintDetail:
      'Keys are limited to 1024 bytes. Shorten the generated key (hash the file name).',
    category: 'bug',
  },
  {
    key: 'MetadataTooLarge',
    dependency: 's3',
    hint: 'Object metadata too large',
    hintDetail:
      'User metadata is limited to 2 KB. Store large attributes elsewhere.',
    category: 'bug',
  },
  {
    key: 'MissingContentLength',
    dependency: 's3',
    hint: 'Content-Length missing',
    hintDetail:
      'PutObject needs a known body length: a stream without ContentLength was passed. Use lib-storage Upload for streams.',
    category: 'bug',
  },
  {
    key: 'IncompleteBody',
    dependency: 's3',
    hint: 'Upload body truncated',
    hintDetail:
      'Fewer bytes arrived than Content-Length declared: the source stream ended early. Retry the upload.',
    retryable: true,
  },
  {
    key: 'BadDigest',
    dependency: 's3',
    hint: 'Upload checksum mismatch',
    hintDetail:
      'The Content-MD5 sent does not match the body. The body changed during upload; retry.',
    retryable: true,
  },
  {
    key: 'InvalidDigest',
    dependency: 's3',
    hint: 'Content-MD5 malformed',
    hintDetail:
      'The Content-MD5 header is not valid base64. Check how the checksum is computed.',
    category: 'bug',
  },
  {
    key: 'XAmzContentSHA256Mismatch',
    dependency: 's3',
    hint: 'Payload hash mismatch',
    hintDetail:
      'The x-amz-content-sha256 header does not match the body: the body was modified after signing (a retry re-read a consumed stream).',
    category: 'bug',
  },
  {
    key: 'InvalidArgument',
    dependency: 's3',
    hint: 'Invalid storage argument',
    hintDetail:
      'A request parameter is invalid (see message): bad ACL, metadata header, or storage class.',
    category: 'bug',
  },
  {
    key: 'InvalidRequest',
    dependency: 's3',
    hint: 'Invalid storage request',
    hintDetail:
      'The request is not valid for this operation (see message), e.g. SSE headers on a copy, or SigV2 where SigV4 is required.',
    category: 'bug',
  },
  {
    key: 'MalformedXML',
    dependency: 's3',
    hint: 'Malformed request XML',
    hintDetail:
      'The request body XML is invalid (empty Delete list, bad tagging). Check the parameters.',
    category: 'bug',
  },
  {
    key: 'MethodNotAllowed',
    dependency: 's3',
    hint: 'Storage method not allowed',
    hintDetail:
      'The HTTP method is not valid for this resource, e.g. GET on a delete marker.',
    category: 'bug',
  },
  {
    key: 'NotImplemented',
    dependency: 's3',
    hint: 'Storage feature unsupported',
    hintDetail:
      'The S3-compatible endpoint (MinIO, Ceph) does not implement this header or operation.',
    category: 'config',
  },
  {
    key: 'OperationAborted',
    dependency: 's3',
    hint: 'Conflicting bucket operation',
    hintDetail: 'Another operation on the bucket conflicted. Retry.',
    retryable: true,
  },
  {
    key: 'BadRequest',
    dependency: 's3',
    hint: 'Storage rejected request',
    hintDetail:
      'HEAD returned 400: usually a region/endpoint mismatch or an invalid key.',
    category: 'config',
  },
  {
    key: 'ValidationException',
    dependency: 's3',
    hint: 'AWS parameter invalid',
    hintDetail: 'The AWS API rejected a parameter (see message).',
    category: 'bug',
  },
  {
    key: 'ObjectLockConfigurationNotFoundError',
    dependency: 's3',
    hint: 'Object lock not enabled',
    hintDetail: 'The bucket has no Object Lock configuration.',
    category: 'config',
  },
  {
    key: 'NoSuchLifecycleConfiguration',
    dependency: 's3',
    hint: 'No lifecycle rules',
    hintDetail: 'The bucket has no lifecycle configuration.',
    level: 'warn',
  },
  {
    key: 'NoSuchCORSConfiguration',
    dependency: 's3',
    hint: 'No CORS configuration',
    hintDetail: 'The bucket has no CORS rules.',
    level: 'warn',
  },
  {
    key: 'NoSuchTagSet',
    dependency: 's3',
    hint: 'No tags on object',
    hintDetail: 'The object or bucket has no tag set.',
    level: 'warn',
  },
  {
    key: 'S3_WRAPPED_ERROR',
    messageMatch:
      /^(Error (putting|uploading|deleting|getting|copying|downloading|moving|checking) file|Get meta error)/,
    hint: 'Storage operation failed',
    hintDetail:
      'aws.provider rethrew the S3 error without its code. Read error.message for the original reason.',
  },
  {
    key: 'S3_STREAM_NOT_READABLE',
    messageMatch:
      /^(Stream is not readable|The stream has already been consumed)/i,
    hint: 'Upload stream consumed',
    hintDetail:
      'The body stream was read before the upload (or retried after a failed attempt). Create a fresh stream per attempt.',
    category: 'bug',
  },
]
