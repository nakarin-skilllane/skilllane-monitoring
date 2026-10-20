import { type DiagLogger, trace } from '@opentelemetry/api'
import { getLogger } from '../logger'

function write(level: 'warn' | 'error', message: string, args: unknown[]) {
  const error = args.find((arg) => arg instanceof Error)
  getLogger().event({
    event: 'app.log',
    level,
    logger: 'opentelemetry',
    message,
    error,
  })
}

/** `diag.setLogger(otelDiagLogger, DiagLogLevel.WARN)` in instrumentation. */
export const otelDiagLogger: DiagLogger = {
  error: (message, ...args) => write('error', message, args),
  warn: (message, ...args) => write('warn', message, args),
  info: () => {},
  debug: () => {},
  verbose: () => {},
}

/**
 * True when a real tracer provider is registered (spans get valid ids).
 * Looks at the provider instead of starting a probe span, which a real
 * provider would export as a stray trace.
 */
export function isOtelStarted(): boolean {
  const provider = trace.getTracerProvider() as {
    getDelegate?: () => unknown
  }
  const actual = (provider.getDelegate?.() ?? provider) as object
  return actual.constructor?.name !== 'NoopTracerProvider'
}
