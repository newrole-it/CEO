import db from "db"
import { detectSeniority, normalizeTitle, titleCore, titleTokens } from "matching/normalization"
import {
  boardUrlFacts,
  extractJobByRules,
  normalizePostingUrl,
} from "src/server/autofill/job-extract"
import { companyMapFor } from "src/server/companies/aliases"
import {
  compareCompanies,
  identifyCompany,
  isPlatformName,
  type CompanyMap,
} from "src/server/companies/names"
import { statusLabel, statusTone, type ApplicationStatus } from "src/shared/applications"
import { urlKey } from "./logic"
import { findJobByUrl, type IndexedJob } from "./service"

/**
 * "Did I already apply to this?" for the offer the person is looking at (E5.6). The same offer has
 * many addresses: seen on LinkedIn, sent through the company's ATS. So the address comes first, and
 * after it the company, through the map in CompanyAlias, and the role, by the same rules as
 * matching/dedupe.ts. No model and no fetch: this runs on every offer.
 */

export type OfferPage = {
  url: string
  /** Read by the extension from the page's JobPosting data or LinkedIn's details */
  company?: string | null
  title?: string | null
  /** Sent on known ATS only, where a window title is known to name a job */
  pageTitle?: string | null
  siteName?: string | null
}

export type OfferApplication = {
  id: string
  company: string
  title: string
  status: ApplicationStatus
  statusLabel: string
  tone: ReturnType<typeof statusTone>
  appliedAt: Date
  statusChangedAt: Date
  stageNote: string | null
  nextStep: string | null
  nextStepAt: Date | null
}

export type OfferStatus = {
  /**
   * match url: this posting for certain. match role: a role that reads the same, at a company that
   * is the same or, with companyMatch "similar", only has a similar name.
   */
  applied:
    | (OfferApplication & { match: "url" | "role"; companyMatch: "same" | "similar" | null })
    | null
  /** Other applications at this company, newest first */
  sameCompany: OfferApplication[]
}

const MAX_SAME_COMPANY = 3

const CLOSED_AFTER: Partial<Record<ApplicationStatus, string>> = {
  REJECTED: "Odrzucono po",
  WITHDRAWN: "Wycofano po",
}

// ---------------------------------------------------------------- the address

const LINKEDIN_HOST = /(^|\.)linkedin\.com$/
const LINKEDIN_VIEW = /\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/

/** /jobs/view/<slug>-123, /jobs/view/123 and ?currentJobId=123 on any list are one LinkedIn offer. */
function linkedInJobId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (!LINKEDIN_HOST.test(url.hostname)) return null
    const current = url.searchParams.get("currentJobId")
    if (current && /^\d+$/.test(current)) return current
    return LINKEDIN_VIEW.exec(url.pathname)?.[1] ?? null
  } catch {
    return null
  }
}

/** Equal for two addresses of one posting; null for anything but http(s). */
export function postingKey(rawUrl: string): string | null {
  const linkedIn = linkedInJobId(rawUrl)
  return linkedIn ? `linkedin:${linkedIn}` : urlKey(normalizePostingUrl(rawUrl))
}

// ---------------------------------------------------------------- the role

/** One job under different words: boards say "Java Developer", the company "Java Engineer". */
const SAME_ROLE_WORDS: [RegExp, string][] = [
  [/\bfront[\s-]+end\b/g, "frontend"],
  [/\bback[\s-]+end\b/g, "backend"],
  [/\bfull[\s-]+stack\b/g, "fullstack"],
  [/\b(?:developer|programmer|programista|programistka|dev|inzynier|inzynierka)\b/g, "engineer"],
]

/** "Software Engineer" is just an engineer here, and "within" comes from "Remote within Poland". */
const NOT_ROLE = new Set(["software", "within"])
/** A requisition number: "Director of Engineering / 3696094", "Engineer R12345". */
const REQUISITION = /^[a-z]{0,3}\d{4,}$/

function readRole(title: string) {
  const normalized = SAME_ROLE_WORDS.reduce(
    (text, [pattern, word]) => text.replace(pattern, word),
    normalizeTitle(title)
  )
  const words = titleTokens(titleCore(normalized)).filter(
    (word) => !NOT_ROLE.has(word) && !REQUISITION.test(word)
  )
  return { words: new Set(words), level: detectSeniority(normalized) }
}

/**
 * Two titles at one company that read as one role. Levels as in matching/dedupe.md: "Backend
 * Engineer" and "Senior Backend Engineer" can be one offer, "Senior" and "Junior" cannot, and
 * neither can "Engineering Manager" and "Senior Engineering Manager". Words: most of the shorter
 * title has to be in the longer one, so two teams stay apart: "Engineer, Payments" and "Engineer,
 * Search". One word alone says nothing about a longer title.
 */
