import type { DependencyType } from '../../types'

export interface AdapterResult {
  code?: string
  cause?: unknown
  /** HTTP status of an outbound or inbound HTTP error. */
  status?: number
  dependency?: DependencyType
  /** Host of an outbound request; never the full URL. */
  domain?: string
}

/**
 * Turns one library's error shape into a code. Adapters detect errors by
 * shape, never `instanceof`, because the app may load another copy of the
 * library. `extract` must not throw; the serializer falls back to generic.
 */
export interface ErrorAdapter {
  name: string
  match(error: any): boolean
  extract(error: any): AdapterResult
}
