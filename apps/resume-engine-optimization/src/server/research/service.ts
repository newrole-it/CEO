import { createHash } from "node:crypto"
import db from "db"
import {
  BRIEF_AXES,
  mergePoints,
  parseCompanyBrief,
  unknownAxes,
  type BriefAxis,
  type BriefPoint,
  type CompanyBriefResult,
  type OfferTierState,
  type WebTierState,
} from "@newrole/cv-core/research"
import { cvPlainText } from "@newrole/cv-core/text"
import {
  briefFromOffer,
  researchOnWeb,
  WEB_SEARCH_CAP,
  type WebRun,
} from "@newrole/cv-engine/research"
import type { LlmClient } from "@newrole/llm/common"
import { companyNameKey, readCompanyName } from "src/server/companies/names"
import { defaultCv, type CvLanguage } from "src/server/cv/service"
import { loadTailorJob } from "src/server/cv/tailor"
import { runClaudePrompt } from "src/server/llm/claude-cli"
import { llmProvider } from "src/server/llm/client"
import { createWritingClient, DEFAULT_WRITING_MODEL } from "src/server/llm/writing"
import { hiringConfidenceOf, hiringSelect } from "src/server/offers/hiring-confidence"
import { candidateContext } from "src/server/profile/context"
import { createHttpClient, type HttpClient } from "src/server/security/safe-fetch"
import type { HiringConfidence } from "src/shared/hiring-confidence"
import { checkWebClaims } from "./web"

/**
 * The company brief of an offer: what the person should know about the employer before applying
 * and before an interview. Two parts.
 *
 * 1. The records (companyRecords): what this database holds about the company and the person's
 *    own history with it. Rows, read when the page opens; no model, nothing stored.
 * 2. The brief (companyBrief): a model's reading of the offer's text and, when the Claude CLI is
 *    the provider, of the public web, along the axes of career-ops' research prompt
 *    (modes/deep.md). The model proposes and @newrole/cv-core/research decides: a statement stays
 *    only when code found its quote in the offer's text, in the person's own data, or on the page
 *    newrole.it read itself (./web.ts). The latest brief is kept per person and company, so the
 *    page reopens without a model.
 *
 * Without a model the page shows the records and the questions that follow from what is unknown.
 */

export type CompanyBriefErrorCode = "job-not-found"

export class CompanyBriefError extends Error {
  constructor(readonly code: CompanyBriefErrorCode) {
    super(code)
    this.name = "CompanyBriefError"
  }
}

/** What the database holds about the company and the person's history with it. */
export type CompanyRecords = {
  company: {
    id: string
    name: string
    /** Other names the index knows it by */
    aliases: string[]
    domain: string | null
    careerPages: string[]
  }
  /** The company's other open postings in the index, newest first */
  openPostings: {
    total: number
    items: { jobId: string; title: string; location: string | null; url: string; since: Date }[]
  }
  /** The person's applications to the company, newest first */
  applications: {
    id: string
    title: string
    status: string
    appliedAt: Date
    /** The stage reached before a rejection or a withdrawal */
    closedAtStage: string | null
    thisOffer: boolean
  }[]
  /** Other offers of the company the person keeps */
  offers: { jobId: string; title: string; addedAt: Date }[]
  /** Null for a closed posting */
  hiring: HiringConfidence | null
}

/** A question the records raise, as a code the interface words. */
export type RecordQuestion =
  /** The posting is `n` days old */
  | { code: "posting-old"; n: number }
  /** `n` other open postings of the company carry the same title */
  | { code: "evergreen"; n: number }
  | { code: "intermediary" }
  | { code: "maybe-closed" }
  /** The person applied to the company before */
  | { code: "applied-before" }

export type StoredBrief = {
  result: CompanyBriefResult
  generatedAt: Date
  /** The interface language it was written in */
  locale: string
  /** The offer whose text it was read from; null when that offer is gone */
  from: { jobId: string; title: string } | null
  /** It was read from another offer of the company than the one on the page */
  otherOffer: boolean
  /** The offer's text changed since */
  stale: boolean
}

