import { getLogger } from '../logger'

export interface HttpWatch {
  /** An axios instance: `axios`, `axios.create()` or `HttpService.axiosRef`. */
  client: any
  /** Name used in logs and hints when no `names` entry matches. */
  name: string
  /** Host substring → display name, e.g. { 'imauth.': 'ThaID' }. */
  names?: Record<string, string>
}

const watched = new WeakSet<object>()

function urlParts(config: any): { domain?: string; path?: string } {
  try {
    const url = new URL(config?.url ?? '', config?.baseURL)
    return { domain: url.hostname, path: url.pathname }
  } catch {
    return {}
  }
}

/**
 * Logs `http.outbound_failed` for every failed request of the client and
 * rejects with the same error. The log line has method, host, path and
 * status; the call's query string, headers and bodies (masked) are on its
 * span (src/capture/http.ts).
 */
export function watchHttp(watch: HttpWatch): void {
  const { client } = watch
  if (!client?.interceptors?.response || watched.has(client)) return
  watched.add(client)
  client.interceptors.response.use(undefined, (error: any) => {
    try {
      const { domain, path } = urlParts(error?.config)
      const status: number | undefined = error?.response?.status
      const name =
        Object.entries(watch.names ?? {}).find(([match]) =>
          domain?.includes(match),
        )?.[1] ?? watch.name
      getLogger().event({
        event: 'http.outbound_failed',
        level: status !== undefined && status < 500 ? 'warn' : 'error',
        logger: `HttpClient:${name}`,
        error,
        fields: {
          'http.request.method': error?.config?.method?.toUpperCase(),
          'url.domain': domain,
          'url.path': path,
          'http.response.status_code': status,
          'dependency.type': 'http',
          'dependency.name': name,
          'dependency.host': domain,
        },
        hintVars: { name, host: domain },
      })
    } catch {
      // logging must not change the rejection
    }
    return Promise.reject(error)
  })
}
