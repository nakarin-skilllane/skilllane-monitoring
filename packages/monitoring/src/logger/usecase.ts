import { AsyncLocalStorage } from 'async_hooks'

/**
 * The CQRS query/command running right now. Separate from the request scope:
 * a request may run several queries in parallel, and a command may run a
 * query inside it, so each run gets its own store.
 */
const storage = new AsyncLocalStorage<string>()

const USECASE = Symbol.for('@skilllane/monitoring.usecase')

export function currentUsecase(): string | undefined {
  return storage.getStore()
}

/** The innermost use case an error escaped from, if it passed through one. */
export function usecaseOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const value = (error as Record<symbol, unknown>)[USECASE]
  return typeof value === 'string' ? value : undefined
}

function tag(error: unknown, name: string): void {
  if (typeof error !== 'object' || error === null || usecaseOf(error)) return
  try {
    Object.defineProperty(error, USECASE, { value: name, enumerable: false })
  } catch {
    // frozen error: the log line falls back to the current use case
  }
}

/**
 * Runs `fn` as use case `name`. An error leaving it is tagged with the name,
 * so the exception filter — which runs after the store is gone — still
 * knows where it came from. The innermost use case wins.
 */
export async function runUsecase<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(name, async () => {
    try {
      return await fn()
    } catch (error) {
      tag(error, name)
      throw error
    }
  })
}

/** QueryBus / CommandBus classes of the app (`@nestjs/cqrs`). */
export interface CqrsClasses {
  QueryBus?: { prototype: { execute: (...args: any[]) => any } }
  CommandBus?: { prototype: { execute: (...args: any[]) => any } }
}

const PATCHED = Symbol.for('@skilllane/monitoring.cqrs-patched')

/**
 * Wraps `execute` of the app's buses once, so every query/command runs as a
 * use case. Handlers stay unchanged; the bus behaves exactly as before.
 */
export function installCqrsWatch(classes: CqrsClasses): void {
  for (const Bus of [classes.QueryBus, classes.CommandBus]) {
    const proto = Bus?.prototype as any
    if (!proto || typeof proto.execute !== 'function' || proto[PATCHED]) {
      continue
    }
    const original = proto.execute
    proto.execute = function execute(message: any, ...rest: unknown[]) {
      const name = message?.constructor?.name
      if (typeof name !== 'string' || !name || name === 'Object') {
        return original.call(this, message, ...rest)
      }
      return runUsecase(name, () => original.call(this, message, ...rest))
    }
    proto[PATCHED] = true
  }
}
