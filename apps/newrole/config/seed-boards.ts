import type { SourceType } from "src/shared/schemas"
import { isBlockedSlug } from "src/server/adapters/blocked"
import { WORKDAY_BOARDS, type WorkdayBoardLink } from "src/shared/workday-boards"
import { envCount } from "./env"
import catalog from "./seed-companies.json"
import polishCatalog from "./seed-companies-pl.json"

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
  lever_eu: "LEVER",
  ashby: "ASHBY",
  workable: "WORKABLE",
  smartrecruiters: "SMARTRECRUITERS",
  traffit: "TRAFFIT",
  recruitee: "RECRUITEE",
  teamtailor: "TEAMTAILOR",
  personio: "PERSONIO",
  pinpoint: "PINPOINT",
  breezy: "BREEZY",
  bamboohr: "BAMBOOHR",
  workday: "WORKDAY",
}

/**
 * Scan order for a search that tops up unread boards. Every IT role counts the same, so a board
 * ranks by the offers it had at check time, with the Polish ones it had still counted a little,
 * since the seed list was checked from Poland.
 */
function priorityOf(company: RawCompany): number {
  const open = Math.min(company.open_jobs_count_at_check ?? 0, 200) * 5
  const plJobs = Math.min(company.pl_located_jobs_at_check ?? 0, 80)
  return open + plJobs
}

function boardIdOf(company: RawCompany): string {
  if (company.ats === "lever_eu") return `eu:${company.slug}`
  return company.slug
}

function careerBoard(
  boardId: string,
  companyName: string,
  apiUrl: string,
  openJobsAtCheck: number,
  priority: number,
  plLocatedJobs = 0
): SeedBoard {
  return {
    provider: "CAREER_SITE",
    boardId,
    companyName,
    careersUrl: apiUrl,
    apiUrl,
    openJobsAtCheck,
    plLocatedJobs,
    identityConfirmed: true,
    priority,
  }
}

function fromCatalog(companies: RawCompany[]): SeedBoard[] {
  const boards: SeedBoard[] = []
  for (const company of companies) {
    const provider = PROVIDERS[company.ats]
    if (!provider || !company.slug || !company.name) continue
    if (company.verified === false) continue
    const boardId = boardIdOf(company)
    if (isBlockedSlug(provider, company.ats === "lever_eu" ? company.slug : boardId)) continue
    boards.push({
      provider,
      boardId,
      companyName: company.name,
      careersUrl: company.board_url,
      apiUrl: company.api_url,
      openJobsAtCheck: company.open_jobs_count_at_check ?? 0,
      plLocatedJobs: company.pl_located_jobs_at_check ?? 0,
      identityConfirmed: company.identity_confirmed !== false,
      priority: priorityOf(company),
    })
  }
  return boards
}

/** Verified boards from the main catalog plus the Polish add-on. Workday is fetched under the career-site policy. */
export function loadSeedBoards(): SeedBoard[] {
  const main = (catalog as { companies?: RawCompany[] }).companies ?? []
  const polish = (polishCatalog as { companies?: RawCompany[] }).companies ?? []
  const seen = new Set<string>()
  const boards: SeedBoard[] = []
  for (const board of [...fromCatalog(main), ...fromCatalog(polish)]) {
    const key = `${board.provider}:${board.boardId.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    boards.push(board)
  }
  for (const board of boards) {
    if (board.provider === "RECRUITEE" && board.boardId === "callstackpl") {
      board.priority = Math.max(board.priority, 820)
    }
  }
  boards.push(
    {
      provider: "SUCCESSFACTORS",
      boardId: "jobs.gft.com",
      companyName: "GFT",
      careersUrl: "https://jobs.gft.com/",
      apiUrl: "https://jobs.gft.com/sitemap.xml",
      openJobsAtCheck: 427,
      plLocatedJobs: 150,
      identityConfirmed: true,
      priority: 1800,
    },
    {
      provider: "SUCCESSFACTORS",
      boardId: "careers.allegro.eu",
      companyName: "Allegro",
      careersUrl: "https://careers.allegro.eu/",
      apiUrl: "https://careers.allegro.eu/sitemap.xml",
      openJobsAtCheck: 288,
      plLocatedJobs: 0,
      identityConfirmed: true,
      priority: 1700,
    },
    careerBoard(
      "www.pracujwgp.pl",
      "Grupa Pracuj",
      "https://www.pracujwgp.pl/jobs.feed.json",
      9,
      860
    ),
    careerBoard("sii.pl", "Sii Polska", "https://sii.pl/sitemap.xml", 251, 1100, 251),
    careerBoard(
      "careers.zabkagroup.com",
      "Żabka Group",
      "https://careers.zabkagroup.com/sitemap_index.xml",
      118,
      220
    ),
    careerBoard("bolt.eu", "Bolt", "https://bolt.eu/en/careers/positions/", 197, 240),
    careerBoard(
      "career.comarch.com",
      "Comarch",
      "https://career.comarch.com/sitemap.xml",
      474,
      230
    ),
    careerBoard("careers.epam.com", "EPAM", "https://careers.epam.com/sitemap.xml.gz", 225, 840),
    careerBoard("kariera.wp.pl", "Wirtualna Polska", "https://kariera.wp.pl/oferty-pracy", 27, 210),
    careerBoard("packhelp.com", "Packhelp", "https://packhelp.com/career/", 6, 200),
    careerBoard("brand24.com", "Brand24", "https://brand24.com/careers/", 1, 190),
    careerBoard("www.synerise.com", "Synerise", "https://www.synerise.com/careers", 12, 180)
  )
  return boards.sort(
    (a, b) => b.priority - a.priority || a.companyName.localeCompare(b.companyName)
  )
}

export const seedBoards: SeedBoard[] = loadSeedBoards()

/**
 * Employer Workday boards from the Polish pack. The scan reads sitemap and job
 * pages. These links stay on the results page so the original board is one click away.
 */
export function workdayOutboundLinks(): WorkdayBoardLink[] {
  const polish = (polishCatalog as { companies?: RawCompany[] }).companies ?? []
  const fromCatalog = polish
    .filter(
      (company) => company.ats === "workday" && company.verified !== false && company.board_url
    )
    .map((company) => ({
      name: company.name,
      href: company.board_url,
      note: "Opens the employer board. Not downloaded.",
    }))
  return fromCatalog.length ? fromCatalog : WORKDAY_BOARDS
}

/**
 * Boards fetched on one scan. The catalog stays the full verified list.
 * SCAN_SEED_LIMIT=0 reads every board; the default keeps a run inside public rate limits
 * and prefers the boards with the most offers.
 */
export function selectSeedBoards(
  boards: SeedBoard[] = seedBoards,
  limit = seedScanLimit()
): SeedBoard[] {
  if (limit <= 0 || limit >= boards.length) return boards
  return boards.slice(0, limit)
}

export function seedScanLimit(): number {
  return envCount("SCAN_SEED_LIMIT", 40)
}
