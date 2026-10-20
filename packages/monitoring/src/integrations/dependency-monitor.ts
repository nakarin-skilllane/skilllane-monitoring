import { getLogger } from '../logger'
import type { DependencyType, JobSource } from '../types'

export interface DependencyInfo {
  type: DependencyType
  name: string
  host?: string
  port?: number
  /** Features that stop working while this dependency is down. */
  affects?: string[]
  /** Env vars that configure it, named in hints. */
  configKeys?: string[]
  /** The work system it serves (`event.module`), e.g. the queue Redis → bullmq. */
  module?: JobSource
}

/**
 * Host and port of a broker list or connection URL, without credentials:
 * `amqp://user:pass@mq:5672/vh` → mq:5672, `kafka-0:9092,kafka-1:9092` →
 * kafka-0:9092 (the first one).
 */
export function parseAddress(value: string | undefined): {
  host?: string
  port?: number
} {
  const first = value?.split(',')[0]?.trim()
  if (!first) return {}
  try {
    const url = new URL(first.includes('://') ? first : `tcp://${first}`)
    return {
      host: url.hostname || undefined,
      port: url.port ? Number(url.port) : undefined,
    }
  } catch {
    return {}
  }
}

export const STILL_DOWN_MS = Number(
  process.env.DEPENDENCY_STILL_DOWN_MS ?? 30_000,
)

let shuttingDown = false

/** Set on SIGTERM so that expected disconnects are not reported as outages. */
export function markShuttingDown(): void {
  shuttingDown = true
}

export function isShuttingDown(): boolean {
  return shuttingDown
}

/**
 * Logs only state changes: `dependency.up` (reason `connected`) on the first
 * successful connect, `dependency.down` once, `dependency.still_down` every
 * STILL_DOWN_MS while down, `dependency.up` (reason `recovered`) when it
 * comes back. Reconnects without an outage write nothing.
 */
export class DependencyMonitor {
  private down = false
  /** Connected at least once: later connects are reconnects. */
  private everUp = false
  private downSince = 0
  private attempt = 0
  private timer?: NodeJS.Timeout

  constructor(private readonly info: DependencyInfo) {}

  get isDown(): boolean {
    return this.down
  }

  /** Host and port learned from a client, when the monitor was made without them. */
  setAddress(host: unknown, port: unknown): void {
    if (this.info.host || typeof host !== 'string' || !host) return
    this.info.host = host
    const value = Number(port)
    if (Number.isFinite(value) && value > 0) this.info.port = value
  }

  addAffected(feature: string): void {
    this.info.affects ??= []
    if (!this.info.affects.includes(feature)) this.info.affects.push(feature)
  }

  markDown(error?: unknown): void {
    this.attempt++
    if (this.down || shuttingDown) return
    this.down = true
    this.downSince = Date.now()
    getLogger().event({
      event: 'dependency.down',
      logger: `dependency:${this.info.name}`,
      error,
      fields: this.fields(),
      hintVars: {
        name: this.info.name,
        host: this.info.host,
        port: this.info.port,
        configKeys: this.info.configKeys,
      },
    })
    this.timer = setInterval(() => {
      getLogger().event({
        event: 'dependency.still_down',
        logger: `dependency:${this.info.name}`,
        fields: { ...this.fields(), duration_ms: Date.now() - this.downSince },
      })
    }, STILL_DOWN_MS)
    this.timer.unref()
  }

  /** A retry happened; counted for the next still_down line. */
  markAttempt(): void {
    if (this.down) this.attempt++
  }

  markUp(): void {
    if (!this.down) {
      // First connect: one line, so a healthy dependency is visible too.
      if (this.everUp || shuttingDown) return
      this.everUp = true
      getLogger().event({
        event: 'dependency.up',
        logger: `dependency:${this.info.name}`,
        message: 'Dependency connected',
        fields: { ...this.fields(), reason: 'connected' },
      })
      return
    }
    // Down before the first connect, then up: one line, as a recovery.
    this.everUp = true
    this.down = false
    if (this.timer) clearInterval(this.timer)
    getLogger().event({
      event: 'dependency.up',
      logger: `dependency:${this.info.name}`,
      fields: {
        ...this.fields(),
        duration_ms: Date.now() - this.downSince,
        reason: 'recovered',
      },
    })
    this.attempt = 0
  }

  /** The dependency will not recover on its own (reconnect gave up). */
  markGaveUp(code: string, error?: unknown): void {
    getLogger().event({
      event: 'dependency.down',
      logger: `dependency:${this.info.name}`,
      error:
        error ??
        Object.assign(new Error('Reconnect attempts exhausted'), { code }),
      fields: { ...this.fields(), 'job.final': true },
      hintVars: { name: this.info.name, configKeys: this.info.configKeys },
    })
  }

  private fields(): Record<string, unknown> {
    return {
      'dependency.type': this.info.type,
      'dependency.name': this.info.name,
      'dependency.host': this.info.host,
      'dependency.port': this.info.port,
      'dependency.attempt': this.attempt || undefined,
      'dependency.affects': this.info.affects,
      'event.module': this.info.module,
    }
  }
}
