export interface AppErrorOptions {
  hint?: string
  hintDetail?: string
  cause?: unknown
}

/**
 * An error that carries its own code and hint, for failures the hint table
 * cannot know about. The hint replaces any lookup from the table.
 */
export class AppError extends Error {
  readonly code: string
  readonly hint?: string
  readonly hintDetail?: string

  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(message)
    this.name = 'AppError'
    // Set by hand: the es2021 lib target has no ErrorOptions.
    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        enumerable: false,
        writable: true,
        configurable: true,
      })
    }
    this.code = code
    this.hint = options.hint
    this.hintDetail = options.hintDetail
  }
}
