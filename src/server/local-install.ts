export function isLoopbackOrigin(origin: string | undefined): boolean {
  try {
    const host = new URL(origin || "http://127.0.0.1").hostname
    return (
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "[::1]" ||
      host.endsWith(".localhost")
    )
  } catch {
    return false
  }
}

/**
 * The person's own machine, not a public deployment. Only there do /setup and its status exist:
 * they show folders and commands, and they talk about processes on this computer.
 */
export function isLocalInstall(env: Record<string, string | undefined> = process.env): boolean {
  return isLoopbackOrigin(env.APP_ORIGIN)
}
