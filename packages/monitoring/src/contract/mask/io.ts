import { maskSql } from './sql'
import { maskJsonText, redactValue, truncateUtf8 } from './value'
import { maskHeaders, maskMarkup } from './web'

/**
 * Masking of the I/O attributes another writer put on a span (an app's own
 * hooks, an older SDK, another language's SDK): the SDK's CaptureSpanProcessor
 * and the engine's fallback use the same functions. At most `maxBytes` of a
 * value is looked at and kept.
 */

function firstChar(text: string): string | undefined {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c > 32 && c !== 0xfeff) return text[i]
  }
  return undefined
}

/** A body or payload of unknown type: JSON by key, markup by tag, else the value rule. */
export function maskBodyText(value: string, maxBytes: number): string {
  const { text, truncated } = truncateUtf8(value, maxBytes)
  const first = firstChar(text)
  const masked =
    first === '{' || first === '['
      ? maskJsonText(text, !truncated)
      : first === '<'
        ? redactValue(maskMarkup(text))
        : redactValue(text)
  return truncateUtf8(masked, maxBytes).text
}

/** A headers JSON object (`http.request.headers`, `messaging.message.headers`). */
export function maskHeaderJson(
  text: string,
  lowerCase: boolean,
  maxBytes: number,
): string {
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return truncateUtf8(
        JSON.stringify(
          maskHeaders(parsed as Record<string, unknown>, lowerCase),
        ),
        maxBytes,
      ).text
    }
  } catch {
    // not JSON: the value rule
  }
  return truncateUtf8(maskBodyText(text, maxBytes), maxBytes).text
}

/** `db.statement` / `db.query.text`: SQL by its columns, a Redis command or TypeORM's JSON arguments. */
export function maskStatement(
  statement: string,
  system: string,
  maxBytes: number,
): string {
  const { text, truncated } = truncateUtf8(statement, maxBytes)
  if (/redis/i.test(system))
    return truncateUtf8(redactValue(text), maxBytes).text
  const first = firstChar(text)
  if (first === '{' || first === '[')
    return truncateUtf8(maskJsonText(text, !truncated), maxBytes).text
  return truncateUtf8(maskSql(text), maxBytes).text
}