export type CompanyBriefView = {
  jobId: string
  offer: { title: string; url: string | null }
  records: CompanyRecords
  brief: StoredBrief | null
  /** The axes nothing confirmed speaks of: every one of them without a brief */
  unknown: BriefAxis[]
  recordQuestions: RecordQuestion[]
  model: BriefModel
}

/** What a run can do here: nothing without a model, the web only through the Claude CLI. */
export type BriefModel = { available: boolean; web: boolean; searchCap: number }

/** The brief in short, for a card on the offer's page. */
export type CompanyBriefSummary = {
  jobId: string
  company: string
  generatedAt: Date | null
  /** Statements with a confirmed source */
  points: number
  openPostings: number
  applications: number
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")

const jobSelect = {
  ...hiringSelect,
  title: true,
  originalUrl: true,
  canonicalUrl: true,
  company: {
    select: {
      id: true,
      name: true,
      canonicalDomain: true,
      aliases: { where: { confidence: { gt: 0 } }, select: { alias: true, normalizedAlias: true } },
      careerPages: { where: { enabled: true }, select: { url: true }, take: 3 },
    },
  },
} as const

const OPEN_POSTINGS_SHOWN = 12

/** A posting older than this has agePoints below zero in src/shared/hiring-confidence.ts. */
const OLD_POSTING_DAYS = 60

async function loadJob(jobId: string) {
  return db.job.findUnique({ where: { id: jobId }, select: jobSelect })
}

type JobRow = NonNullable<Awaited<ReturnType<typeof loadJob>>>

/** The names a text may call the company by: its name as written, as read, and its aliases. */
function companyNames(company: JobRow["company"]): string[] {
  const names = [company.name, readCompanyName(company.name), ...company.aliases.map((a) => a.alias)]
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))]
}

async function recordsOf(userId: number, job: JobRow): Promise<CompanyRecords> {
  const { company } = job
  const open = { companyId: company.id, status: "ACTIVE" as const, id: { not: job.id } }
  const [total, postings, applications, offers] = await Promise.all([
    db.job.count({ where: open }),
    db.job.findMany({
      where: open,
      orderBy: [{ lastSeenAt: "desc" }, { id: "asc" }],
      take: OPEN_POSTINGS_SHOWN,
      select: {
        id: true,
        title: true,
        locationText: true,
        originalUrl: true,
        canonicalUrl: true,
        publishedAt: true,
        firstSeenAt: true,
      },
    }),
    db.application.findMany({
      where: { userId, status: { not: "DELETED" } },
      orderBy: { appliedAt: "desc" },
      select: {
        id: true,
        jobId: true,
        company: true,
        title: true,
        status: true,
        appliedAt: true,
        closedAtStage: true,
        job: { select: { companyId: true } },
      },
    }),
    db.userOffer.findMany({
      where: { userId, jobId: { not: job.id }, job: { companyId: company.id } },
      orderBy: { createdAt: "desc" },
      select: { jobId: true, createdAt: true, job: { select: { title: true } } },
    }),
  ])
  // an application belongs to the company by its offer, or by the name the person wrote
  const keys = new Set(
    [companyNameKey(company.name), ...company.aliases.map((a) => a.normalizedAlias)].filter(Boolean)
  )
  const own = applications.filter((row) =>
    row.job ? row.job.companyId === company.id : keys.has(companyNameKey(row.company))
  )
  const latest = own.find((row) => row.jobId === job.id)
  return {
    company: {
      id: company.id,
      name: company.name,
      aliases: companyNames(company).filter((name) => name !== company.name),
      domain: company.canonicalDomain,
      careerPages: company.careerPages.map((page) => page.url),
    },
    openPostings: {
      total,
      items: postings.map((row) => ({
        jobId: row.id,
        title: row.title,
        location: row.locationText,
        url: row.originalUrl || row.canonicalUrl,
        since: row.publishedAt ?? row.firstSeenAt,
      })),
    },
    applications: own.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      appliedAt: row.appliedAt,
      closedAtStage: row.closedAtStage,
      thisOffer: row.jobId === job.id,
    })),
    offers: offers.map((row) => ({
      jobId: row.jobId,
      title: row.job.title,
      addedAt: row.createdAt,
    })),
    hiring: await hiringConfidenceOf(job, latest?.status ?? null),
  }
}

