import type { ErrorPattern } from './types'

// Google APIs (gaxios): the adapter uses errors[0].reason, else error.status
// (gRPC-style, e.g. PERMISSION_DENIED), else GOOGLE_<status>. OAuth2 token
// errors use the RFC 6749 error strings (invalid_grant, …).
export const googlePatterns: ErrorPattern[] = [
  // --- Drive / Calendar / Admin SDK reasons ---
  {
    key: 'rateLimitExceeded',
    dependency: 'google',
    hint: 'Google rate limit hit',
    hintDetail:
      'Too many requests to the Google API. The rate-limit service retries with backoff; reduce concurrency if frequent.',
    retryable: true,
  },
  {
    key: 'userRateLimitExceeded',
    dependency: 'google',
    hint: 'Google per-user limit hit',
    hintDetail:
      'Too many requests for one user. Spread work over time or across users.',
    retryable: true,
  },
  {
    key: 'sharingRateLimitExceeded',
    dependency: 'google',
    hint: 'Google sharing limit hit',
    hintDetail:
      'Too many share operations (tied to email limits). Avoid bulk sharing with notifications; use domain-wide delegation and quotaUser.',
    retryable: true,
  },
  {
    key: 'dailyLimitExceeded',
    dependency: 'google',
    hint: 'Google daily quota used up',
    hintDetail:
      'The project reached its daily API quota. Raise the "Queries per day" cap in Google Cloud console.',
    category: 'config',
  },
  {
    key: 'quotaExceeded',
    dependency: 'google',
    hint: 'Google quota exceeded',
    hintDetail:
      'A Google usage limit was hit (Calendar usage limits, Drive quota). Check quotas in Google Cloud console and the Workspace admin limits.',
    retryable: true,
  },
  {
    key: 'RESOURCE_EXHAUSTED',
    dependency: 'google',
    hint: 'Google quota exhausted',
    hintDetail:
      'The project quota for this API is used up. Check quotas in Google Cloud console.',
    retryable: true,
  },
  {
    key: 'storageQuotaExceeded',
    dependency: 'google',
    hint: 'Google Drive storage full',
    hintDetail:
      'The Drive owner has no storage left. Free space or buy storage; a service account cannot own files, use a shared drive.',
    category: 'config',
  },
  {
    key: 'backendError',
    dependency: 'google',
    hint: 'Google backend error',
    hintDetail: 'Google failed on its side. Usually temporary; retry.',
    retryable: true,
  },
  {
    key: 'internalError',
    dependency: 'google',
    hint: 'Google internal error',
    hintDetail:
      'Google failed on its side (500). Usually temporary; retry with backoff.',
    retryable: true,
  },
  {
    key: 'authError',
    dependency: 'google',
    hint: 'Google token invalid',
    hintDetail:
      'The access token is expired or invalid, or lacks the required scopes. Refresh it; if that fails, run the OAuth flow again.',
    level: 'warn',
  },
  {
    key: 'unauthorized',
    dependency: 'google',
    hint: 'Google auth missing',
    hintDetail:
      'The request had no valid credentials. Check the service account or the user token.',
    category: 'config',
  },
  {
    key: 'forbidden',
    dependency: 'google',
    hint: 'Google access denied',
    hintDetail:
      'The account lacks permission, or the user is not in the managed domain. Check sharing and domain-wide delegation.',
    category: 'config',
  },
  {
    key: 'insufficientPermissions',
    dependency: 'google',
    hint: 'Google scope missing',
    hintDetail:
      'The token does not carry the OAuth scope this API call needs. Add the scope to the consent/delegation and re-authorize.',
    category: 'config',
  },
  {
    key: 'insufficientFilePermissions',
    dependency: 'google',
    hint: 'No write access to file',
    hintDetail:
      'The user can read but not edit this Drive file. Ask the owner for edit access, or check the service account sharing.',
    level: 'warn',
  },
  {
    key: 'appNotAuthorizedToFile',
    dependency: 'google',
    hint: 'App not authorized on file',
    hintDetail:
      'With drive.file scope the app may only touch files it created or the user picked. Use the broader drive scope or the Picker.',
    category: 'config',
  },
  {
    key: 'domainPolicy',
    dependency: 'google',
    hint: 'Google domain policy blocks',
    hintDetail:
      'The Workspace admin disabled this API/app for the domain. The user must request access from the admin.',
    category: 'config',
  },
  {
    key: 'accessNotConfigured',
    dependency: 'google',
    hint: 'Google API not enabled',
    hintDetail:
      'The API is not enabled for this Google Cloud project. Enable it in the console (APIs & Services).',
    category: 'config',
  },
  {
    key: 'keyInvalid',
    dependency: 'google',
    hint: 'Google API key invalid',
    hintDetail: 'The API key is wrong or deleted. Check the key in env.',
    category: 'config',
  },
  {
    key: 'ipRefererBlocked',
    dependency: 'google',
    hint: 'Google API key restricted',
    hintDetail:
      'The API key restrictions (IP/referrer) block this server. Adjust the key restrictions.',
    category: 'config',
  },
  {
    key: 'notFound',
    dependency: 'google',
    hint: 'Google resource not found',
    hintDetail:
      'The file, drive or event does not exist or is not shared with the service account. For shared drives pass supportsAllDrives.',
    level: 'warn',
  },
  {
    key: 'badRequest',
    dependency: 'google',
    hint: 'Google rejected request',
    hintDetail:
      'A parameter is missing or invalid (see message), e.g. a duplicate parent or a parent cycle.',
    level: 'warn',
  },
  {
    key: 'invalid',
    dependency: 'google',
    hint: 'Google parameter invalid',
    hintDetail:
      'A request value is invalid (see message): wrong format, unknown field, bad date.',
    level: 'warn',
  },
  {
    key: 'invalidParameter',
    dependency: 'google',
    hint: 'Google parameter invalid',
    hintDetail: 'A query parameter has an invalid value (see message).',
    level: 'warn',
  },
  {
    key: 'required',
    dependency: 'google',
    hint: 'Google field required',
    hintDetail:
      'A required field is missing from the request body (see message).',
    level: 'warn',
  },
  {
    key: 'parseError',
    dependency: 'google',
    hint: 'Google could not parse body',
    hintDetail: 'The request body is not valid JSON or has the wrong shape.',
    category: 'bug',
  },
  {
    key: 'duplicate',
    dependency: 'google',
    hint: 'Google resource exists',
    hintDetail:
      'An entity with this id already exists (event id, user key). Generate a new id or update instead.',
    level: 'warn',
  },
  {
    key: 'conflict',
    dependency: 'google',
    hint: 'Google batch conflict',
    hintDetail:
      'A batch item conflicts with another in the same batch. Retry the item alone.',
    retryable: true,
  },
  {
    key: 'conditionNotMet',
    dependency: 'google',
    hint: 'Google ETag outdated',
    hintDetail:
      'The If-Match ETag is stale: the resource changed. Re-fetch and reapply the change.',
    level: 'warn',
  },
  {
    key: 'fullSyncRequired',
    dependency: 'google',
    hint: 'Google sync token expired',
    hintDetail:
      'The syncToken is no longer valid. Clear local state and do a full sync.',
    category: 'data',
  },
  {
    key: 'updatedMinTooLongAgo',
    dependency: 'google',
    hint: 'Google updatedMin too old',
    hintDetail:
      'updatedMin is too far in the past for incremental sync. Do a full sync.',
    category: 'data',
  },
  {
    key: 'deleted',
    dependency: 'google',
    hint: 'Google resource deleted',
    hintDetail: 'The resource was already deleted (410). Nothing to do.',
    level: 'warn',
  },
  {
    key: 'forbiddenForNonOrganizer',
    dependency: 'google',
    hint: 'Only organizer may edit',
    hintDetail:
      'A non-organizer tried to change shared event fields. Use events.patch or edit the organizer copy.',
    level: 'warn',
  },
  {
    key: 'calendarUsageLimitsExceeded',
    dependency: 'google',
    hint: 'Calendar usage limit hit',
    hintDetail:
      'Google Calendar usage limits were exceeded (invites, events per day). Reduce the volume.',
    retryable: true,
  },
  {
    key: 'fileNotDownloadable',
    dependency: 'google',
    hint: 'Google file not downloadable',
    hintDetail:
      'Native Google Docs must be exported, not downloaded. Use the export endpoint with a target MIME type.',
    category: 'bug',
  },
  {
    key: 'exportSizeLimitExceeded',
    dependency: 'google',
    hint: 'Google export too large',
    hintDetail:
      'The exported document exceeds the 10 MB export limit. Export in parts or another format.',
    level: 'warn',
  },
  {
    key: 'downloadQuotaExceeded',
    dependency: 'google',
    hint: 'Google download quota hit',
    hintDetail:
      'The file was downloaded too often today. Wait, or copy the file.',
    retryable: true,
  },
  {
    key: 'cannotDownloadAbusiveFile',
    dependency: 'google',
    hint: 'Google flagged file',
    hintDetail:
      'Google flagged the file as abusive; pass acknowledgeAbuse=true to download it anyway.',
    level: 'warn',
  },
  {
    key: 'teamDriveMembershipRequired',
    dependency: 'google',
    hint: 'Not a shared drive member',
    hintDetail:
      'The user/service account is not a member of the shared drive. Add it with the needed role.',
    category: 'config',
  },
  {
    key: 'cannotModifyInheritedTeamDrivePermission',
    dependency: 'google',
    hint: 'Inherited permission locked',
    hintDetail:
      'Shared-drive permissions inherited from a parent cannot be changed on the child. Change the parent.',
    level: 'warn',
  },
  {
    key: 'numChildrenInNonRootLimitExceeded',
    dependency: 'google',
    hint: 'Drive folder too full',
    hintDetail:
      'A folder may hold at most 500,000 direct children. Split the folder.',
    category: 'data',
  },
  {
    key: 'teamDriveFileLimitExceeded',
    dependency: 'google',
    hint: 'Shared drive item limit',
    hintDetail:
      'The shared drive reached its item limit. Archive or move files.',
    category: 'data',
  },
  {
    key: 'invalidSharingRequest',
    dependency: 'google',
    hint: 'Google sharing rejected',
    hintDetail:
      'The share is not allowed (domain sharing settings) or the notification email failed. Check the recipient and settings.',
    level: 'warn',
  },
  {
    key: 'invalid_grant',
    dependency: 'google',
    hint: 'Google token invalid',
    hintDetail:
      'The refresh token or auth code was revoked, expired or already used. The user must sign in with Google again.',
    level: 'warn',
  },
  // --- OAuth 2.0 (RFC 6749) ---
  {
    key: 'invalid_client',
    dependency: 'google',
    hint: 'Google OAuth client invalid',
    hintDetail:
      'The OAuth client id/secret is wrong or deleted. Check the Google OAuth credentials in env.',
    category: 'config',
  },
  {
    key: 'deleted_client',
    dependency: 'google',
    hint: 'Google OAuth client deleted',
    hintDetail:
      'The OAuth client was deleted in Google Cloud. Restore it (within 30 days) or create a new one.',
    category: 'config',
  },
  {
    key: 'invalid_request',
    dependency: 'google',
    hint: 'Google OAuth request invalid',
    hintDetail:
      'The token request is malformed or missing a parameter (code, redirect_uri, grant_type).',
    category: 'bug',
  },
  {
    key: 'redirect_uri_mismatch',
    dependency: 'google',
    hint: 'OAuth redirect URI mismatch',
    hintDetail:
      'The redirect_uri is not in the OAuth client authorized list, or differs from the one used to get the code. Check the env URL.',
    category: 'config',
  },
  {
    key: 'unauthorized_client',
    dependency: 'google',
    hint: 'OAuth client not allowed',
    hintDetail:
      'The client may not use this grant type or scope. For service accounts, domain-wide delegation is missing.',
    category: 'config',
  },
  {
    key: 'access_denied',
    dependency: 'google',
    hint: 'User denied Google access',
    hintDetail:
      'The user cancelled the consent screen, or the Workspace admin blocks the app.',
    level: 'warn',
  },
  {
    key: 'admin_policy_enforced',
    dependency: 'google',
    hint: 'Workspace policy blocks app',
    hintDetail:
      'The Workspace admin policy forbids one of the requested scopes. Ask the admin to allow the app.',
    category: 'config',
  },
  {
    key: 'org_internal',
    dependency: 'google',
    hint: 'OAuth app is internal-only',
    hintDetail:
      'The OAuth client is restricted to the organization; an outside account tried to sign in.',
    level: 'warn',
  },
  {
    key: 'invalid_scope',
    dependency: 'google',
    hint: 'OAuth scope invalid',
    hintDetail:
      'A requested scope is unknown or not allowed for this client. Check the scope list.',
    category: 'config',
  },
  {
    key: 'unsupported_grant_type',
    dependency: 'google',
    hint: 'OAuth grant type invalid',
    hintDetail: 'The grant_type is not supported. Check the token request.',
    category: 'bug',
  },
  {
    key: 'invalid_token',
    dependency: 'google',
    hint: 'Google access token invalid',
    hintDetail:
      'The bearer token is expired, revoked or malformed. Refresh it.',
    level: 'warn',
  },
  {
    key: 'insufficient_scope',
    dependency: 'google',
    hint: 'Google token lacks scope',
    hintDetail:
      'The token does not include the scope this API needs. Re-authorize with the scope added.',
    category: 'config',
  },
  // --- gRPC-style status (error.status) ---
  {
    key: 'INVALID_ARGUMENT',
    dependency: 'google',
    hint: 'Google argument invalid',
    hintDetail: 'A request field is invalid (see message).',
    level: 'warn',
  },
  {
    key: 'FAILED_PRECONDITION',
    dependency: 'google',
    hint: 'Google precondition failed',
    hintDetail:
      'The resource is in a state that does not allow this operation (see message).',
    level: 'warn',
  },
  {
    key: 'OUT_OF_RANGE',
    dependency: 'google',
    hint: 'Google value out of range',
    hintDetail:
      'A value (page size, offset, date) is outside the allowed range.',
    level: 'warn',
  },
  {
    key: 'UNAUTHENTICATED',
    dependency: 'google',
    hint: 'Google auth missing',
    hintDetail:
      'No valid credentials were sent. Check the service account key or token.',
    category: 'config',
  },
  {
    key: 'PERMISSION_DENIED',
    dependency: 'google',
    hint: 'Google permission denied',
    hintDetail:
      'The caller lacks permission for this resource, or the API is not enabled for the project.',
    category: 'config',
  },
  {
    key: 'NOT_FOUND',
    dependency: 'google',
    hint: 'Google resource not found',
    hintDetail: 'The resource does not exist or is not visible to the caller.',
    level: 'warn',
  },
  {
    key: 'ALREADY_EXISTS',
    dependency: 'google',
    hint: 'Google resource exists',
    hintDetail: 'A resource with this id already exists.',
    level: 'warn',
  },
  {
    key: 'ABORTED',
    dependency: 'google',
    hint: 'Google operation aborted',
    hintDetail:
      'A concurrency conflict (transaction, ETag) aborted the operation. Retry.',
    retryable: true,
  },
  {
    key: 'UNAVAILABLE',
    dependency: 'google',
    hint: 'Google service unavailable',
    hintDetail:
      'The Google service is temporarily unavailable. Retry with backoff.',
    retryable: true,
  },
  {
    key: 'DEADLINE_EXCEEDED',
    dependency: 'google',
    hint: 'Google request timed out',
    hintDetail:
      'The request exceeded its deadline on the Google side. Retry with backoff.',
    retryable: true,
  },
  {
    key: 'INTERNAL',
    dependency: 'google',
    hint: 'Google internal error',
    hintDetail: 'Google failed internally. Retry with backoff.',
    retryable: true,
  },
  {
    key: 'UNIMPLEMENTED',
    dependency: 'google',
    hint: 'Google method unsupported',
    hintDetail: 'The API method is not implemented or disabled.',
    category: 'bug',
  },
  {
    key: 'CANCELLED',
    dependency: 'google',
    hint: 'Google request cancelled',
    hintDetail: 'The request was cancelled by the caller.',
  },
  {
    key: 'DATA_LOSS',
    dependency: 'google',
    hint: 'Google data loss',
    hintDetail:
      'Unrecoverable data loss or corruption on the Google side. Contact support.',
  },
  // --- fallback by HTTP status ---
  {
    key: 'GOOGLE_400',
    dependency: 'google',
    hint: 'Google rejected request',
    hintDetail:
      'Google answered 400. Read error.message for the invalid parameter.',
    level: 'warn',
  },
  {
    key: 'GOOGLE_401',
    dependency: 'google',
    hint: 'Google auth failed',
    hintDetail:
      'The access token is missing or expired. The auth service should refresh it; check credentials if it persists.',
  },
  {
    key: 'GOOGLE_403',
    dependency: 'google',
    hint: 'Google access denied',
    hintDetail:
      'Google answered 403: no permission, a quota, or the API not enabled. Read error.message.',
    category: 'config',
  },
  {
    key: 'GOOGLE_404',
    dependency: 'google',
    hint: 'Google resource not found',
    hintDetail:
      'Google answered 404: the resource does not exist or is not shared with the caller.',
    level: 'warn',
  },
  {
    key: 'GOOGLE_409',
    dependency: 'google',
    hint: 'Google conflict',
    hintDetail:
      'Google answered 409: the resource already exists or changed concurrently.',
    level: 'warn',
  },
  {
    key: 'GOOGLE_412',
    dependency: 'google',
    hint: 'Google precondition failed',
    hintDetail:
      'Google answered 412: an If-Match condition failed. Re-fetch and retry.',
    level: 'warn',
  },
  {
    key: 'GOOGLE_429',
    dependency: 'google',
    hint: 'Google rate limited',
    hintDetail:
      'Google answered 429. Retry with exponential backoff; reduce concurrency.',
    retryable: true,
  },
  {
    key: 'GOOGLE_500',
    dependency: 'google',
    hint: 'Google backend error',
    hintDetail: 'Google answered 500. Retry with backoff.',
    retryable: true,
  },
  {
    key: 'GOOGLE_502',
    dependency: 'google',
    hint: 'Google gateway error',
    hintDetail: 'Google answered 502. Retry with backoff.',
    retryable: true,
  },
  {
    key: 'GOOGLE_503',
    dependency: 'google',
    hint: 'Google service unavailable',
    hintDetail: 'Google answered 503. Retry with backoff.',
    retryable: true,
  },
  {
    key: 'GOOGLE_504',
    dependency: 'google',
    hint: 'Google gateway timeout',
    hintDetail: 'Google answered 504. Retry with backoff.',
    retryable: true,
  },
]
