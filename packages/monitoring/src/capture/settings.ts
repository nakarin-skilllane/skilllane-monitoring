import { env, envNumber } from '../otel/identity'

/**
 * What the SDK captures on spans (request/response headers and bodies, query
 * strings, bind values, Redis commands, message payloads), from env, read once:
 *   LOG_CAPTURE              all (default) | off
 *   LOG_BODY_MAX_BYTES       first bytes kept of each body / payload / statement (65536)
 *   LOG_CAPTURE_SKIP_ROUTES  comma-separated path (or URL) prefixes whose bodies are not read
 * Masking (mask.ts) applies whatever this says.
 */
export interface CaptureSettings {
  enabled: boolean
  maxBytes: number
  skipRoutes: string[]
}

export const DEFAULT_BODY_MAX_BYTES = 65_536

let settings: CaptureSettings | undefined
// False when spans leave the process nowhere (stdout without a collector):
// nothing to capture for.
let exported = true

export function captureSettings(): CaptureSettings {
  if (!settings) {
    const max = Math.floor(
      envNumber('LOG_BODY_MAX_BYTES', DEFAULT_BODY_MAX_BYTES),
    )
    settings = {
      enabled: (env('LOG_CAPTURE') ?? 'all').toLowerCase() !== 'off',
      maxBytes: max > 0 ? max : DEFAULT_BODY_MAX_BYTES,
      skipRoutes: (env('LOG_CAPTURE_SKIP_ROUTES') ?? '')
        .split(',')
        .map((prefix) => prefix.trim())
        .filter(Boolean),
    }
  }
  return settings
}

/** registerTelemetry: whether any span processor exports the spans. */
export function setSpansExported(value: boolean): void {
  exported = value
}

/** Capture hooks are installed: LOG_CAPTURE is not off and spans are exported. */
export function captureActive(): boolean {
  return exported && captureSettings().enabled
}

/** A path or URL under one of LOG_CAPTURE_SKIP_ROUTES: headers only, no body. */
export function skippedRoute(...targets: Array<string | undefined>): boolean {
  const { skipRoutes } = captureSettings()
  if (!skipRoutes.length) return false
  return targets.some(
    (target) =>
      !!target && skipRoutes.some((prefix) => target.startsWith(prefix)),
  )
}
