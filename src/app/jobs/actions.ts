"use server"

import { headers } from "next/headers"
import { getBlitzContext } from "src/app/blitz-server"
import { defaultCountry } from "src/server/jobs/country"
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
  const country = filters.country
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
