import type {SourceType} from "src/shared/schemas"
import {isBlockedSlug} from "src/server/adapters/blocked"
import catalog from "./seed-companies.json"

export type SeedBoard = {
  provider: SourceType
  boardId: string
  companyName: string
  careersUrl: string
  apiUrl: string
  openJobsAtCheck: number
  plLocatedJobs: number
  identityConfirmed: boolean
  priority: number
}

type RawCompany = {
  name: string
  ats: string
  slug: string
  board_url: string
  api_url: string
  verified?: boolean
  identity_confirmed?: boolean
  open_jobs_count_at_check?: number
  pl_located_jobs_at_check?: number
  has_pl_eng_leadership_role_at_check?: boolean
  has_eu_remote_eng_leadership_role_at_check?: boolean
  has_pl_or_remote_eng_leadership_role_at_check?: boolean
}

const PROVIDERS: Record<string, SourceType> = {
  greenhouse: "GREENHOUSE",
  lever: "LEVER",
  ashby: "ASHBY",
  workable: "WORKABLE",
  smartrecruiters: "SMARTRECRUITERS",
}

function priorityOf(company: RawCompany): number {
  const leadership = company.has_pl_eng_leadership_role_at_check ? 1000 : 0
  const remote = company.has_eu_remote_eng_leadership_role_at_check ? 400 : 0
  const either = company.has_pl_or_remote_eng_leadership_role_at_check ? 100 : 0
  const plJobs = Math.min(company.pl_located_jobs_at_check ?? 0, 80) * 5
  const open = Math.min(company.open_jobs_count_at_check ?? 0, 40)
  return leadership + remote + either + plJobs + open
}

/** All verified boards from the source pack. Flagged and wrong-company slugs are excluded. */
export function loadSeedBoards(): SeedBoard[] {
  const companies = (catalog as {companies?: RawCompany[]}).companies ?? []
  const boards: SeedBoard[] = []
  for (const company of companies) {
    const provider = PROVIDERS[company.ats]
    if (!provider || !company.slug || !company.name) continue
    if (company.verified === false) continue
    if (isBlockedSlug(provider, company.slug)) continue
    boards.push({
      provider,
      boardId: company.slug,
      companyName: company.name,
      careersUrl: company.board_url,
      apiUrl: company.api_url,
      openJobsAtCheck: company.open_jobs_count_at_check ?? 0,
      plLocatedJobs: company.pl_located_jobs_at_check ?? 0,
      identityConfirmed: company.identity_confirmed !== false,
      priority: priorityOf(company),
    })
  }
  return boards.sort((a, b) => b.priority - a.priority || a.companyName.localeCompare(b.companyName))
}

export const seedBoards: SeedBoard[] = loadSeedBoards()

/**
 * Boards fetched on one scan. The catalog stays the full verified list.
 * SCAN_SEED_LIMIT=0 reads every board; the default keeps a run inside public rate limits
 * and prefers Poland / EU-remote engineering-leadership boards.
 */
export function selectSeedBoards(boards: SeedBoard[] = seedBoards, limit = seedScanLimit()): SeedBoard[] {
  if (limit <= 0 || limit >= boards.length) return boards
  return boards.slice(0, limit)
}

export function seedScanLimit(): number {
  const raw = process.env.SCAN_SEED_LIMIT
  if (raw == null || raw.trim() === "") return 40
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return 40
  return Math.floor(parsed)
}
