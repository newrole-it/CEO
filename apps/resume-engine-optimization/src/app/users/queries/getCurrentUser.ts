"use server"
import { resolver } from "src/server/rpc"
import db from "db"

export default resolver.pipe(async (_: null, ctx) => {
  if (!ctx.session.userId) return null
  const user = await db.user.findFirst({
    where: { id: ctx.session.userId },
    select: { id: true, name: true, email: true, role: true, locale: true, imageUrl: true },
  })

  return user
})
