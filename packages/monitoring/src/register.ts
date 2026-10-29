/**
 * `import 'skilllane-monitoring/register'` — the first line of main.ts, or
 * `NODE_OPTIONS="--require skilllane-monitoring/register"`. Starts OpenTelemetry
 * and the process handlers from the environment alone. An app that needs
 * options calls `registerTelemetry()` from `skilllane-monitoring/otel` instead.
 */
import { registerTelemetry } from './otel/register'

// Loads the HttpExceptionOptions fields for apps whose only import is this one.
export type { HttpExceptionLogOptions } from './errors/http-exception'

registerTelemetry()
