import {
  CONTRACT_VERSION,
  type TelemetryStream,
} from 'skilllane-monitoring-contract'
import { context, ROOT_CONTEXT } from '@opentelemetry/api'
import { suppressTracing } from '@opentelemetry/core'
import { getLogger } from '../logger'
import { safeJson } from '../logger/writer'
import {
  type OutgoingMessage,
  RejectedMessageError,
  type Transport,
  untilDeadline,
  withTimeout,
} from './types'

/** Every publish (and the client work it triggers) runs without tracing. */
export function untraced<T>(fn: () => T): T {
  return context.with(suppressTracing(ROOT_CONTEXT), fn)
}

/** A line about the export itself: stdout, and the logs stream when it works. */
function report(
  level: 'info' | 'warn',
  message: string,
  fields: Record<string, unknown>,
  error?: unknown,
): void {
  try {
    getLogger().event({
      event: 'app.log',
      level,
      logger: 'skilllane-monitoring',
      message,
      fields,
      error,
    })
  } catch {
    // reporting must never throw into the app
  }
}

/**
 * The transport shared by both publishers, plus its reported state:
 * connected / failing / recovered, each written once per change.
 */
export class ExportLink {
  private state: 'idle' | 'up' | 'failing' = 'idle'
  private failingSince = 0

  constructor(readonly transport: Transport) {}

  describe(): string {
    return `${this.transport.name} ${this.transport.target}`
  }

  async send(
    stream: TelemetryStream,
    message: OutgoingMessage,
    timeoutMs: number,
  ): Promise<void> {
    const started = Date.now()
    const name = this.transport.name
    await withTimeout(
      this.transport.connect(),
      timeoutMs,
      `${name} connect timed out after ${timeoutMs}ms`,
    )
    const left = Math.max(1, timeoutMs - (Date.now() - started))
    await withTimeout(
      this.transport.publish(stream, message),
      left,
      `${name} publish timed out after ${timeoutMs}ms`,
    )
  }

  succeeded(): void {
    if (this.state === 'up') return
    if (this.state === 'failing') {
      report('info', 'Telemetry export recovered', {
        reason: this.describe(),
        duration_ms: Date.now() - this.failingSince,
      })
    } else {
      report('info', 'Telemetry export connected', { reason: this.describe() })
    }
    this.state = 'up'
  }

  failed(error: unknown): void {
    // The next send opens a fresh connection.
    void this.transport.close()
    if (this.state === 'failing') return
    this.state = 'failing'
    this.failingSince = Date.now()
    report(
      'warn',
      'Telemetry export is failing; items stay in memory and are retried',
      { reason: this.describe() },
      error,
    )
  }

  close(): Promise<void> {
    return this.transport.close()
  }
}

export interface PublisherSettings {
  batchMs: number
  batchSize: number
  maxQueue: number
  maxQueueBytes: number
  maxBytes: number
  /** Connect + publish of one message. */
  sendTimeoutMs: number
}

interface Entry {
  json: string
  /** UTF-8 bytes on the wire. */
  bytes: number
  /** Heap the string holds: V8 keeps a string with any character above U+00FF at 2 bytes per character. */
  cost: number
}

/** Makes an item that is over `maxBytes` encoded smaller (spans: cut their largest captured values); undefined: cannot. */
export type FitItem = (item: unknown, maxBytes: number) => unknown

// The envelope around the items: {"v":1,"stream":…,"resource":…,"sentAt":"…","items":[ … ]}.
const ENVELOPE_SLACK = 64

/** After this many failures in a row, pause (5 s, doubling, max 30 s). */
const BREAKER_FAILURES = 3
const BREAKER_PAUSE_MS = 5_000
const BREAKER_MAX_PAUSE_MS = 30_000

/**
 * One stream (logs or spans). push() only appends to memory and never
 * throws. Messages go out every LOG_EXPORT_BATCH_MS, or at
 * LOG_EXPORT_BATCH_SIZE items, each under LOG_EXPORT_MAX_BYTES; an item over
 * it is made smaller by `fit` (a span's largest captured values are cut)
 * rather than dropped. A full queue (LOG_EXPORT_MAX_QUEUE items, or
 * LOG_EXPORT_MAX_QUEUE_BYTES of heap held by the waiting items) drops its
 * oldest items; a failing queue pauses and keeps its items.
 */
