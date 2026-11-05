import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { checkOfferUrl } from "src/server/applications/read-offer"
import { requireMember } from "src/app/users/guard"

/** "Dodaj aplikację": fills company and role from the index and warns about a duplicate. */
export default resolver.pipe(
  resolver.zod(z.object({ url: z.string().max(2000) })),
  resolver.authorize(),
  async ({ url }, ctx) => {
    const userId = requireMember(ctx.session)
    return checkOfferUrl(userId, url, { read: false })
  }
)
