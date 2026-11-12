"use server"
import { resolver } from "src/server/rpc"
import { requireMember } from "src/app/users/guard"
import { composeDrafts } from "src/server/answers/compose"
import { DraftAnswerInput } from "../schema"

const KEY = "answer"

/**
 * One draft for "Nowa odpowiedź na podstawie bazy". A mutation because it can run the model for
 * up to a minute or two and must never be refetched on its own.
 */
export default resolver.pipe(resolver.zod(DraftAnswerInput), async (input, ctx) => {
  const userId = requireMember(ctx.session)
  const result = await composeDrafts({
    userId,
    questions: [{ key: KEY, question: input.question, maxChars: input.maxChars }],
    context: { company: input.company, jobTitle: input.jobTitle, url: input.url },
    language: input.language,
  })
  const draft = result.drafts[KEY] ?? { text: "", basedOn: [], reader: "none" as const }
  return {
    ...draft,
    sources: draft.basedOn.flatMap((id) => (result.sources[id] ? [result.sources[id]] : [])),
    jobFromIndex: result.jobFromIndex,
    company: result.company,
    jobTitle: result.jobTitle,
  }
})