export class Publisher {
  private queue: Entry[] = []
  /** Heap held by the queued items (Entry.cost). */
  private queuedBytes = 0
  private readonly itemMax: number
  private timer?: NodeJS.Timeout
  private timerDue = 0
  private running?: Promise<void>
  private failures = 0
  private pauses = 0
  private pausedUntil = 0
  private dropped = 0
  private dropping = false
  private closed = false

  constructor(
    readonly stream: TelemetryStream,
    private readonly link: ExportLink,
    private readonly settings: PublisherSettings,
    private readonly resourceJson: string,
    private readonly key: string,
    private readonly fit?: FitItem,
  ) {
    const head = `{"v":${CONTRACT_VERSION},"stream":"${stream}","resource":${resourceJson},"sentAt":"${new Date().toISOString()}","items":[]}`
    this.itemMax = settings.maxBytes - Buffer.byteLength(head) - ENVELOPE_SLACK
  }

  push(item: unknown): void {
    if (this.closed) return
    try {
      let json = safeJson(item as Record<string, unknown>)
      let bytes = Buffer.byteLength(json)
      if (bytes > this.itemMax && this.fit) {
        const smaller = this.fit(item, this.itemMax)
        if (smaller !== undefined) {
          json = safeJson(smaller as Record<string, unknown>)
          bytes = Buffer.byteLength(json)
        }
      }
      // All ASCII (as many bytes as characters): one byte per character; else assume two.
      const cost = bytes === json.length ? bytes : json.length * 2
      this.queue.push({ json, bytes, cost })
      this.queuedBytes += cost
      this.trim()
      this.schedule()
    } catch {
      // never into the app
    }
  }

  /** Sends what is queued now, ignoring a pause; stops at the first failure. */
  flush(deadline: number): Promise<void> {
    return untilDeadline(this.run(deadline, true), deadline)
  }

  /** Last flush, then nothing more is accepted. */
  async close(deadline: number): Promise<void> {
    if (this.running) await untilDeadline(this.running, deadline)
    await untilDeadline(this.run(deadline, true), deadline)
    this.closed = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    const left = this.queue.length
    this.queue = []
    this.queuedBytes = 0
    if (left) {
      report(
        'warn',
        `Telemetry export closed; ${left} ${this.stream} items were not sent`,
        {
          reason: this.link.describe(),
        },
      )
    }
  }

  /** Above either bound: the oldest go (the newest item always stays). */
  private trim(): void {
    let count = Math.max(0, this.queue.length - this.settings.maxQueue)
    let bytes = this.queuedBytes
    for (let i = 0; i < count; i++) bytes -= this.queue[i].cost
    while (
      bytes > this.settings.maxQueueBytes &&
      count < this.queue.length - 1
    ) {
      bytes -= this.queue[count].cost
      count++
    }
    if (count > 0) this.discard(count, 'queue full')
  }

  private removeOldest(count: number): Entry[] {
    const entries = this.queue.splice(0, count)
    for (const entry of entries) this.queuedBytes -= entry.cost
    return entries
  }

  private discard(count: number, why: string): void {
    this.removeOldest(count)
    this.dropped += count
    if (this.dropping) return
    this.dropping = true
    report(
      'warn',
      `Telemetry export is dropping ${this.stream} items (${why})`,
      {
        reason: `${this.link.describe()}; LOG_EXPORT_MAX_QUEUE=${this.settings.maxQueue}, LOG_EXPORT_MAX_QUEUE_BYTES=${this.settings.maxQueueBytes}`,
      },
    )
  }

