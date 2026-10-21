const BOOT_LOGGED = Symbol.for('skilllane-monitoring.boot-logged')

/** True when this error's app.boot_failed line is already written. */
export function isBootFailureLogged(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && (error as any)[BOOT_LOGGED],
  )
}

export function markBootFailureLogged(error: unknown): void {
  if (error && typeof error === 'object') {
    try {
      Object.defineProperty(error, BOOT_LOGGED, { value: true })
    } catch {
      // a frozen error is logged again at worst
    }
  }
}
