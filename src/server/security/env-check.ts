// Relative, so db/seed.ts can run it under tsx without path aliases.
import { isLocalInstall } from "../local-install"

/**
 * The sample values in .env.example are public, so on a server other people reach they protect
 * nothing: Blitz checks only the length of SESSION_SECRET_KEY, and a session cookie signed with
 * the sample key was accepted. A loopback install is left alone, only this computer reaches it.
 */

type Env = Record<string, string | undefined>

const MIN_SECRET = 32

// Printed in .env.example, in package.json (test:flow) and in the Dockerfile build step.
const PUBLIC_SECRETS = new Set([
  "replace-with-a-random-string-of-32-plus-chars",
  "jobscanner-dev-session-secret-key-32b",
  "build-time-placeholder-not-a-runtime-secret",
])
// .env.example and the db/seed.ts fallback.
const SAMPLE_OWNER_PASSWORDS = new Set(["jobscanner-local"])
// .env.example and the DATABASE_URL in it.
const SAMPLE_DB_PASSWORDS = new Set(["jobscanner"])

function isWeakSecret(value: string): boolean {
  return value.length < MIN_SECRET || PUBLIC_SECRETS.has(value) || /^replace-with/i.test(value)
}

function databasePassword(url: string | undefined): string | null {
  if (!url) return null
  try {
    return decodeURIComponent(new URL(url).password) || null
  } catch {
    return null
  }
}

/** What is unsafe about this environment for a public production server. Empty when nothing. */
export function unsafeEnvProblems(env: Env = process.env): string[] {
  if (env.NODE_ENV !== "production") return []
  // next build loads server modules with the Dockerfile's placeholder secret; that is not a start.
  if (env.NEXT_PHASE === "phase-production-build") return []
  if (isLocalInstall(env)) return []
  const problems: string[] = []
  if (isWeakSecret(env.SESSION_SECRET_KEY?.trim() ?? "")) {
    problems.push("SESSION_SECRET_KEY is missing, shorter than 32 characters or a published sample")
  }
  const gmailKey = env.GMAIL_TOKEN_KEY?.trim()
  if (gmailKey && isWeakSecret(gmailKey)) {
    problems.push("GMAIL_TOKEN_KEY is shorter than 32 characters or a published sample")
  }
  if (env.OWNER_PASSWORD && SAMPLE_OWNER_PASSWORDS.has(env.OWNER_PASSWORD)) {
    problems.push("OWNER_PASSWORD still has the sample value from .env.example")
  }
  const dbPassword = databasePassword(env.DATABASE_URL)
  if (
    (env.POSTGRES_PASSWORD && SAMPLE_DB_PASSWORDS.has(env.POSTGRES_PASSWORD)) ||
    (dbPassword && SAMPLE_DB_PASSWORDS.has(dbPassword))
  ) {
    problems.push("POSTGRES_PASSWORD (or the password in DATABASE_URL) still has the sample value")
  }
  return problems
}

/** Throws with every problem listed, so a public server never runs on the published samples. */
export function assertSafeProductionEnv(env: Env = process.env): void {
  const problems = unsafeEnvProblems(env)
  if (problems.length === 0) return
  throw new Error(
    [
      `Nowa Rola refuses to start on ${env.APP_ORIGIN} with sample or weak secrets:`,
      ...problems.map((problem) => `- ${problem}`),
      "Generate new values (openssl rand -hex 32), put them in .env and start again.",
    ].join("\n")
  )
}
