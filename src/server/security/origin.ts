import { appOrigin } from "src/server/auth/email"

/**
 * Checks for route handlers that change state with the session cookie. Blitz's getBlitzContext
 * copies the anti-CSRF cookie into the header itself, so these routes get no CSRF check from it.
 */

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"])

/**
 * A Host (name and optional port) that can only mean this app: APP_ORIGIN's host or a loopback
 * name. A DNS-rebinding page reaches the app under its own name, so the Host header gives it away.
 */
export function isAppHost(host: string | null | undefined): boolean {
  if (!host) return false
  try {
    const url = new URL(`http://${host}`)
    if (url.host !== host.toLowerCase()) return false
    return LOOPBACK_HOSTNAMES.has(url.hostname) || url.host === new URL(appOrigin()).host
  } catch {
    return false
  }
}

/** For reads: the request came in under this app's name. Same-origin GETs carry no Origin. */
export function isAppHostRequest(request: Request): boolean {
  return isAppHost(request.headers.get("host"))
}

/**
 * For writes: sent by this app's own pages. The Origin is required (browsers send it on every
 * POST) and must be APP_ORIGIN or the very host the request came in on, itself an app host.
 */
export function isSameAppRequest(request: Request): boolean {
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

export function crossSiteRefused(): Response {
  return Response.json({ error: "Start this from Nowa Rola.", code: "origin" }, { status: 403 })
}
