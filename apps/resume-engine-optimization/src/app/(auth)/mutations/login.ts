"use server"
import { resolver } from "src/server/rpc"
import { AuthenticationError } from "src/shared/errors"
import { authenticateUser } from "src/server/auth/password"
import { Login, LOGIN_LIMITED } from "../validations"
import type { Role } from "types"
import { claimGuest } from "src/server/auth/accounts"
import { assertLoginRateLimit, AuthRateLimitError } from "src/server/auth/magic-link"
import { requestClientIp } from "src/server/security/client-ip"

export default resolver.pipe(resolver.zod(Login), async ({ email, password }, ctx) => {
  // Counted before the password is checked, so guessing costs a slot whether it hits or not.
  try {
    await assertLoginRateLimit(email, await requestClientIp())
  } catch (error) {
    if (error instanceof AuthRateLimitError) throw new AuthenticationError(LOGIN_LIMITED)
    throw error
  }
  const user = await authenticateUser(email, password)
  const previous = ctx.session.userId ?? null
  if (previous && previous !== user.id) await claimGuest(previous, user.id)
  await ctx.session.$create({ userId: user.id, role: user.role as Role })
  return user
})
