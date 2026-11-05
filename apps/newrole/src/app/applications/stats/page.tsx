import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { loadInsightsInput } from "src/server/applications/service"
import { parseRange } from "./range"
import { StatsScreen } from "./StatsScreen"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: `${t("stx.title")} · ${t("app.title")}` }
}

/** Statistics of the whole process, for the session user (guests too). `?w=` is the range in weeks. */
export default async function ApplicationStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>
}) {
  const [locale, params, user] = await Promise.all([
    getLocale(),
    searchParams,
    invoke(getCurrentUser, null),
  ])
  const input = user
    ? await loadInsightsInput(user.id)
    : { applications: [], decisions: [], answers: [] }
  return (
    <SiteFrame user={user} locale={locale}>
      <StatsScreen
        signedIn={Boolean(user)}
        input={input}
        initialRange={parseRange(params.w)}
        now={new Date().toISOString()}
      />
    </SiteFrame>
  )
}
