import { SpanKind, SpanStatusCode } from '@opentelemetry/api'
import { currentScope } from '../logger/context'

// Structural types: this library does not depend on @opentelemetry/sdk-trace-base.
type HrTime = [number, number]
interface EndedSpan {
  name: string
  kind: SpanKind
  status: { code: SpanStatusCode }
  startTime: HrTime
  endTime: HrTime
}

const toMs = ([seconds, nanos]: HrTime) => seconds * 1_000 + nanos / 1e6

/** Outgoing calls only: the work unit itself (server/consumer span) is not a step. */
const STEP_KINDS = new Set([SpanKind.CLIENT, SpanKind.PRODUCER])

/**
 * Add to the SDK's `spanProcessors`. Remembers, per request or job, the last
 * outgoing call that ended in error (e.g. `oracle INSERT QUESTION_BANK`), so
 * the error line can name the step that failed even when the stack holds
 * only driver frames. A later call that succeeds clears it: the failure was
 * handled. Without OTel there are no spans and no step — nothing breaks.
 */
export class FailedStepSpanProcessor {
  onStart(): void {}

  onEnd(span: EndedSpan): void {
    try {
      if (!STEP_KINDS.has(span.kind)) return
      const scope = currentScope()
      if (!scope) return
      if (span.status?.code === SpanStatusCode.ERROR) {
        scope.failedStep = { name: span.name, endedAtMs: toMs(span.endTime) }
      } else if (
        scope.failedStep &&
        toMs(span.startTime) >= scope.failedStep.endedAtMs
      ) {
        scope.failedStep = undefined
      }
    } catch {
      // never affect tracing
    }
  }

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }
}
