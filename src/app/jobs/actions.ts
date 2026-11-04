"use server"

import { headers } from "next/headers"
import { getBlitzContext } from "src/app/blitz-server"
import { listBrowseCities } from "src/server/jobs/browse"
import { defaultCountry } from "src/server/jobs/country"
import { suggestTitles, type TitleSuggestion } from "src/server/jobs/title-suggest"
import { loadFeed, type FeedChunk, type FeedFilters } from "./feed-data"
import type { FeedTab } from "./types"

/** "Pokaż więcej" for both tabs. */
export async function loadMoreFeed(
  tab: FeedTab,
  filters: FeedFilters,
  next: string,
  locale: "pl" | "en"
): Promise<FeedChunk> {
  let userId: number | null = null
  try {
    const ctx = await getBlitzContext()
    userId = ctx.session.userId ?? null
  } catch {}
  // As on the page: a picked country or a company link leaves no country to assume.
  const country =
    filters.country || filters.company
      ? null
      : await defaultCountry(userId, (await headers()).get("accept-language"))
  return loadFeed({
    tab,
    filters,
    next,
    userId,
    locale: locale === "en" ? "en" : "pl",
    defaultCountry: country,
  })
}

/** The place filter's city list for a country picked in it (null: every country). */
export async function loadCities(
  country: string | null
): Promise<{ city: string; count: number }[]> {
  const code = country && /^[A-Z]{2}$/.test(country) ? country : null
  return listBrowseCities(code)
}

/** Titles in the index for the tag search box, as someone types. */
export async function loadTitleSuggestions(text: string): Promise<TitleSuggestion[]> {
  return suggestTitles(String(text).slice(0, 80))
}
