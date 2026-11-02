import db from "db"
import { mcpHost } from "./host"

export type McpUser = { id: number; email: string; name: string | null; how: string }

type Candidate = { id: number; email: string; name: string | null; role: string }

/**
 * Who the local MCP server acts for: NEWROLE_USER_EMAIL (or the old name NOWAROLA_USER_EMAIL),
 * else the only regular account, else the owner (OWNER_EMAIL or the admin). Guests never count.
 */
export function pickUser(
  users: Candidate[],
  env: Record<string, string | undefined>
): { user: Candidate; how: string } | { error: string } {
  const fromNew = env.NEWROLE_USER_EMAIL?.trim().toLowerCase()
  // The variable's name before the rename to newrole.it, still read so existing setups keep working.
  const fromOld = env.NOWAROLA_USER_EMAIL?.trim().toLowerCase()
  const wanted = fromNew || fromOld
  const name = fromNew ? "NEWROLE_USER_EMAIL" : "NOWAROLA_USER_EMAIL"
  if (wanted) {
    const user = users.find((item) => item.email.toLowerCase() === wanted)
    if (user) return { user, how: name }
    return {
      error: `No account with ${name}=${wanted}. Sign in once at the local site, or fix the variable.`,
    }
  }
  const regular = users.filter((item) => item.role === "USER")
  if (regular.length === 1) return { user: regular[0], how: "the only regular account" }
  const ownerEmail = env.OWNER_EMAIL?.trim().toLowerCase()
  const owner =
    (ownerEmail && users.find((item) => item.email.toLowerCase() === ownerEmail)) ||
    users.find((item) => item.role === "ADMIN")
  if (owner) {
    const note =
      regular.length > 1 ? ` (${regular.length} accounts exist; set NEWROLE_USER_EMAIL)` : ""
    return { user: owner, how: `the owner account${note}` }
  }
  return {
    error:
      "No account in the local database. Run `npm run setup` (creates the owner) or sign in once at http://127.0.0.1:43123, then retry.",
  }
}

let resolved: McpUser | null = null

export class NoUserError extends Error {}

export async function currentUser(): Promise<McpUser> {
  const hosted = mcpHost().currentUser
  if (hosted) return hosted()
  if (resolved) return resolved
  const users = await db.user.findMany({
    where: { deletedAt: null, role: { not: "GUEST" } },
    select: { id: true, email: true, name: true, role: true },
    orderBy: { id: "asc" },
  })
  const picked = pickUser(users, process.env)
  if ("error" in picked) throw new NoUserError(picked.error)
  resolved = {
    id: picked.user.id,
    email: picked.user.email,
    name: picked.user.name,
    how: picked.how,
  }
  return resolved
}
