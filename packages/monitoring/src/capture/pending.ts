import type { Attributes, AttributeValue, Span } from '@opentelemetry/api'

/**
 * Work a hook leaves for the end of its span: headers and bodies are only
 * complete then. CaptureSpanProcessor.onEnding runs it while the span can
 * still take attributes, so the capture never needs a timer or a listener.
 */
type Finalizer = (span: Span) => void

const pending = new WeakMap<object, Finalizer[]>()
// Per span, the attribute values this module wrote (already masked): the
// processor masks everything else.
const written = new WeakMap<object, Map<string, AttributeValue>>()

export function recording(span: unknown): span is Span {
  return (
    !!span &&
    typeof (span as Span).isRecording === 'function' &&
    (span as Span).isRecording()
  )
}

export function onSpanEnding(span: Span, finalizer: Finalizer): void {
  const list = pending.get(span)
  if (list) list.push(finalizer)
  else pending.set(span, [finalizer])
}

export function runPending(span: Span): void {
  const list = pending.get(span)
  if (!list) return
  pending.delete(span)
  for (const finalizer of list) {
    try {
      finalizer(span)
    } catch {
      // never affect the traced code
    }
  }
}

/** The current value of `key` is the one the capture wrote. */
export function wasWritten(
  span: unknown,
  key: string,
  value: unknown,
): boolean {
  return !!span && written.get(span as object)?.get(key) === value
}

/**
 * setAttribute, and the span's own map when the attribute count limit (128)
 * dropped it: a capture attribute must not be lost to a span that already
 * holds many (an INSERT's raw bind values, removed by the processor).
 */
export function put(span: Span, key: string, value: AttributeValue): void {
  span.setAttribute(key, value)
  const values = written.get(span) ?? new Map<string, AttributeValue>()
  values.set(key, value)
  written.set(span, values)
  const impl = span as unknown as { attributes?: Attributes; ended?: boolean }
  const attributes = impl.attributes
  if (
    impl.ended !== true &&
    attributes &&
    typeof attributes === 'object' &&
    attributes[key] !== value
  ) {
    attributes[key] = value
  }
}

/**
 * Removes an attribute someone else wrote (an app hook's body on a side the
 * capture keeps size-only: binary, skipped route, undecodable): while the span
 * can still change, from its own map.
 */
export function drop(span: Span, key: string): void {
  const impl = span as unknown as { attributes?: Attributes; ended?: boolean }
  const attributes = impl.attributes
  if (
    impl.ended !== true &&
    attributes &&
    typeof attributes === 'object' &&
    key in attributes
  ) {
    delete attributes[key]
  }
  written.get(span)?.delete(key)
}
