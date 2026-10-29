import type { ErrorPattern } from './types'

// Sources:
// - https://docs.aws.amazon.com/AmazonS3/latest/developerguide/ErrorResponses.md (S3 error codes)
// - https://docs.aws.amazon.com/STS/latest/APIReference/CommonErrors.md (common AWS API errors)
// - https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.md (multipart part size limits)
// - https://docs.aws.amazon.com/AmazonS3/latest/userguide/upload-objects.md (5 GB single PUT limit)
// - https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.md (2 KB user metadata limit)
// - https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.md (1,024-byte key limit)
// - https://raw.githubusercontent.com/aws/aws-sdk-js/master/lib/services/s3.js (NotFound/Forbidden/BadRequest on empty bodies)
// - https://raw.githubusercontent.com/smithy-lang/smithy-typescript/main/packages/node-http-handler/src/set-request-timeout.ts (SDK TimeoutError)
// - https://raw.githubusercontent.com/smithy-lang/smithy-typescript/main/packages/core/src/submodules/config/property-provider/ProviderError.ts (ProviderError)
// AWS SDK v3 S3 error codes (S3 API ErrorResponses) plus the SDK/STS client
// errors. aws.provider.ts rethrows as a plain Error with a fixed prefix, so
// the wrapped form is matched by message.
export const s3Patterns: ErrorPattern[] = [
  {
    key: 'NoSuchKey',
    dependency: 's3',
    hint: 'File not found in storage',
    detail:
      'The object key does not exist in the bucket. It may have been deleted or the stored key is wrong.',
    howToFix:
      'Check the stored key against the bucket; treat the file as missing if it was deleted.',
    level: 'warn',
  },
  {
    key: 'NotFound',
    dependency: 's3',
    hint: 'File not found in storage',
    detail:
      'HEAD on the object returned 404. It may have been deleted or the stored key is wrong.',
    howToFix:
      'Check the stored key against the bucket; treat the file as missing if it was deleted.',
    level: 'warn',
  },
  {
    key: 'NoSuchVersion',
    dependency: 's3',
    hint: 'File version not found',
    detail:
      'The object version id does not exist. It was deleted or never existed.',
    howToFix:
      'Check the stored version id, or read the latest version instead.',
    level: 'warn',
  },
  {
    key: 'NoSuchUpload',
    dependency: 's3',
    hint: 'Multipart upload not found',
    detail:
      'The multipart upload id is unknown: it was completed, aborted, or expired by a lifecycle rule.',
    howToFix: 'Start a new upload.',
    level: 'warn',
  },
  {
    key: 'AccessDenied',
    dependency: 's3',
    hint: 'Storage access denied',
    detail: 'The credentials lack permission for this bucket or key.',
    howToFix: 'Check the IAM policy and storage env vars.',
    category: 'config',
  },
  {
    key: 'AccessDeniedException',
    dependency: 's3',
    hint: 'AWS access denied',
    detail: 'The IAM identity may not call this AWS API.',
    howToFix: 'Check the policy attached to the credentials.',
    category: 'config',
  },
  {
    key: 'Forbidden',
    dependency: 's3',
    hint: 'Storage access denied',
    detail:
      'HEAD returned 403: no permission for this key, or the bucket exists in another account.',
    howToFix: 'Check the IAM policy.',
    category: 'config',
  },
  {
    key: 'AllAccessDisabled',
    dependency: 's3',
    hint: 'Bucket access disabled',
    detail:
      'All access to this bucket has been disabled by AWS or the account owner.',
    howToFix:
      'Ask the AWS account owner to restore access, or use another bucket.',
    category: 'config',
  },
  {
    key: 'AccountProblem',
    dependency: 's3',
    hint: 'AWS account problem',
    detail: 'The AWS account has a billing or verification problem.',
    howToFix: 'Contact the AWS admin.',
    category: 'config',
  },
  {
    key: 'NoSuchBucket',
    dependency: 's3',
    hint: 'Storage bucket missing',
    detail: 'The bucket name in env does not exist in this region/account.',
    howToFix: 'Check the bucket name, region and credentials in env.',
    category: 'config',
  },
  {
    key: 'BucketAlreadyExists',
    dependency: 's3',
    hint: 'Bucket name taken',
    detail: 'Bucket names are global; this one belongs to another account.',
    howToFix: 'Choose another name.',
    category: 'config',
  },
  {
    key: 'BucketAlreadyOwnedByYou',
    dependency: 's3',
    hint: 'Bucket already exists',
    detail: 'createBucket ran for a bucket this account already owns.',
    howToFix: 'No action needed; this is safe to ignore.',
    level: 'warn',
  },
  {
    key: 'BucketNotEmpty',
    dependency: 's3',
    hint: 'Bucket not empty',
    detail:
      'deleteBucket needs an empty bucket, and this one still holds objects.',
    howToFix: 'Delete the objects (and versions) first.',
    level: 'warn',
  },
  {
    key: 'InvalidBucketName',
    dependency: 's3',
    hint: 'Invalid bucket name',
    detail:
      'The bucket name breaks the naming rules (uppercase, underscore, too long).',
    howToFix: 'Check the bucket name env var.',
    category: 'config',
  },
  {
    key: 'PermanentRedirect',
    dependency: 's3',
    hint: 'Bucket in another region',
    detail: 'The bucket lives in a different region than the client.',
    howToFix: 'Set the region env var to the bucket region.',
    category: 'config',
  },
  {
    key: 'TemporaryRedirect',
    dependency: 's3',
    hint: 'Bucket endpoint redirect',
    detail: 'S3 asks to use another endpoint (new bucket DNS propagation).',
    howToFix: 'Retry shortly.',
    retryable: true,
  },
  {
    key: 'AuthorizationHeaderMalformed',
    dependency: 's3',
    hint: 'Storage region mismatch',
    detail:
      'The signature was made for another region than the bucket (or the header is malformed).',
    howToFix: 'Set the region env var to the bucket region.',
    category: 'config',
  },
  {
    key: 'SignatureDoesNotMatch',
    dependency: 's3',
    hint: 'Storage credentials invalid',
    detail:
      'The signature S3 computed differs from the one sent: a wrong secret key, or the request changed after signing (proxy, header).',
    howToFix: 'Check storage credentials in env.',
    category: 'config',
  },
  {
    key: 'InvalidSignatureException',
    dependency: 's3',
    hint: 'AWS signature invalid',
    detail: 'The request signature is wrong: bad secret key or a skewed clock.',
    howToFix: 'Check the credentials in env.',
    category: 'config',
  },
  {
    key: 'InvalidAccessKeyId',
    dependency: 's3',
    hint: 'Storage access key unknown',
    detail:
      'The access key id does not exist (deleted, rotated, or from another account).',
    howToFix: 'Check the storage credentials in env.',
    category: 'config',
  },
  {
    key: 'UnrecognizedClientException',
    dependency: 's3',
    hint: 'AWS access key unknown',
    detail: 'The access key id is not recognized.',
    howToFix: 'Check the credentials in env.',
    category: 'config',
  },
  {
    key: 'ExpiredToken',
    dependency: 's3',
    hint: 'Storage session token expired',
    detail: 'The temporary credentials (session token) expired.',
    howToFix: 'Refresh the credentials; check the credential provider.',
    category: 'config',
  },
  {
    key: 'ExpiredTokenException',
    dependency: 's3',
    hint: 'AWS session token expired',
    detail: 'The STS session token expired.',
    howToFix: 'Refresh the credentials.',
    category: 'config',
  },
  {
    key: 'InvalidToken',
    dependency: 's3',
    hint: 'Storage session token invalid',
    detail: 'The session token is malformed or not valid for this region.',
    howToFix: 'Check the credential provider.',
    category: 'config',
  },
  {
    key: 'TokenRefreshRequired',
    dependency: 's3',
    hint: 'Storage token must refresh',
    detail:
      'The token must be refreshed before use. The credential provider is not refreshing it.',
    howToFix:
      'Check the credential provider configuration so it refreshes the token.',
    category: 'config',
  },
  {
    key: 'RequestTimeTooSkewed',
    dependency: 's3',
    hint: 'Server clock skewed',
    detail: 'The request time differs from AWS time by more than 15 minutes.',
    howToFix: 'Fix NTP on the host/node.',
    category: 'config',
  },
  {
    key: 'CredentialsProviderError',
    dependency: 's3',
    hint: 'Storage credentials missing',
    detail:
      'The SDK found no credentials: env vars, profile or IAM role are missing in this environment.',
    howToFix: 'Set the storage credentials.',
    category: 'config',
  },
  {
    key: 'ProviderError',
    dependency: 's3',
    hint: 'AWS credential provider failed',
    detail:
      'A credential/region provider failed (metadata service unreachable, bad profile).',
    howToFix: 'Check the SDK config.',
    category: 'config',
  },
  {
    key: 'SlowDown',
    dependency: 's3',
    hint: 'Storage rate limited',
    detail: 'S3 asked the client to slow down.',
    howToFix: 'Reduce parallel uploads or add backoff.',
    retryable: true,
  },
  {
    key: 'ServiceUnavailable',
    dependency: 's3',
    hint: 'Storage unavailable',
    detail: 'S3 is temporarily unable to handle the request (503).',
    howToFix: 'Retry with backoff.',
    retryable: true,
  },
  {
    key: 'Throttling',
    dependency: 's3',
    hint: 'AWS throttled request',
    detail: 'The AWS API throttled the client.',
    howToFix: 'Retry with backoff; reduce concurrency.',
    retryable: true,
  },
  {
    key: 'ThrottlingException',
    dependency: 's3',
    hint: 'AWS throttled request',
    detail: 'The AWS API throttled the client.',
    howToFix: 'Retry with backoff; reduce concurrency.',
    retryable: true,
  },
  {
    key: 'TooManyRequestsException',
    dependency: 's3',
    hint: 'AWS rate limited',
    detail: 'Too many requests to the AWS API.',
    howToFix: 'Retry with backoff.',
    retryable: true,
  },
  {
    key: 'InternalError',
    dependency: 's3',
    hint: 'Storage internal error',
    detail: 'S3 failed on its side (500).',
    howToFix: 'Retry with backoff.',
    retryable: true,
  },
  {
    key: 'RequestTimeout',
    dependency: 's3',
    hint: 'Storage request timed out',
    detail:
      'S3 closed the socket because no data was read or written within its timeout: a stalled body stream or a slow network.',
    howToFix: 'Retry the transfer.',
    retryable: true,
  },
  {
    key: 'TimeoutError',
    dependency: 's3',
    hint: 'Storage request timed out',
    detail:
      'An SDK timeout (connection, request or socket) elapsed before S3 answered: a slow network, an unreachable endpoint or a large transfer.',
    howToFix: 'Retry, or raise the timeout for big uploads.',
    retryable: true,
  },
  {
    key: 'EntityTooLarge',
    dependency: 's3',
    hint: 'Upload too large',
    detail: 'The object exceeds the 5 GB limit of a single PUT.',
    howToFix: 'Use multipart upload (lib-storage Upload) for large files.',
    category: 'bug',
  },
  {
    key: 'EntityTooSmall',
    dependency: 's3',
    hint: 'Multipart part too small',
    detail: 'A multipart part other than the last is under the 5 MB minimum.',
    howToFix: 'Raise the part size.',
    category: 'bug',
  },
  {
    key: 'InvalidPart',
    dependency: 's3',
    hint: 'Multipart part missing',
    detail:
      'completeMultipartUpload listed a part that was not uploaded or whose ETag does not match.',
    howToFix: 'List only uploaded parts, with the ETags S3 returned for them.',
    category: 'bug',
  },
  {
    key: 'InvalidPartOrder',
    dependency: 's3',
    hint: 'Multipart parts out of order',
    detail: 'The parts were not listed in ascending part number.',
    howToFix: 'Sort the parts by part number before completing.',
    category: 'bug',
  },
  {
    key: 'InvalidObjectState',
    dependency: 's3',
    hint: 'File is archived',
    detail:
      'The operation is not valid for the object state, usually because it is archived (Glacier, Deep Archive).',
    howToFix: 'Restore the object before reading it; check the lifecycle rule.',
    category: 'config',
  },
  {
    key: 'InvalidRange',
    dependency: 's3',
    hint: 'Byte range invalid',
    detail: 'The Range header is beyond the object size.',
    howToFix: 'Check the range calculation.',
    level: 'warn',
  },
  {
    key: 'PreconditionFailed',
    dependency: 's3',
    hint: 'Storage precondition failed',
    detail:
      'An If-Match/If-None-Match condition did not hold: the object changed.',
    howToFix: 'Re-read and retry.',
    level: 'warn',
  },
  {
    key: 'ConditionalRequestConflict',
    dependency: 's3',
    hint: 'Concurrent storage write',
    detail:
      'Another conditional write to the same key happened at the same time.',
    howToFix:
      'Retry PutObject; for a multipart upload, start a new CreateMultipartUpload and upload every part again.',
    retryable: true,
  },
  {
    key: 'KeyTooLongError',
    dependency: 's3',
    hint: 'Object key too long',
    detail: 'The object key exceeds the 1024-byte limit.',
    howToFix: 'Shorten the generated key (hash the file name).',
    category: 'bug',
  },
  {
    key: 'MetadataTooLarge',
    dependency: 's3',
    hint: 'Object metadata too large',
    detail: 'The user metadata exceeds the 2 KB limit.',
    howToFix: 'Store large attributes elsewhere.',
    category: 'bug',
  },
  {
    key: 'MissingContentLength',
    dependency: 's3',
    hint: 'Content-Length missing',
    detail:
      'PutObject needs a known body length: a stream without ContentLength was passed.',
    howToFix: 'Use lib-storage Upload for streams.',
    category: 'bug',
  },
  {
    key: 'IncompleteBody',
    dependency: 's3',
    hint: 'Upload body truncated',
    detail:
      'Fewer bytes arrived than Content-Length declared: the source stream ended early.',
    howToFix: 'Retry the upload.',
    retryable: true,
  },
  {
    key: 'BadDigest',
    dependency: 's3',
    hint: 'Upload checksum mismatch',
    detail:
      'The Content-MD5 or checksum sent does not match the body S3 received: the body changed or was corrupted in transit.',
    howToFix: 'Retry the upload.',
    retryable: true,
  },
  {
    key: 'InvalidDigest',
    dependency: 's3',
    hint: 'Content-MD5 malformed',
    detail: 'The Content-MD5 or checksum header value is not valid.',
    howToFix: 'Check how the checksum is computed.',
    category: 'bug',
  },
  {
    key: 'XAmzContentSHA256Mismatch',
    dependency: 's3',
    hint: 'Payload hash mismatch',
    detail:
      'The x-amz-content-sha256 header does not match the body: the body was modified after signing (a retry re-read a consumed stream).',
    howToFix: 'Send a fresh, unmodified body on each attempt.',
    category: 'bug',
  },
  {
    key: 'InvalidArgument',
    dependency: 's3',
    hint: 'Invalid storage argument',
    detail:
      'A request parameter is invalid (see message): bad ACL, metadata header, or storage class.',
    howToFix: 'Correct the parameter named in error.message.',
    category: 'bug',
  },
  {
    key: 'InvalidRequest',
    dependency: 's3',
    hint: 'Invalid storage request',
    detail:
      'The request is not valid for this operation (see message), e.g. SSE headers on a copy, or SigV2 where SigV4 is required.',
    howToFix:
      'Change the request to what this operation accepts, as error.message describes.',
    category: 'bug',
  },
  {
    key: 'MalformedXML',
    dependency: 's3',
    hint: 'Malformed request XML',
    detail: 'The request body XML is invalid (empty Delete list, bad tagging).',
    howToFix: 'Check the parameters.',
    category: 'bug',
  },
  {
    key: 'MethodNotAllowed',
    dependency: 's3',
    hint: 'Storage method not allowed',
    detail:
      'The HTTP method is not valid for this resource, e.g. GET on a delete marker.',
    howToFix:
      'Use an operation the resource supports; check for delete markers on versioned keys.',
    category: 'bug',
  },
  {
    key: 'NotImplemented',
    dependency: 's3',
    hint: 'Storage feature unsupported',
    detail:
      'A header in the request implies functionality the endpoint does not implement (common on S3-compatible stores such as MinIO, Ceph).',
    howToFix:
      'Avoid this header or operation, or use an endpoint that supports it.',
    category: 'config',
  },
  {
    key: 'OperationAborted',
    dependency: 's3',
    hint: 'Conflicting bucket operation',
    detail:
      'A conflicting conditional operation is in progress on this bucket or object.',
    howToFix: 'Retry the operation.',
    retryable: true,
  },
  {
    key: 'BadRequest',
    dependency: 's3',
    hint: 'Storage rejected request',
    detail:
      'HEAD returned 400: usually a region/endpoint mismatch or an invalid key.',
    howToFix: 'Check the region and endpoint env vars and the object key.',
    category: 'config',
  },
  {
    key: 'ValidationException',
    dependency: 's3',
    hint: 'AWS parameter invalid',
    detail: 'The AWS API rejected a parameter (see message).',
    howToFix: 'Correct the parameter named in error.message.',
    category: 'bug',
  },
  {
    key: 'ObjectLockConfigurationNotFoundError',
    dependency: 's3',
    hint: 'Object lock not enabled',
    detail: 'The bucket has no Object Lock configuration.',
    howToFix: 'Enable Object Lock on the bucket, or skip the Object Lock call.',
    category: 'config',
  },
  {
    key: 'NoSuchLifecycleConfiguration',
    dependency: 's3',
    hint: 'No lifecycle rules',
    detail: 'The bucket has no lifecycle configuration.',
    howToFix:
      'Treat it as no rules, or add a lifecycle configuration if one is expected.',
    level: 'warn',
  },
  {
    key: 'NoSuchCORSConfiguration',
    dependency: 's3',
    hint: 'No CORS configuration',
    detail: 'The bucket has no CORS rules.',
    howToFix:
      'Treat it as no rules, or add a CORS configuration if browsers need access.',
    level: 'warn',
  },
  {
    key: 'NoSuchTagSet',
    dependency: 's3',
    hint: 'No tags on object',
    detail: 'The object or bucket has no tag set.',
    howToFix: 'Treat it as no tags, or add tags if they are expected.',
    level: 'warn',
  },
  {
    key: 'S3_WRAPPED_ERROR',
    messageMatch:
      /^(Error (putting|uploading|deleting|getting|copying|downloading|moving|checking) file|Get meta error)/,
    hint: 'Storage operation failed',
    detail: 'aws.provider rethrew the S3 error without its code.',
    howToFix: 'Read error.message for the original reason.',
  },
  {
    key: 'S3_STREAM_NOT_READABLE',
    messageMatch:
      /^(Stream is not readable|The stream has already been consumed)/i,
    hint: 'Upload stream consumed',
    detail:
      'The body stream was read before the upload (or retried after a failed attempt).',
    howToFix: 'Create a fresh stream per attempt.',
    category: 'bug',
  },
]
