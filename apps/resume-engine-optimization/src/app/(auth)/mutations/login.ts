import { resolver } from "@blitzjs/rpc"
import { AuthenticationError } from "blitz"
import db from "db"
import { Login, LOGIN_LIMITED } from "../validations"
import { SecurePassword } from "@blitzjs/auth/secure-password"
import { Role } from "types"
import { claimGuest } from "src/server/auth/accounts"
import { assertLoginRateLimit, AuthRateLimitError } from "src/server/auth/magic-link"
import { requestClientIp } from "src/server/security/client-ip"

export const authenticateUser = async (rawEmail: string, rawPassword: string) => {
  const { email, password } = Login.parse({ email: rawEmail, password: rawPassword })
  const user = await db.user.findFirst({ where: { email } })
  if (!user?.hashedPassword) throw new AuthenticationError()

  const result = await SecurePassword.verify(user.hashedPassword, password)

  if (result === SecurePassword.VALID_NEEDS_REHASH) {
    // Upgrade hashed password with a more secure hash
    const improvedHash = await SecurePassword.hash(password)
    await db.user.update({ where: { id: user.id }, data: { hashedPassword: improvedHash } })
  }

  const { hashedPassword, ...rest } = user
  return rest
}

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