/** The questions the records raise: an old or repeated posting, a go-between, an earlier try. */
export function recordQuestions(records: CompanyRecords): RecordQuestion[] {
  const questions: RecordQuestion[] = []
  for (const signal of records.hiring?.signals ?? []) {
    const n = signal.n ?? 0
    if ((signal.code === "age" || signal.code === "seen") && n > OLD_POSTING_DAYS)
      questions.push({ code: "posting-old", n })
    if (signal.code === "evergreen") questions.push({ code: "evergreen", n })
    if (signal.code === "intermediary") questions.push({ code: "intermediary" })
    if (signal.code === "maybe-closed") questions.push({ code: "maybe-closed" })
  }
  if (records.applications.some((row) => !row.thisOffer))
    questions.push({ code: "applied-before" })
  return questions
}

/** What a run can do with the configured model. */
export function companyBriefModel(): BriefModel {
  return {
    available: createWritingClient() !== null,
    web: llmProvider() === "claude-cli",
    searchCap: WEB_SEARCH_CAP,
  }
}

/**
 * The web research's run: a headless Claude with WebSearch and WebFetch, logged for the AI usage
 * tab. The app's LlmClient has no way to pass tools, so this calls runClaudePrompt directly, on
 * the writing model. Null with any other provider: an OpenAI-compatible API gets chat completions
 * without tools (@newrole/llm/client), so it cannot read the web.
 */
function defaultWebRun(): WebRun | null {
  if (llmProvider() !== "claude-cli") return null
  const model = process.env.CLAUDE_WRITING_MODEL?.trim() || DEFAULT_WRITING_MODEL
  return (args) => runClaudePrompt({ ...args, model })
}

async function storedBrief(
  userId: number,
  job: JobRow,
  currentOffer: { text: string; origin: string } | null
): Promise<StoredBrief | null> {
  const row = await db.companyBrief.findUnique({
    where: { userId_companyId: { userId, companyId: job.company.id } },
    include: { job: { select: { id: true, title: true } } },
  })
  const result = row ? parseCompanyBrief(row.result) : null
  if (!row || !result) return null
  const otherOffer = row.jobId !== job.id
  return {
    result,
    generatedAt: row.generatedAt,
    locale: row.locale,
    from: row.job ? { jobId: row.job.id, title: row.job.title } : null,
    otherOffer,
    // compared only with the whole text: the index's excerpt always differs from it
    stale:
      !otherOffer && currentOffer?.origin === "full" && sha256(currentOffer.text) !== row.offerHash,
  }
}

async function viewOf(userId: number, job: JobRow): Promise<CompanyBriefView> {
  const [records, current] = await Promise.all([
    recordsOf(userId, job),
    // without the network: the person's own copy, else what the index keeps
    loadTailorJob(job.id, undefined, userId),
  ])
  const brief = await storedBrief(userId, job, current)
  return {
    jobId: job.id,
    offer: { title: job.title, url: job.originalUrl || job.canonicalUrl || null },
    records,
    brief,
    unknown: brief ? unknownAxes(brief.result.points) : [...BRIEF_AXES],
    recordQuestions: recordQuestions(records),
    model: companyBriefModel(),
  }
}

/**
 * The page's data for an offer: the company's records, read now, and the brief kept for the
 * person and the company, if there is one. No model call. Null for an offer not in the index.
 */
export async function getCompanyBrief(
  userId: number,
  jobId: string
): Promise<CompanyBriefView | null> {
  const job = await loadJob(jobId)
  return job ? viewOf(userId, job) : null
}

/**
 * Writes the brief now and keeps it in place of the one before. `locale` is the language of its
 * sentences: the person's interface language. `web: false` leaves the web research out.
 *
 * Without a model nothing is written or kept, and the view holds the records alone. `llm`,
 * `research` (the run with web tools; null for a provider that has none) and `http` are
 * injectable for tests. Throws CompanyBriefError("job-not-found") for an offer not in the index.
 */
