import { maskObject, redactValue } from 'skilllane-monitoring-contract'

/**
 * The masking of everything the capture stores. The rules live in
 * skilllane-monitoring-contract (src/mask), shared with the engine's fallback for other
 * senders and the demo seed (SPEC.md §3):
 * - key rule: an object key, form / query / bind parameter name, column,
 *   header name, hash field or Redis key segment that is sensitive
 *   (isSensitiveKey: contains password, token, secret, session, cookie,
 *   authorization, credential …; or has a word pass, pwd, pin, otp, auth, sig …;
 *   or ends in an api / access / private / client … `key`; not when its last
 *   word is metadata: tokenType, passwordChangedAt) → "[REDACTED]", also in
 *   nested objects and arrays; authorization / proxy-authorization always,
 *   cookie and set-cookie with their names and attributes kept;
 * - value rule: redactValue on every string value (JWT, Bearer / Basic, the
 *   credential after `Authorization:`, URL userinfo, sensitive `name=value`
 *   pairs, JSON inside a string, email, Thai national ID) and a 13-digit
 *   number that is a valid Thai national ID.
 */
export {
  type HeaderMap,
  isSensitiveHeader,
  isSensitiveKey,
  isSensitiveQueryName,
  maskCsv,
  maskHeaders,
  maskJsonText,
  maskMarkup,
  maskNumber,
  maskQuery,
  maskSql,
  maskUrl,
  SENSITIVE_HEADERS,
  SENSITIVE_KEYS,
  SENSITIVE_WORDS,
  truncateUtf8,
} from 'skilllane-monitoring-contract'

/** Value-based masking of one string. */
export function maskText(text: string): string {
  return redactValue(text)
}

/** Plain JSON-able copy with both rules applied (cycles → "[Circular]"). */
export function maskValue(value: unknown): unknown {
  return maskObject(value)
}