  private schedule(): void {
    if (this.closed || this.running || !this.queue.length) return
    const now = Date.now()
    const full = this.queue.length >= this.settings.batchSize
    const due = Math.max(
      full ? now : now + this.settings.batchMs,
      this.pausedUntil,
    )
    if (this.timer) {
      if (this.timerDue <= due) return
      clearTimeout(this.timer)
    }
    this.timerDue = due
    this.timer = setTimeout(
      () => {
        this.timer = undefined
        void this.run(Number.POSITIVE_INFINITY, false)
      },
      Math.max(0, due - now),
    )
    // A batch timer never keeps the app alive; shutdown flushes instead.
    this.timer.unref()
  }

  /** One drain at a time; a second caller gets the running one. */
  private run(deadline: number, force: boolean): Promise<void> {
    this.running ??= untraced(() => this.drain(deadline, force))
      .catch(() => undefined)
      .finally(() => {
        this.running = undefined
        this.schedule()
      })
    return this.running
  }

  private async drain(deadline: number, force: boolean): Promise<void> {
    while (this.queue.length) {
      const now = Date.now()
      if (now >= deadline) return
      if (!force && now < this.pausedUntil) return
      const batch = this.take()
      if (!batch) continue
      try {
        await this.link.send(
          this.stream,
          batch.message,
          Math.min(this.settings.sendTimeoutMs, deadline - now),
        )
      } catch (error) {
        if (error instanceof RejectedMessageError) {
          // Retrying cannot help and would hold back everything behind it.
          this.rejected(batch.entries.length, error)
          continue
        }
        // Keep them, oldest first; the queue bounds still apply.
        this.queue.unshift(...batch.entries)
        for (const entry of batch.entries) this.queuedBytes += entry.cost
        this.trim()
        this.failed(error)
        return
      }
      this.succeeded()
    }
  }

  /** Up to batchSize items whose envelope stays under maxBytes. */
  private take(): { entries: Entry[]; message: OutgoingMessage } | undefined {
    const head =
      `{"v":${CONTRACT_VERSION},"stream":"${this.stream}",` +
      `"resource":${this.resourceJson},"sentAt":"${new Date().toISOString()}","items":[`
    const tail = ']}'
    let bytes = Buffer.byteLength(head) + tail.length
    const max = Math.min(this.settings.batchSize, this.queue.length)
    let count = 0
    while (count < max) {
      const next = this.queue[count].bytes + (count ? 1 : 0)
      if (bytes + next > this.settings.maxBytes) break
      bytes += next
      count++
    }
    if (count === 0) {
      this.discard(1, 'item larger than LOG_EXPORT_MAX_BYTES')
      return undefined
    }
    const entries = this.removeOldest(count)
    const body = Buffer.from(
      head + entries.map((entry) => entry.json).join(',') + tail,
      'utf8',
    )
    return { entries, message: { body, key: this.key, count } }
  }

  private succeeded(): void {
    this.failures = 0
    this.pauses = 0
    this.pausedUntil = 0
    this.link.succeeded()
    if (
      this.dropping &&
      this.queue.length < this.settings.maxQueue &&
      this.queuedBytes < this.settings.maxQueueBytes
    ) {
      report(
        'info',
        `Telemetry export dropped ${this.dropped} ${this.stream} items`,
        {
          reason: this.link.describe(),
        },
      )
      this.dropping = false
      this.dropped = 0
    }
  }

  private rejected(count: number, error: RejectedMessageError): void {
    this.dropped += count
    this.dropping = true
    report(
      'warn',
      `Telemetry export dropped ${count} ${this.stream} items the receiver rejected`,
      { reason: `${this.link.describe()}; ${error.message}` },
    )
  }

  private failed(error: unknown): void {
    this.link.failed(error)
    this.failures++
    if (this.failures < BREAKER_FAILURES) {
      // Not before the next batch interval, even with a full batch waiting.
      this.pausedUntil = Date.now() + this.settings.batchMs
      return
    }
    // Circuit open: wait longer each time it trips again. Jitter (50-100 %)
    // keeps many pods from retrying in step when the receiver comes back.
    this.failures = 0
    this.pauses++
    const pause = Math.min(
      BREAKER_PAUSE_MS * 2 ** (this.pauses - 1),
      BREAKER_MAX_PAUSE_MS,
    )
    this.pausedUntil = Date.now() + pause * (0.5 + Math.random() / 2)
  }
}
