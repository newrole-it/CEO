import "./interview.css"
import { STORY_MAX } from "@newrole/cv-core/stories"
import { invoke } from "src/app/rpc"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { listStories } from "src/server/interview/stories"
import { llmProvider } from "src/server/llm/client"
import { StoriesScreen } from "./StoriesScreen"
import { toRow } from "./rows"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("iv.stories.title") }
}

/**
 * The story bank: the person's reusable interview stories. `?new=1` opens an empty story, and
 * `?topic=` puts a requirement an interview preparation found no story for into its themes.
 */
export default async function StoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; topic?: string }>
}) {
  const [query, locale, user] = await Promise.all([
    searchParams,
    getLocale(),
    invoke(getCurrentUser, null),
  ])
  const rows = user ? await listStories(user.id) : []
  // a requirement too long for a theme is not cut in the middle of a word: the person names it
  const topic = typeof query.topic === "string" ? query.topic.trim() : ""
  return (
    <SiteFrame user={user} locale={locale}>
      <StoriesScreen
        signedIn={Boolean(user)}
        initialRows={rows.map(toRow)}
        canDraft={llmProvider() !== "none"}
        startNew={Boolean(query.new)}
        topic={topic.length <= STORY_MAX.theme ? topic : ""}
      />
    </SiteFrame>
  )
}
