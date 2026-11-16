"use server"
import { resolver } from "src/server/rpc"
import { getLocale } from "src/app/i18n/server"
import { requireMember } from "src/app/users/guard"
import { draftStories } from "src/server/interview/stories"
import { DraftStoriesInput, rethrowStory } from "../schema"

/**
 * Drafts stories from the person's CV and profile, in their interface language. A mutation
 * because it runs the model for up to a couple of minutes and must never be refetched on its own.
 */
export default resolver.pipe(resolver.zod(DraftStoriesInput), async ({ count }, ctx) => {
  const userId = requireMember(ctx.session)
  try {
    return await draftStories(userId, { locale: await getLocale(), count })
  } catch (error) {
    rethrowStory(error)
  }
})
