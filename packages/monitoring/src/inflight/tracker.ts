import { describeEntry, type InflightEntry } from './types'

/**
 * The single start/finish point for work in progress. The in-memory list
 * feeds `job.inflight` on the last log lines of a dying process.
 */
export class InflightTracker {
  private readonly memory = new Map<string, InflightEntry>()
  start(field: string, entry: InflightEntry): void {
    this.memory.set(field, entry)
  }

  finish(field: string): void {
    this.memory.delete(field)
  }

  /** Short descriptions of the work in progress, for `job.inflight`. */
  list(): string[] {
    return [...this.memory.values()].map(describeEntry)
  }

  get size(): number {
    return this.memory.size
  }
}

export const inflight = new InflightTracker()
