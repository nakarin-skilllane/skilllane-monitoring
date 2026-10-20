import { getLogger } from '../logger'

let deferred = false
let logged = false

/**
 * An HTTP app logs `app.started` after listen() so the line carries the port;
 * setupLogging defers the bootstrap line when the app has listen().
 */
export function deferAppStarted(): void {
  deferred = true
}

export function isAppStartedDeferred(): boolean {
  return deferred
}

export function logAppStarted(port?: number): void {
  if (logged) return
  logged = true
  getLogger().event({
    event: 'app.started',
    logger: '@skilllane/monitoring',
    fields: {
      'server.port': port,
      duration_ms: Math.round(process.uptime() * 1000),
    },
  })
}

/** Wraps app.listen: the line is written once the server is listening. */
/**
 * Logs `app.started` with the port once the HTTP server listens. Listens for
 * the server's `listening` event: replacing `app.listen` does nothing,
 * because Nest's application proxy swallows property writes.
 */
export function logStartedAfterListen(app: {
  getHttpServer?: () => any
}): void {
  let server: any
  try {
    server = app.getHttpServer?.()
  } catch {
    return
  }
  if (!server || typeof server.once !== 'function') return
  deferAppStarted()
  server.once('listening', () => {
    let port: number | undefined
    try {
      const address = server.address?.()
      port = typeof address === 'object' && address ? address.port : undefined
    } catch {
      // the line is still worth writing without a port
    }
    logAppStarted(port)
  })
}
