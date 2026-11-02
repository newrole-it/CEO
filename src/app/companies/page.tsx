import { cookies } from "next/headers"
import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { COMPANIES_SEEN_COOKIE } from "src/app/components/site/links"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { companySuggestions, type CompanySuggestions } from "src/server/discovery/similar-companies"
import { listWatched } from "src/server/watchlist/watch"
import { Companies } from "./Companies"
import { FetchProgress } from "./FetchProgress"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("co.title") }
}

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const [locale, params, user] = await Promise.all([getLocale(), searchParams, invoke(getCurrentUser, null)])
  const t = translator(locale)
  const jar = await cookies()
  const seen = Number(jar.get(COMPANIES_SEEN_COOKIE)?.value)
  const since = Number.isFinite(seen) && seen > 0 ? new Date(seen) : undefined
  const [watched, suggestions] = user
    ? await Promise.all([
        listWatched(user.id, { since }).catch(() => []),
        companySuggestions(user.id, 9).catch(
          (): CompanySuggestions => ({ status: "unavailable", suggestions: [], canSearch: false, message: "error" })
        ),
      ])
    : [[], { status: "needs-likes", suggestions: [], canSearch: false, message: "" } as CompanySuggestions]
  return (
    <SiteFrame user={user} locale={locale}>
      <header className="page-head">
        <h1 className="t-h1">{t("co.title")}</h1>
        <p>{t("co.sub")}</p>
      </header>
      {user ? <FetchProgress /> : null}
      <Companies
        focus={params.focus ?? null}
        hasSeen={Boolean(since)}
        watched={watched.map((row) => ({
          ...row,
          lastFetchedAt: row.lastFetchedAt ? row.lastFetchedAt.toISOString() : null,
        }))}
        suggestions={suggestions}
      />
    </SiteFrame>
  )
}
