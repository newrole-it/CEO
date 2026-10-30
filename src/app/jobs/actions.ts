"use server"

import { getBlitzContext } from "src/app/blitz-server"
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
  return loadFeed({ tab, filters, next, userId, locale: locale === "en" ? "en" : "pl" })
}