export async function companyBrief(
  userId: number,
  jobId: string,
  options: {
    locale: CvLanguage
    web?: boolean
    llm?: LlmClient | null
    research?: WebRun | null
    http?: HttpClient
    now?: Date
  }
): Promise<CompanyBriefView> {
  const { locale } = options
  const now = options.now ?? new Date()
  const [job, offer] = await Promise.all([
    loadJob(jobId),
    loadTailorJob(jobId, { http: options.http }, userId),
  ])
  if (!job || !offer) throw new CompanyBriefError("job-not-found")
  const llm = options.llm === undefined ? createWritingClient() : options.llm
  if (!llm) return viewOf(userId, job)

  const { company } = job
  const names = companyNames(company)

  let offerState: OfferTierState = "done"
  let fromOffer: Awaited<ReturnType<typeof briefFromOffer>> = null
  if (offer.withheld) offerState = "withheld"
  else if (!offer.text.trim()) offerState = "no-text"
  else {
    const [context, cv] = await Promise.all([candidateContext(userId), defaultCv(userId)])
    try {
      fromOffer = await briefFromOffer({
        llm,
        offer: { company: offer.company, title: offer.title, text: offer.text },
        context,
        // as tailoring checks it: the CV's own text and everything else the person has said
        evidence: `${cv?.content ? cvPlainText(cv.content) : ""}\n${context}`,
        locale,
        userId,
      })
    } catch (error) {
      console.error("company brief from the offer failed", messageOf(error))
    }
    if (!fromOffer) offerState = "failed"
  }

  const run = options.research === undefined ? defaultWebRun() : options.research
  let webState: WebTierState = "done"
  let webPoints: BriefPoint[] = []
  let webDropped = 0
  let searches: number | null = null
  let unread: CompanyBriefResult["web"]["unread"] = []
  if (options.web === false) webState = "not-asked"
  else if (!run) webState = "provider"
  else {
    let research: Awaited<ReturnType<typeof researchOnWeb>> = null
    try {
      research = await researchOnWeb({
        run,
        company: {
          name: company.name,
          aliases: names.filter((name) => name !== company.name),
          domain: company.canonicalDomain,
        },
        title: job.title,
        offerUrls: [job.originalUrl, job.canonicalUrl],
        locale,
        today: now,
      })
    } catch (error) {
      console.error("company brief web research failed", messageOf(error))
    }
    if (!research) webState = "failed"
    else {
      const check = await checkWebClaims(
        research.claims,
        { names, domain: company.canonicalDomain },
        { http: options.http ?? createHttpClient(), now }
      )
      webPoints = check.points
      unread = check.unread
      searches = research.searches
      // everything the model gave that is not shown: unusable, unread or not on the page
      webDropped = research.dropped + research.claims.length - check.points.length
    }
  }

  const points = mergePoints(fromOffer?.points ?? [], webPoints)
  const result: CompanyBriefResult = {
    version: 1,
    points,
    angle: fromOffer?.angle ?? [],
    questions: fromOffer?.questions ?? [],
    offer: offerState,
    web: { state: webState, searches, searchCap: WEB_SEARCH_CAP, unread },
    dropped: {
      offer: fromOffer?.dropped.offer ?? 0,
      // the web's points over the cap of an axis are not shown either
      web: webDropped + webPoints.length - points.filter((p) => p.source.kind === "web").length,
      angle: fromOffer?.dropped.angle ?? 0,
      questions: fromOffer?.dropped.questions ?? 0,
    },
  }
  const fields = {
    jobId,
    // a stored JSON value: without the undefined keys optional fields leave behind
    result: JSON.parse(JSON.stringify(result)),
    locale,
    webState,
    offerHash: sha256(offer.text),
    generatedAt: now,
  }
  await db.companyBrief.upsert({
    where: { userId_companyId: { userId, companyId: company.id } },
    create: { userId, companyId: company.id, ...fields },
    update: fields,
  })
  return viewOf(userId, job)
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : error)

/** The brief in short. Null for an offer not in the index. */
export async function companyBriefSummary(
  userId: number,
  jobId: string
): Promise<CompanyBriefSummary | null> {
  const view = await getCompanyBrief(userId, jobId)
  if (!view) return null
  const result = view.brief?.result
  return {
    jobId,
    company: view.records.company.name,
    generatedAt: view.brief?.generatedAt ?? null,
    points: result ? result.points.length + result.angle.length : 0,
    openPostings: view.records.openPostings.total,
    applications: view.records.applications.length,
  }
}
