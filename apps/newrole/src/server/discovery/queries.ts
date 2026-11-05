import { envCount } from "config/env"

const ATS = new Set([
  "greenhouse",
  "lever",
  "lever_eu",
  "ashby",
  "workable",
  "smartrecruiters",
  "teamtailor",
  "recruitee",
  "personio",
  "traffit",
  "pinpoint",
  "breezy",
  "bamboohr",
])

const FIRST_SOURCES = [
  "greenhouse",
  "lever",
  "lever_eu",
  "ashby",
  "workable",
  "smartrecruiters",
  "teamtailor",
  "recruitee",
  "personio",
  "traffit",
  "pinpoint",
  "breezy",
  "bamboohr",
]

const EXTRA_SITES: Array<{ source: string; site: string }> = [
  { source: "lever_eu", site: "jobs.eu.lever.co" },
  { source: "recruitee", site: "recruitee.com" },
  { source: "personio", site: "jobs.personio.de" },
  { source: "traffit", site: "traffit.com" },
  { source: "pinpoint", site: "pinpointhq.com" },
  { source: "breezy", site: "breezy.hr" },
  { source: "bamboohr", site: "bamboohr.com" },
]

export type SiteQuery = { source: string; site: string; query: string }

/**
 * The matching pack already emits teamtailor.com. These hosts are added here
 * so site: syntax stays in code. Polish boards and Workday are never queried.
 */
export function extraAtsQueries(sites: SiteQuery[]): SiteQuery[] {
  const sample = sites.find((item) => ATS.has(item.source) && item.query.startsWith("site:"))
  if (!sample) return []
  const rest = sample.query.replace(/^site:\S+\s*/, "").trim()
  if (!rest) return []
  return EXTRA_SITES.filter((item) => !sites.some((site) => site.site === item.site)).map(
    (item) => ({
      source: item.source,
      site: item.site,
      query: `site:${item.site} ${rest}`,
    })
  )
}

/**
 * Discovery calls are capped. Polish boards, LinkedIn, and Workday are never
 * requested. One query per live ATS comes first.
 */
export function pickDiscoveryQueries(sites: SiteQuery[], limit = discoveryQueryLimit()): string[] {
  const eligible = [...sites, ...extraAtsQueries(sites)].filter((item) => ATS.has(item.source))
  const picked: string[] = []
  const seenSource = new Set<string>()
  for (const source of FIRST_SOURCES) {
    const item = eligible.find((candidate) => candidate.source === source)
    if (!item || seenSource.has(item.source)) continue
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
  return envCount("DISCOVERY_QUERY_LIMIT", 14)
}
