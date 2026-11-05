import { resolver } from "@blitzjs/rpc"
import db from "db"
import { z } from "zod"
import { createGuestUser } from "src/server/auth/accounts"
import { watchCompany } from "src/server/watchlist/watch"

const Input = z
  .object({
    url: z.string().trim().max(500).optional(),
    name: z.string().trim().max(160).optional(),
    /** A company already in the index (drawer, suggestions). */
    companyId: z.string().min(1).max(64).optional(),
    source: z.enum(["user", "similar"]).default("user"),
    reason: z.string().max(300).optional(),
  })
  .refine((value) => value.url || value.name || value.companyId, "Give a URL, a name or a company")

/**
 * Watch a company by career page URL, name, or index id. A visitor without a session gets a
 * guest session, like saving a profile (guests can do everything; ux-spec §1.1).
 */
export default resolver.pipe(resolver.zod(Input), async (input, ctx) => {
  let userId = ctx.session.userId
  if (!userId) {
    const guest = await createGuestUser()
    await ctx.session.$create({ userId: guest.id, role: "GUEST" })
    userId = guest.id
  }
  let name = input.name
  if (input.companyId && !input.url && !name) {
    const company = await db.company.findUnique({
      where: { id: input.companyId },
      select: { name: true },
    })
    name = company?.name
  }
  const looksLikeUrl = (value: string) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(value)
  let url = input.url
  if (!url && name && looksLikeUrl(name) && !name.includes(" ")) {
    url = name
    name = undefined
  }
  return watchCompany({ userId, url, name, source: input.source, reason: input.reason })
})
