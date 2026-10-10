import { resolver } from "@blitzjs/rpc"
import db from "db"

export default resolver.pipe(resolver.authorize(), async (_input: unknown, ctx) => {
  const userId = ctx.session.userId!
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return { deleted: "missing" as const }
  await db.loginLink.deleteMany({ where: { email: user.email } })
  await db.candidateProfile.deleteMany({ where: { userId } })
  await db.savedSearch.deleteMany({ where: { userId } })
  await db.token.deleteMany({ where: { userId } })
  if (user.role === "ADMIN") return { deleted: "data" as const }
  await ctx.session.$revoke()
  await db.user.delete({ where: { id: userId } })
  return { deleted: "account" as const }
})
