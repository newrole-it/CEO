import { loadAppEnv } from "./root-env"
import { labDatabaseUrl, refusal } from "./databases"
import "../src/server/http"

/**
 * Imported first by the lab's scripts: the lab's .env files, then the repository root's
 * (scripts/root-env.js), the lab's HTTP client for @newrole/ats, and the database the engine may
 * write to. That is never newrole.it's own: JOBS_LAB_DATABASE_URL, or DATABASE_URL's database with
 * "_lab" added (scripts/databases.js).
 */
loadAppEnv()

/** The lab's database URL, or a one-line reason why there is none the lab may use. */
export function labDatabase(
  env: NodeJS.ProcessEnv = process.env
): { url: string } | { reason: string } {
  const url = labDatabaseUrl(env)
  if (!url)
    return {
      reason:
        "no database: set DATABASE_URL in .env (npm run go writes it) or JOBS_LAB_DATABASE_URL",
    }
  const refused = refusal(url, env)
  return refused ? { reason: refused } : { url }
}
