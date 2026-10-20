import type { ErrorPattern } from './types'

// Google APIs (gaxios): the adapter uses errors[0].reason, else GOOGLE_<status>.
export const googlePatterns: ErrorPattern[] = [
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
    key: 'RESOURCE_EXHAUSTED',
    dependency: 'google',
    hint: 'Google quota exhausted',
    hintDetail:
      'The project quota for this API is used up. Check quotas in Google Cloud console.',
    retryable: true,
  },
  {
    key: 'backendError',
    dependency: 'google',
    hint: 'Google backend error',
    hintDetail: 'Google failed on its side. Usually temporary; retry.',
    retryable: true,
  },
  {
    key: 'forbidden',
    dependency: 'google',
    hint: 'Google access denied',
    hintDetail:
      'The account lacks permission, or the user is not in the managed domain. Check sharing and domain-wide delegation.',
  },
  {
    key: 'fileNotDownloadable',
    dependency: 'google',
    hint: 'Google file not downloadable',
    hintDetail:
      'Native Google Docs must be exported, not downloaded. Use the export endpoint with a target MIME type.',
  },
  {
    key: 'notFound',
    dependency: 'google',
    hint: 'Google resource not found',
    hintDetail:
      'The file, drive or event does not exist or is not shared with the service account.',
    level: 'warn',
  },
  {
    key: 'invalid_grant',
    dependency: 'google',
    hint: 'Google token invalid',
    hintDetail:
      'The refresh token was revoked or expired. The user must sign in with Google again.',
    level: 'warn',
  },
  {
    key: 'GOOGLE_401',
    dependency: 'google',
    hint: 'Google auth failed',
    hintDetail:
      'The access token is missing or expired. The auth service should refresh it; check credentials if it persists.',
  },
]
