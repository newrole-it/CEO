import { AuthenticationError } from "blitz"
import { createGuestUser } from "src/server/auth/accounts"

type Session = { userId?: number | null; role?: string | null }
type GuestSession = Session & {
  $create: (data: { userId: number; role: "GUEST" }) => Promise<void>
}

/**
 * The message of the AuthenticationError a resolver throws when there is no session at all: show
 * the sign-in prompt instead of an error.
 */
export const SIGN_IN_REQUIRED = "sign-in-required"

/** The session user id, guests included, or AuthenticationError("sign-in-required"). */
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
