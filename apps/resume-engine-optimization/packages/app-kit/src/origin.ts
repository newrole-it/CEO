/**
 * Checks for route handlers that change state, in an app that serves one person from their own
 * machine. A cross-site form or a DNS-rebinding page can reach 127.0.0.1 too; the Host and Origin
 * headers give both away. `appOrigin` is the app's public origin, when it has one besides loopback.
 */

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"])

export type OriginGuard = {
  /** A Host (name and optional port) that can only mean this app: appOrigin's host or loopback. */
  isAppHost: (host: string | null | undefined) => boolean
  /** For reads: the request came in under this app's name. Same-origin GETs carry no Origin. */
  isAppHostRequest: (request: Request) => boolean
  /**
   * For writes: sent by this app's own pages. The Origin is required (browsers send it on every
   * POST) and must be appOrigin or the very host the request came in on, itself an app host.
   */
  isSameAppRequest: (request: Request) => boolean
}

export function createOriginGuard(appOrigin: () => string | null): OriginGuard {
  function appHost(): string | null {
    const origin = appOrigin()
    if (!origin) return null
    try {
      return new URL(origin).host
    } catch {
      return null
    }
  }

  function isAppHost(host: string | null | undefined): boolean {
    if (!host) return false
    try {
      const url = new URL(`http://${host}`)
      if (url.host !== host.toLowerCase()) return false
      return LOOPBACK_HOSTNAMES.has(url.hostname) || url.host === appHost()
    } catch {
      return false
    }
  }

  function isSameAppRequest(request: Request): boolean {
    const site = request.headers.get("sec-fetch-site")
    if (site && site !== "same-origin") return false
    const host = request.headers.get("host")
    if (!isAppHost(host)) return false
    const origin = request.headers.get("origin")
    if (!origin) return false
    try {
      const parsed = new URL(origin)
      if (parsed.origin === appOrigin()) return true
      return parsed.host === host!.toLowerCase()
    } catch {
      return false
    }
  }

  return {
    isAppHost,
    isAppHostRequest: (request) => isAppHost(request.headers.get("host")),
    isSameAppRequest,
  }
}
