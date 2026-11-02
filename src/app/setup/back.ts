import { cookies } from "next/headers"
import { SETUP_SKIP_COOKIE } from "src/app/components/site/links"
import { isLocalInstall } from "src/server/local-install"
import { setupUnfinished } from "src/server/setup/status"

/** "/setup" on a local install whose checklist this browser has not skipped, else null. */
export async function setupPage(): Promise<"/setup" | null> {
  if (!isLocalInstall()) return null
  const jar = await cookies()
  return jar.get(SETUP_SKIP_COOKIE) ? null : "/setup"
}

/**
 * "/setup" while the local checklist has steps left and this browser has not skipped it, else
 * null. A setup step (sign-in, profile, details, CV) ends there, so nobody is left mid-way.
 */
export async function setupBack(userId: number | null): Promise<"/setup" | null> {
  if (!(await setupPage())) return null
  // A dead database is a step on /setup too, and the checklist says so.
  const unfinished = await setupUnfinished(userId).catch(() => true)
  return unfinished ? "/setup" : null
}
