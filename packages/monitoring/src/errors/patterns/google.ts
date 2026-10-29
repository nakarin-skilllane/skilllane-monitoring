import type { ErrorPattern } from './types'

// Sources:
// - https://developers.google.com/workspace/drive/api/guides/handle-errors (Drive error reasons)
// - https://developers.google.com/drive/api/v2/handle-errors (Drive badRequest causes)
// - https://developers.google.com/workspace/drive/api/reference/rest/v3/files/get (acknowledgeAbuse)
// - https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export (10 MB export limit)
// - https://developers.google.com/workspace/calendar/api/guides/errors (Calendar error reasons)
// - https://developers.google.com/youtube/v3/docs/core_errors (global Google API reasons)
// - https://raw.githubusercontent.com/googleapis/googleapis/master/google/rpc/code.proto (gRPC status codes)
// - https://developers.google.com/identity/protocols/oauth2/web-server (Google OAuth errors)
// - https://www.rfc-editor.org/rfc/rfc6749.txt (OAuth 2.0 token errors)
// - https://www.rfc-editor.org/rfc/rfc6750.txt (bearer token errors)
// Google APIs (gaxios): the adapter uses errors[0].reason, else error.status
// (gRPC-style, e.g. PERMISSION_DENIED), else GOOGLE_<status>. OAuth2 token
// errors use the RFC 6749 error strings (invalid_grant, …).
export const googlePatterns: ErrorPattern[] = [
  // --- Drive / Calendar / Admin SDK reasons ---
  {
    key: 'rateLimitExceeded',
    dependency: 'google',
    hint: 'Google rate limit hit',
    detail: 'Too many requests to the Google API.',
    howToFix:
      'The rate-limit service retries with backoff; reduce concurrency if this is frequent.',
    retryable: true,
  },
  {
    key: 'userRateLimitExceeded',
    dependency: 'google',
    hint: 'Google per-user limit hit',
    detail: 'Too many requests for one user.',
    howToFix: 'Spread work over time or across users.',
    retryable: true,
  },
  {
    key: 'sharingRateLimitExceeded',
    dependency: 'google',
    hint: 'Google sharing limit hit',
    detail: 'Too many share operations (tied to email limits).',
    howToFix:
      'Avoid bulk sharing with notifications; use domain-wide delegation and quotaUser.',
    retryable: true,
  },
  {
    key: 'dailyLimitExceeded',
    dependency: 'google',
    hint: 'Google daily quota used up',
    detail: 'The project reached its daily API quota.',
    howToFix: 'Raise the "Queries per day" cap in Google Cloud console.',
    category: 'config',
  },
  {
    key: 'quotaExceeded',
    dependency: 'google',
    hint: 'Google quota exceeded',
    detail:
      'A Google usage limit was hit (Calendar usage limits, Drive quota).',
    howToFix:
      'Check quotas in Google Cloud console and the Workspace admin limits.',
    retryable: true,
  },
  {
    key: 'RESOURCE_EXHAUSTED',
    dependency: 'google',
    hint: 'Google quota exhausted',
    detail:
      'A quota or rate limit for this API was exhausted (per user, per project or per minute).',
    howToFix:
      'Retry with backoff; if it persists, check the quotas in Google Cloud console.',
    retryable: true,
  },
  {
    key: 'storageQuotaExceeded',
    dependency: 'google',
    hint: 'Google Drive storage full',
    detail: 'The Drive owner has no storage left.',
    howToFix:
      'Free space or buy storage; service accounts have no Drive storage, so upload to a shared drive or act for a user.',
    category: 'config',
  },
  {
    key: 'backendError',
    dependency: 'google',
    hint: 'Google backend error',
    detail: 'Google failed on its side. This is usually temporary.',
    howToFix: 'Retry the request.',
    retryable: true,
  },
  {
    key: 'internalError',
    dependency: 'google',
    hint: 'Google internal error',
    detail: 'Google failed on its side (500). This is usually temporary.',
    howToFix: 'Retry with backoff.',
    retryable: true,
  },
  {
    key: 'authError',
    dependency: 'google',
    hint: 'Google token invalid',
    detail:
      'The access token is expired or invalid, or lacks the required scopes.',
    howToFix: 'Refresh the token; if that fails, run the OAuth flow again.',
    level: 'warn',
  },
  {
    key: 'unauthorized',
    dependency: 'google',
    hint: 'Google auth missing',
    detail: 'The request had no valid credentials.',
    howToFix: 'Check the service account or the user token.',
    category: 'config',
  },
  {
    key: 'forbidden',
    dependency: 'google',
    hint: 'Google access denied',
    detail:
      'The account lacks permission, or the user is not in the managed domain.',
    howToFix: 'Check sharing and domain-wide delegation.',
    category: 'config',
  },
  {
    key: 'insufficientPermissions',
    dependency: 'google',
    hint: 'Google scope missing',
    detail:
      'The caller lacks permission for this call, usually because the token lacks a required OAuth scope.',
    howToFix: 'Add the scope to the consent/delegation and re-authorize.',
    category: 'config',
  },
  {
    key: 'insufficientFilePermissions',
    dependency: 'google',
    hint: 'No write access to file',
    detail: 'The user can read but not edit this Drive file.',
    howToFix:
      'Ask the owner for edit access, or check the service account sharing.',
    level: 'warn',
  },
  {
    key: 'appNotAuthorizedToFile',
    dependency: 'google',
    hint: 'App not authorized on file',
    detail:
      'With drive.file scope the app may only touch files it created or the user picked.',
    howToFix: 'Use the broader drive scope or the Picker.',
    category: 'config',
  },
  {
    key: 'domainPolicy',
    dependency: 'google',
    hint: 'Google domain policy blocks',
    detail: 'The Workspace admin disabled this API/app for the domain.',
    howToFix: 'The user must request access from the admin.',
    category: 'config',
  },
  {
    key: 'accessNotConfigured',
    dependency: 'google',
    hint: 'Google API not enabled',
    detail: 'The API is not enabled for this Google Cloud project.',
    howToFix: 'Enable the API in the console (APIs & Services).',
    category: 'config',
  },
  {
    key: 'keyInvalid',
    dependency: 'google',
    hint: 'Google API key invalid',
    detail: 'The API key is wrong or deleted.',
    howToFix: 'Check the key in env.',
    category: 'config',
  },
  {
    key: 'ipRefererBlocked',
    dependency: 'google',
    hint: 'Google API key restricted',
    detail: 'The API key restrictions (IP/referrer) block this server.',
    howToFix: 'Adjust the key restrictions.',
    category: 'config',
  },
  {
    key: 'notFound',
    dependency: 'google',
    hint: 'Google resource not found',
    detail:
      'The file, drive or event does not exist or is not shared with the service account.',
    howToFix:
      'Check the id and its sharing; for shared drives pass supportsAllDrives.',
    level: 'warn',
  },
  {
    key: 'badRequest',
    dependency: 'google',
    hint: 'Google rejected request',
    detail:
      'A parameter is missing or invalid (see message), e.g. a duplicate parent or a parent cycle.',
    howToFix: 'Fix the parameter named in error.message and resend.',
    level: 'warn',
  },
  {
    key: 'invalid',
    dependency: 'google',
    hint: 'Google parameter invalid',
    detail:
      'A request value is invalid (see message): wrong format, unknown field, bad date.',
    howToFix: 'Correct the value named in error.message.',
    level: 'warn',
  },
  {
    key: 'invalidParameter',
    dependency: 'google',
    hint: 'Google parameter invalid',
    detail: 'A query parameter has an invalid value (see message).',
    howToFix: 'Correct the query parameter named in error.message.',
    level: 'warn',
  },
  {
    key: 'required',
    dependency: 'google',
    hint: 'Google field required',
    detail: 'A required field is missing from the request body (see message).',
    howToFix: 'Add the field named in error.message to the request.',
    level: 'warn',
  },
  {
    key: 'parseError',
    dependency: 'google',
    hint: 'Google could not parse body',
    detail: 'The request body is not valid JSON or has the wrong shape.',
    howToFix: 'Check how the request body is built against the API reference.',
    category: 'bug',
  },
  {
    key: 'duplicate',
    dependency: 'google',
    hint: 'Google resource exists',
    detail: 'An entity with this id already exists (event id, user key).',
    howToFix: 'Generate a new id, or update the existing entity instead.',
    level: 'warn',
  },
  {
    key: 'conflict',
    dependency: 'google',
    hint: 'Google batch conflict',
    detail: 'A batch item conflicts with another in the same batch.',
    howToFix: 'Retry the item alone.',
    retryable: true,
  },
  {
    key: 'conditionNotMet',
    dependency: 'google',
    hint: 'Google ETag outdated',
    detail: 'The If-Match ETag is stale: the resource changed.',
    howToFix: 'Re-fetch and reapply the change.',
    level: 'warn',
  },
  {
    key: 'fullSyncRequired',
    dependency: 'google',
    hint: 'Google sync token expired',
    detail: 'The syncToken is no longer valid.',
    howToFix: 'Clear local state and do a full sync.',
    category: 'data',
  },
  {
    key: 'updatedMinTooLongAgo',
    dependency: 'google',
    hint: 'Google updatedMin too old',
    detail: 'updatedMin is too far in the past for incremental sync.',
    howToFix: 'Do a full sync.',
    category: 'data',
  },
  {
    key: 'deleted',
    dependency: 'google',
    hint: 'Google resource deleted',
    detail: 'The resource was already deleted (410).',
    howToFix: 'Nothing to do; treat the resource as gone.',
    level: 'warn',
  },
  {
    key: 'forbiddenForNonOrganizer',
    dependency: 'google',
    hint: 'Only organizer may edit',
    detail: 'A non-organizer tried to change shared event fields.',
    howToFix: 'Use events.patch or edit the organizer copy.',
    level: 'warn',
  },
  {
    key: 'calendarUsageLimitsExceeded',
    dependency: 'google',
    hint: 'Calendar usage limit hit',
    detail:
      'Google Calendar usage limits were exceeded (invites, events per day).',
    howToFix: 'Reduce the volume of invites and events.',
    retryable: true,
  },
  {
    key: 'fileNotDownloadable',
    dependency: 'google',
    hint: 'Google file not downloadable',
    detail: 'Native Google Docs cannot be downloaded; they must be exported.',
    howToFix: 'Use the export endpoint with a target MIME type.',
    category: 'bug',
  },
  {
    key: 'exportSizeLimitExceeded',
    dependency: 'google',
    hint: 'Google export too large',
    detail: 'The exported document exceeds the 10 MB export limit.',
    howToFix: 'Export in parts or another format.',
    level: 'warn',
  },
  {
    key: 'downloadQuotaExceeded',
    dependency: 'google',
    hint: 'Google download quota hit',
    detail: 'The file was downloaded too often today.',
    howToFix: 'Wait, or copy the file.',
    retryable: true,
  },
  {
    key: 'cannotDownloadAbusiveFile',
    dependency: 'google',
    hint: 'Google flagged file',
    detail: 'Google flagged the file as abusive.',
    howToFix:
      'Pass acknowledgeAbuse=true with alt=media; only the file owner or a shared drive organizer may do so.',
    level: 'warn',
  },
  {
    key: 'teamDriveMembershipRequired',
    dependency: 'google',
    hint: 'Not a shared drive member',
    detail: 'The user/service account is not a member of the shared drive.',
    howToFix: 'Add the account to the shared drive with the needed role.',
    category: 'config',
  },
  {
    key: 'cannotModifyInheritedTeamDrivePermission',
    dependency: 'google',
    hint: 'Inherited permission locked',
    detail:
      'Shared-drive permissions inherited from a parent cannot be changed on the child.',
    howToFix: 'Change the permission on the parent.',
    level: 'warn',
  },
  {
    key: 'numChildrenInNonRootLimitExceeded',
    dependency: 'google',
    hint: 'Drive folder too full',
    detail: 'The folder reached the limit of 500,000 direct children.',
    howToFix: 'Split the folder.',
    category: 'data',
  },
  {
    key: 'teamDriveFileLimitExceeded',
    dependency: 'google',
    hint: 'Shared drive item limit',
    detail: 'The shared drive reached its item limit.',
    howToFix: 'Archive or move files.',
    category: 'data',
  },
  {
    key: 'invalidSharingRequest',
    dependency: 'google',
    hint: 'Google sharing rejected',
    detail:
      'The share is not allowed (domain sharing settings) or the notification email failed.',
    howToFix: 'Check the recipient and the sharing settings.',
    level: 'warn',
  },
  {
    key: 'invalid_grant',
    dependency: 'google',
    hint: 'Google token invalid',
    detail:
      'The refresh token or auth code was revoked, expired or already used.',
    howToFix: 'The user must sign in with Google again.',
    level: 'warn',
  },
  // --- OAuth 2.0 (RFC 6749) ---
  {
    key: 'invalid_client',
    dependency: 'google',
    hint: 'Google OAuth client invalid',
    detail: 'The OAuth client id/secret is wrong or deleted.',
    howToFix: 'Check the Google OAuth credentials in env.',
    category: 'config',
  },
  {
    key: 'deleted_client',
    dependency: 'google',
    hint: 'Google OAuth client deleted',
    detail: 'The OAuth client was deleted in Google Cloud.',
    howToFix: 'Restore the client (within 30 days) or create a new one.',
    category: 'config',
  },
  {
    key: 'invalid_request',
    dependency: 'google',
    hint: 'Google OAuth request invalid',
    detail:
      'The token request is malformed or missing a parameter (code, redirect_uri, grant_type).',
    howToFix: 'Check the parameters the token request sends.',
    category: 'bug',
  },
  {
    key: 'redirect_uri_mismatch',
    dependency: 'google',
    hint: 'OAuth redirect URI mismatch',
    detail:
      'The redirect_uri is not in the OAuth client authorized list, or differs from the one used to get the code.',
    howToFix:
      'Check the redirect URL in env against the OAuth client settings.',
    category: 'config',
  },
  {
    key: 'unauthorized_client',
    dependency: 'google',
    hint: 'OAuth client not allowed',
    detail:
      'The client may not use this grant type or scope. For service accounts, domain-wide delegation is missing.',
    howToFix:
      'Allow the grant type and scope for the client, or grant domain-wide delegation to the service account.',
    category: 'config',
  },
  {
    key: 'access_denied',
    dependency: 'google',
    hint: 'User denied Google access',
    detail:
      'The user cancelled the consent screen, or the Workspace admin blocks the app.',
    howToFix:
      'Ask the user to accept the consent screen, or ask the Workspace admin to allow the app.',
    level: 'warn',
  },
  {
    key: 'admin_policy_enforced',
    dependency: 'google',
    hint: 'Workspace policy blocks app',
    detail: 'The Workspace admin policy forbids one of the requested scopes.',
    howToFix: 'Ask the admin to allow the app.',
    category: 'config',
  },
  {
    key: 'org_internal',
    dependency: 'google',
    hint: 'OAuth app is internal-only',
    detail:
      'The OAuth client is restricted to the organization; an outside account tried to sign in.',
    howToFix:
      'Sign in with an organization account, or make the OAuth app external.',
    level: 'warn',
  },
  {
    key: 'invalid_scope',
    dependency: 'google',
    hint: 'OAuth scope invalid',
    detail: 'A requested scope is unknown or not allowed for this client.',
    howToFix: 'Check the scope list.',
    category: 'config',
  },
  {
    key: 'unsupported_grant_type',
    dependency: 'google',
    hint: 'OAuth grant type invalid',
    detail: 'The grant_type is not supported.',
    howToFix: 'Check the grant_type in the token request.',
    category: 'bug',
  },
  {
    key: 'invalid_token',
    dependency: 'google',
    hint: 'Google access token invalid',
    detail: 'The bearer token is expired, revoked or malformed.',
    howToFix: 'Refresh the token.',
    level: 'warn',
  },
  {
    key: 'insufficient_scope',
    dependency: 'google',
    hint: 'Google token lacks scope',
    detail: 'The token does not include the scope this API needs.',
    howToFix: 'Re-authorize with the scope added.',
    category: 'config',
  },
  // --- gRPC-style status (error.status) ---
  {
    key: 'INVALID_ARGUMENT',
    dependency: 'google',
    hint: 'Google argument invalid',
    detail: 'A request field is invalid (see message).',
    howToFix: 'Correct the field named in error.message.',
    level: 'warn',
  },
  {
    key: 'FAILED_PRECONDITION',
    dependency: 'google',
    hint: 'Google precondition failed',
    detail:
      'The resource is in a state that does not allow this operation (see message).',
    howToFix: 'Bring the resource into the required state before retrying.',
    level: 'warn',
  },
  {
    key: 'OUT_OF_RANGE',
    dependency: 'google',
    hint: 'Google value out of range',
    detail: 'A value (page size, offset, date) is outside the allowed range.',
    howToFix: 'Keep the value within the range the API documents.',
    level: 'warn',
  },
  {
    key: 'UNAUTHENTICATED',
    dependency: 'google',
    hint: 'Google auth missing',
    detail: 'No valid credentials were sent.',
    howToFix: 'Check the service account key or token.',
    category: 'config',
  },
  {
    key: 'PERMISSION_DENIED',
    dependency: 'google',
    hint: 'Google permission denied',
    detail:
      'The caller lacks permission for this resource, or the API is not enabled for the project.',
    howToFix:
      'Grant the caller access to the resource, or enable the API in Google Cloud console.',
    category: 'config',
  },
  {
    key: 'NOT_FOUND',
    dependency: 'google',
    hint: 'Google resource not found',
    detail: 'The resource does not exist or is not visible to the caller.',
    howToFix: 'Check the resource id and that it is shared with the caller.',
    level: 'warn',
  },
  {
    key: 'ALREADY_EXISTS',
    dependency: 'google',
    hint: 'Google resource exists',
    detail: 'A resource with this id already exists.',
    howToFix: 'Use a new id, or update the existing resource instead.',
    level: 'warn',
  },
  {
    key: 'ABORTED',
    dependency: 'google',
    hint: 'Google operation aborted',
    detail: 'A concurrency conflict (transaction, ETag) aborted the operation.',
    howToFix: 'Retry the whole read-modify-write sequence with backoff.',
    retryable: true,
  },
  {
    key: 'UNAVAILABLE',
    dependency: 'google',
    hint: 'Google service unavailable',
    detail: 'The Google service is temporarily unavailable.',
    howToFix: 'Retry with backoff.',
    retryable: true,
  },
  {
    key: 'DEADLINE_EXCEEDED',
    dependency: 'google',
    hint: 'Google request timed out',
    detail:
      'The deadline expired before the operation completed; a write may still have taken effect.',
    howToFix:
      'Retry with backoff; for a write, first check whether the change was already applied.',
    retryable: true,
  },
  {
    key: 'INTERNAL',
    dependency: 'google',
    hint: 'Google internal error',
    detail: 'Google failed internally.',
    howToFix: 'Retry with backoff.',
    retryable: true,
  },
  {
    key: 'UNIMPLEMENTED',
    dependency: 'google',
    hint: 'Google method unsupported',
    detail: 'The API method is not implemented or disabled.',
    howToFix:
      'Check the method name and API version against the API reference.',
    category: 'bug',
  },
  {
    key: 'CANCELLED',
    dependency: 'google',
    hint: 'Google request cancelled',
    detail: 'The request was cancelled by the caller.',
    howToFix:
      'Check why the caller aborted the request (timeout, shutdown); retry if it is still needed.',
  },
  {
    key: 'DATA_LOSS',
    dependency: 'google',
    hint: 'Google data loss',
    detail: 'Unrecoverable data loss or corruption on the Google side.',
    howToFix: 'Contact Google support.',
  },
  // --- fallback by HTTP status ---
  {
    key: 'GOOGLE_400',
    dependency: 'google',
    hint: 'Google rejected request',
    detail: 'Google answered 400: a parameter is invalid.',
    howToFix: 'Read error.message for the invalid parameter and fix it.',
    level: 'warn',
  },
  {
    key: 'GOOGLE_401',
    dependency: 'google',
    hint: 'Google auth failed',
    detail: 'The access token is missing or expired.',
    howToFix:
      'The auth service should refresh the token; check credentials if it persists.',
  },
  {
    key: 'GOOGLE_403',
    dependency: 'google',
    hint: 'Google access denied',
    detail:
      'Google answered 403: no permission, a quota, or the API not enabled.',
    howToFix: 'Read error.message to see which one applies.',
    category: 'config',
  },
  {
    key: 'GOOGLE_404',
    dependency: 'google',
    hint: 'Google resource not found',
    detail:
      'Google answered 404: the resource does not exist or is not shared with the caller.',
    howToFix: 'Check the resource id and its sharing.',
    level: 'warn',
  },
  {
    key: 'GOOGLE_409',
    dependency: 'google',
    hint: 'Google conflict',
    detail:
      'Google answered 409: the resource already exists or changed concurrently.',
    howToFix: 'Re-fetch the resource, then retry or update it instead.',
    level: 'warn',
  },
  {
    key: 'GOOGLE_412',
    dependency: 'google',
    hint: 'Google precondition failed',
    detail: 'Google answered 412: an If-Match condition failed.',
    howToFix: 'Re-fetch and retry.',
    level: 'warn',
  },
  {
    key: 'GOOGLE_429',
    dependency: 'google',
    hint: 'Google rate limited',
    detail: 'Google answered 429: too many requests.',
    howToFix: 'Retry with exponential backoff; reduce concurrency.',
    retryable: true,
  },
  {
    key: 'GOOGLE_500',
    dependency: 'google',
    hint: 'Google backend error',
    detail: 'Google answered 500: a backend error.',
    howToFix: 'Retry with backoff.',
    retryable: true,
  },
  {
    key: 'GOOGLE_502',
    dependency: 'google',
    hint: 'Google gateway error',
    detail: 'Google answered 502: a gateway error.',
    howToFix: 'Retry with backoff.',
    retryable: true,
  },
  {
    key: 'GOOGLE_503',
    dependency: 'google',
    hint: 'Google service unavailable',
    detail: 'Google answered 503: the service is unavailable.',
    howToFix: 'Retry with backoff.',
    retryable: true,
  },
  {
    key: 'GOOGLE_504',
    dependency: 'google',
    hint: 'Google gateway timeout',
    detail: 'Google answered 504: a gateway timeout.',
    howToFix: 'Retry with backoff.',
    retryable: true,
  },
]