export function sameRole(a: string, b: string): boolean {
  const [one, two] = [readRole(a), readRole(b)]
  if (one.level && two.level && one.level !== two.level) return false
  const [small, large] = one.words.size <= two.words.size ? [one, two] : [two, one]
  if (!small.words.size) return false
  const shared = [...small.words].filter((word) => large.words.has(word)).length
  if (small.words.size === 1) return large.words.size === 1 && shared === 1
  return shared / small.words.size >= 0.8
}

// ---------------------------------------------------------------- matching

type Comparable = {
  jobId: string | null
  company: string
  title: string
  url: string | null
  appliedAt: Date
  /** The indexed offer behind the application, whose company needs no comparing of names */
  job?: { companyId: string | null } | null
}

export function matchOffer<Row extends Comparable>(
  rows: Row[],
  offer: { url: string; jobId?: string | null; company?: string | null; title?: string | null },
  map: CompanyMap = new Map()
): {
  applied: { row: Row; match: "url" | "role"; companyMatch: "same" | "similar" | null } | null
  sameCompany: Row[]
} {
  const newest = [...rows].sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime())
  const key = postingKey(offer.url)
  const exact = newest.find(
    (row) =>
      (offer.jobId && row.jobId === offer.jobId) || (key && row.url && postingKey(row.url) === key)
  )
  const company =
    offer.company && !isPlatformName(offer.company, offer.url)
      ? identifyCompany(offer.company, map)
      : null
  const compared = company
    ? newest
        .filter((row) => row !== exact && !isPlatformName(row.company, row.url))
        .map((row) => ({
          row,
          verdict: compareCompanies(
            company,
            identifyCompany(row.company, map, row.job?.companyId)
          ),
        }))
    : []
  const title = offer.title
  const role =
    !exact && title
      ? compared.find(({ row, verdict }) => verdict && sameRole(row.title, title))
      : undefined
  const found = exact ?? role?.row
  return {
    applied: found
      ? {
          row: found,
          match: exact ? "url" : "role",
          companyMatch: exact ? null : role?.verdict ?? null,
        }
      : null,
    sameCompany: compared
      .filter(({ row, verdict }) => verdict === "same" && row !== found)
      .map(({ row }) => row)
      .slice(0, MAX_SAME_COMPANY),
  }
}

/** What the page read beats the index, which beats what the address spells out. */
export function offerFacts(
  page: OfferPage,
  job: Pick<IndexedJob, "title" | "company"> | null
): { company: string | null; title: string | null } {
  const board = boardUrlFacts(page.url)
  const rules = extractJobByRules({
    url: page.url,
    title: page.pageTitle,
    siteName: page.siteName,
  })
  return {
    company: page.company || job?.company.name || board.company || rules.company,
    title: page.title || job?.title || board.title || rules.title,
  }
}

type OfferRow = Comparable & {
  id: string
  status: string
  statusChangedAt: Date
  stageNote: string | null
  closedAtStage: string | null
  nextStep: string | null
  nextStepAt: Date | null
}

function labelOf(row: OfferRow): string {
  const closedAfter = CLOSED_AFTER[row.status as ApplicationStatus]
  const label = statusLabel(row.status)
  return closedAfter && row.closedAtStage
    ? `${closedAfter}: ${statusLabel(row.closedAtStage)}`
    : label
}

function toOfferApplication(row: OfferRow): OfferApplication {
  return {
    id: row.id,
    company: row.company,
    title: row.title,
    status: row.status as ApplicationStatus,
    statusLabel: labelOf(row),
    tone: statusTone(row.status),
    appliedAt: row.appliedAt,
    statusChangedAt: row.statusChangedAt,
    stageNote: row.stageNote,
    nextStep: row.nextStep,
    nextStepAt: row.nextStepAt,
  }
}

export async function offerStatus(userId: number, page: OfferPage): Promise<OfferStatus> {
  const job = await findJobByUrl(normalizePostingUrl(page.url)).catch(() => null)
  const rows = await db.application.findMany({
    where: { userId },
    select: {
      id: true,
      jobId: true,
      company: true,
      title: true,
      url: true,
      status: true,
      stageNote: true,
      closedAtStage: true,
      appliedAt: true,
      statusChangedAt: true,
      nextStep: true,
      nextStepAt: true,
      job: { select: { companyId: true } },
    },
  })
  const facts = offerFacts(page, job)
  const map = facts.company
    ? await companyMapFor([facts.company, ...rows.map((row) => row.company)])
    : new Map<string, string[]>()
  const { applied, sameCompany } = matchOffer(rows, { url: page.url, jobId: job?.id, ...facts }, map)
  return {
    applied: applied
      ? {
          ...toOfferApplication(applied.row),
          match: applied.match,
          companyMatch: applied.companyMatch,
        }
      : null,
    sameCompany: sameCompany.map(toOfferApplication),
  }
}
