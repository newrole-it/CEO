export type SavedSearchChip = {
  id: string
  phrase: string
  locationHint?: string | null
  createdAt: Date | string | number
  newJobs?: number
}

export function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ")
}

function createdAtTime(value: Date | string | number): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

/** Newest search for each normalized phrase + location, capped for the landing chips. */
export function dedupeSavedSearches<T extends SavedSearchChip>(
  searches: readonly T[],
  limit = 5
): T[] {
  const cap = Math.max(0, limit)
  const ranked = searches
    .map((search, index) => ({ search, index }))
    .sort((a, b) => {
      const delta = createdAtTime(b.search.createdAt) - createdAtTime(a.search.createdAt)
      return delta === 0 ? a.index - b.index : delta
    })
  const seen = new Set<string>()
  const unique: T[] = []
  for (const { search } of ranked) {
    const key = `${normalizeSearchText(search.phrase)}\u0000${normalizeSearchText(
      search.locationHint
    )}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(search)
    if (unique.length >= cap) break
  }
  return unique
}
