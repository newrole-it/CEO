type Env = Record<string, string | undefined>

/** TRUST_PROXY=1 says a reverse proxy in front of the app sets X-Forwarded-For. */
export function trustsProxy(env: Env = process.env): boolean {
  return /^(1|true|yes|on)$/i.test(env.TRUST_PROXY?.trim() ?? "")
}

/**
 * The key for per-address limits. Without a proxy anyone can write X-Forwarded-For, and a route
 * handler cannot see the socket, so every request shares the key "local". Behind a proxy the
 * rightmost entry is the address the proxy itself saw; entries left of it come from the client.
 */
export function clientIpFrom(headers: Headers, env: Env = process.env): string {
  if (!trustsProxy(env)) return "local"
  const forwarded = (headers.get("x-forwarded-for") ?? "").split(",")
  const last = forwarded
    .map((part) => part.trim())
    .filter(Boolean)
    .pop()
  return last || headers.get("x-real-ip")?.trim() || "local"
}

/**
 * The same key for code that has no Request, such as a Blitz resolver. Imported on call: client
 * components import resolver files, and a static next/headers import fails the client build.
 */
export async function requestClientIp(): Promise<string> {
  const { headers } = await import("next/headers")
  try {
    return clientIpFrom(await headers())
  } catch {
    // Called outside a request (a script or a test): there is no client address to key on.
    return "local"
  }
}
