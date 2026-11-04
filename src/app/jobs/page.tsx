import { cookies, headers } from "next/headers"
import db from "db"
import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { COMPANIES_SEEN_COOKIE } from "src/app/components/site/links"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import {
  countOpenOffers,
  listBrowseCities,
  listBrowseCountries,
  resolveBrowse,
} from "src/server/jobs/browse"
import { defaultCountry } from "src/server/jobs/country"
import { getPreferenceSummary, type PreferenceSummary } from "src/server/preferences/model"
import { findSimilarOffers } from "src/server/preferences/similar"
import { listWatched } from "src/server/watchlist/watch"
import { Feed } from "./components/Feed"
import { loadFeed } from "./feed-data"
import { parseFilters } from "./feed-filters"
import type { FeedTab } from "./types"

type Params = Record<string, string | string[] | undefined>
const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? ""

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("feed.title") }
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const [locale, params, user] = await Promise.all([
    getLocale(),
    searchParams,
    invoke(getCurrentUser, null),
  ])
  const filters = parseFilters(params)
  const userId = user?.id ?? null
  // A company link lists that company's offers wherever they are, so no country is assumed.
  const ownCountry = filters.company
    ? null
    : await defaultCountry(userId, (await headers()).get("accept-language"))
  // The country the list covers, decided as the list decides it: picked, else the city's, else
  // the person's own; null is every country.
  const country = resolveBrowse({
    country: filters.country || undefined,
    city: filters.city,
    defaultCountry: ownCountry,
  }).country

  const hasProfile = userId
    ? Boolean(await db.candidateProfile.findUnique({ where: { userId }, select: { id: true } }))
    : false
  const hasFeedback = userId ? (await db.offerFeedback.count({ where: { userId } })) > 0 : false
  const requested = one(params.tab)
  const tab: FeedTab =
    requested === "all" || requested === "foryou"
      ? (requested as FeedTab)
      : hasProfile || hasFeedback
      ? "foryou"
      : "all"

  const jar = await cookies()
  const seen = Number(jar.get(COMPANIES_SEEN_COOKIE)?.value)
  const similarId = one(params.similar).slice(0, 64)

  const [
    initial,
    totalOpen,
    openInScope,
    cities,
    countries,
    summary,
    watchedRows,
    similar,
    company,
  ] = await Promise.all([
    loadFeed({ tab, filters, userId, locale, defaultCountry: ownCountry }),
    countOpenOffers(),
    country ? countOpenOffers(country, { remoteHere: filters.remoteHere }) : Promise.resolve(null),
    listBrowseCities(country),
    listBrowseCountries(),
    userId
      ? getPreferenceSummary(userId, locale).catch(() => null)
      : Promise.resolve(null as PreferenceSummary | null),
    userId
      ? listWatched(userId, {
          since: Number.isFinite(seen) && seen > 0 ? new Date(seen) : undefined,
        }).catch(() => [])
      : Promise.resolve([]),
    userId && similarId
      ? Promise.all([
          findSimilarOffers({ userId, jobId: similarId, limit: 24, locale }),
          db.job.findUnique({
            where: { id: similarId },
            select: { title: true, company: { select: { name: true } } },
          }),
        ]).catch(() => null)
      : Promise.resolve(null),
    filters.company
      ? db.company.findUnique({ where: { id: filters.company }, select: { name: true } })
      : Promise.resolve(null),
  ])

  return (
    <SiteFrame user={user} locale={locale}>
      <Feed
        key={`${tab}|${JSON.stringify(filters)}|${similarId}`}
        tab={tab}
        filters={filters}
        initial={initial}
        totalOpen={totalOpen}
        openInScope={openInScope}
        cities={cities}
        countries={countries}
        country={country}
        ownCountry={ownCountry}
        companyName={company?.name ?? null}
        hasSession={Boolean(user)}
        signedIn={Boolean(user && user.role !== "GUEST")}
        summary={summary}
        watched={{
          count: watchedRows.length,
          fresh: watchedRows.reduce((sum, row) => sum + (row.newJobs ?? 0), 0),
        }}
        welcome={one(params.welcome) === "1"}
        similarTo={
          similar && similar[1]
            ? {
                id: similarId,
                title: similar[1].title,
                company: similar[1].company.name,
                basis: similar[0].basis,
                offers: similar[0].offers,
              }
            : null
        }
        initialOffer={one(params.offer) || null}
      />
    </SiteFrame>
  )
}
