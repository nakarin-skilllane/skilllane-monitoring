import {
  DEFAULT_MAX_MESSAGE_BYTES,
  ENV,
  EXPORT_MODES,
  type ExportMode,
  resolveExportMode,
} from 'skilllane-monitoring-contract'
import { envNumber } from './identity'

export { EXPORT_MODES, type ExportMode }

export interface ExportSelection {
  mode: ExportMode
  /** LOG_EXPORT held a value that is not a mode; it was ignored. */
  invalid?: string
}

/**
 * LOG_EXPORT wins when set (kafka · rabbitmq · bullmq · otlp · stdout).
 * Otherwise the first configured of Kafka brokers, RabbitMQ URL, BullMQ
 * Redis URL, collector endpoint; else stdout. stdout is always written.
 * Same rule as the engine (skilllane-monitoring-contract).
 */
export function selectExportMode(): ExportSelection {
  return resolveExportMode(process.env)
}

export interface ExportSettings {
  batchMs: number
  batchSize: number
  maxQueue: number
  /** Max encoded bytes waiting in memory per stream (spans carry bodies). */
  maxQueueBytes: number
  /** Max encoded bytes of one queue message. */
  maxBytes: number
  shutdownMs: number
}

export function exportSettings(): ExportSettings {
  return {
    batchMs: envNumber(ENV.batchMs, 1_000),
    batchSize: envNumber(ENV.batchSize, 500),
    maxQueue: envNumber(ENV.maxQueue, 10_000),
    maxQueueBytes: envNumber('LOG_EXPORT_MAX_QUEUE_BYTES', 64 * 1024 * 1024),
    maxBytes: envNumber(ENV.maxBytes, DEFAULT_MAX_MESSAGE_BYTES),
    shutdownMs: envNumber(ENV.shutdownMs, 3_000),
  }
}
