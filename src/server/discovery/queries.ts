const ATS = new Set(["greenhouse", "lever", "ashby", "workable", "smartrecruiters"])

export type SiteQuery = {source: string; site: string; query: string}

/**
 * Discovery calls are capped. Polish boards, LinkedIn, and unverified ATS hosts
 * are never requested. One query per live ATS comes first so a short budget
 * still covers Greenhouse, Lever, Ashby, Workable, and SmartRecruiters.
 */
export function pickDiscoveryQueries(sites: SiteQuery[], limit = discoveryQueryLimit()): string[] {
  const eligible = sites.filter((item) => ATS.has(item.source))
  const picked: string[] = []
  const seenSource = new Set<string>()
  for (const item of eligible) {
    if (seenSource.has(item.source)) continue
    seenSource.add(item.source)
    picked.push(item.query)
    if (picked.length >= limit) return picked
  }
  for (const item of eligible) {
    if (picked.includes(item.query)) continue
    picked.push(item.query)
    if (picked.length >= limit) break
  }
  return picked
}

export function discoveryQueryLimit(): number {
  const raw = process.env.DISCOVERY_QUERY_LIMIT
  if (raw == null || raw.trim() === "") return 8
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return 8
  return Math.floor(parsed)
}
