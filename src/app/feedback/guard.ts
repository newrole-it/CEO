import { AuthenticationError, NotFoundError } from "blitz"
import { createGuestUser } from "src/server/auth/accounts"
import { FeedbackError } from "src/server/preferences/feedback"
import { SIGN_IN_REQUIRED } from "./codes"

type Session = { userId?: number | null; role?: string | null }
type GuestSession = Session & {
  $create: (data: { userId: number; role: "GUEST" }) => Promise<void>
}

/**
 * The session user id, guests included, or AuthenticationError("sign-in-required").
 * A guest can do everything; claimGuest moves their feedback to the account at sign-in.
 */
export function requireMember(session: Session): number {
  const userId = session.userId
  if (!userId) throw new AuthenticationError(SIGN_IN_REQUIRED)
  return userId
}

/** The session user id, creating a guest session first when there is none. */
export async function userOrGuest(session: GuestSession): Promise<number> {
  if (session.userId) return session.userId
  const guest = await createGuestUser()
  await session.$create({ userId: guest.id, role: "GUEST" })
  return guest.id
}

/** The session user id when there is one (guests included), else null. */
export function optionalUser(session: Session): number | null {
  return session.userId ?? null
}

/** Maps domain errors to Blitz errors the client already understands. */
export function rethrow(error: unknown): never {
  if (error instanceof FeedbackError && error.code === "job-not-found") {
    throw new NotFoundError(error.message)
  }
  throw error
}
