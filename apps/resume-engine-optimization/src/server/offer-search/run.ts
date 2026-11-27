import db, { type Prisma } from "db"
import type { Decision } from "@newrole/cv-core/evaluation"
import type { LlmClient } from "@newrole/llm/common"
import { readOffer, type OfferReading } from "src/server/applications/read-offer"
import { urlKey } from "src/server/applications/logic"
import { loadTailorJob } from "src/server/cv/tailor"
import type { CvLanguage } from "src/server/cv/service"
import { computeEvaluation } from "src/server/evaluation/service"
import { runClaudePrompt } from "src/server/llm/claude-cli"
import { llmProvider } from "src/server/llm/client"
import { hiringConfidenceOf, hiringSelect } from "src/server/offers/hiring-confidence"
import { ingestOfferPayload } from "src/server/offers/ingest"
import { readOnlyWhenTailoring } from "src/server/offers/service"
import type { HttpClient } from "src/server/security/safe-fetch"
import { SearchFilters } from "src/shared/offer-search"
import { personFromFilters } from "./filters"
import { rankResults, screenOffer, type ScreenReason } from "./screen"
import { findCandidates, type WebRun } from "./web-step"

/**
 * "Find offers": one search, run in the server process (not the BackgroundTask loop, which runs
 * one task at a time). The web step proposes links and nothing else; every link is read as the
 * person's own read, screened by rules, evaluated against the search's filters and ranked. Each
 * result row is written as soon as it is done, so the page can poll them. Only codes, numbers and
 * dates are stored.
 */

/** At most this many offers get the evaluation's two model steps per search. */
export const EVALUATION_LIMIT = 20
/** The best this many evaluated offers (apply, consider, unknown) are ranked and shown; the rest, and every "skip", are "weaker". */
export const SHOWN = 15

const RUNNING = ["queued", "searching", "reading", "evaluating"]
// pg_advisory_xact_lock namespace for one person's searches (others: applications 7303, cv 7419)
const LOCK_NAMESPACE = 7527

export type SearchCounts = {
  /** Links the web step proposed, after dedupe */
  found: number
  /** Links the person already has (Offers, applications) or dismissed earlier, and the same posting twice */
  known: number
  /** Links read into an offer (a Job) */
  read: number
  closed: number
  unreadable: number
  screened: Partial<Record<ScreenReason, number>>
  evaluated: number
  /** Over EVALUATION_LIMIT, the evaluation itself failed, or its row could not be written */
  notEvaluated: number
  shown: number
  weaker: number
}

export type SearchDeps = {
  run: WebRun
  read: (url: string) => Promise<OfferReading>
  llm?: LlmClient | null
  http?: HttpClient
  now: () => Date
}

export class OfferSearchError extends Error {
  constructor(readonly code: "no-cli" | "not-found") {
    super(code)
    this.name = "OfferSearchError"
  }
}

const emptyCounts = (): SearchCounts => ({
  found: 0,
  known: 0,
  read: 0,
  closed: 0,
  unreadable: 0,
  screened: {},
  evaluated: 0,
  notEvaluated: 0,
  shown: 0,
  weaker: 0,
})

const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue

/** Starts a search for the person, or gives back the one that is still running. */
export async function startOfferSearch(
  userId: number,
  filters: SearchFilters,
  locale: CvLanguage,
  deps: Partial<SearchDeps> = {}
): Promise<{ searchId: string; started: boolean }> {
  if (!deps.run && llmProvider() !== "claude-cli") throw new OfferSearchError("no-cli")
  const accepted = SearchFilters.parse(filters)
  const { searchId, started } = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::int, ${userId}::int)`
    const running = await tx.offerSearch.findFirst({
      where: { userId, status: { in: RUNNING } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
    if (running) return { searchId: running.id, started: false }
    const created = await tx.offerSearch.create({
      data: { userId, filters: accepted, counts: asJson(emptyCounts()) },
      select: { id: true },
    })
    return { searchId: created.id, started: true }
  })
  if (started) {
    const full: SearchDeps = {
      run: deps.run ?? runClaudePrompt,
      read: deps.read ?? ((url) => readOffer(url)),
      llm: deps.llm,
      http: deps.http,
      now: deps.now ?? (() => new Date()),
    }
    // runOfferSearch never rejects; the catch is for an error in the catch itself
    void runOfferSearch(searchId, full, locale).catch(() => undefined)
  }
  return { searchId, started }
}

/**
 * A search the last server stopped in the middle of cannot go on: it fails as "interrupted". Only
 * searches created before `bootedAt`: one this server started since it booted is still running.
 */
export async function recoverInterruptedSearches(bootedAt: Date = new Date()): Promise<number> {
  const { count } = await db.offerSearch.updateMany({
    where: { status: { in: RUNNING }, createdAt: { lt: bootedAt } },
    data: { status: "failed", errorCode: "interrupted", finishedAt: new Date() },
  })
  return count
}

type Result = {
  outcome: "ok" | "closed" | "unreadable" | "screened-out" | "not-evaluated" | "weaker"
  jobId?: string | null
  reason?: string | null
  factsByModel?: boolean
  decision?: string | null
  score?: number | null
  evaluation?: Prisma.InputJsonValue
  rank?: number | null
}

/** The facts the screen reads, from the same Job columns the evaluation reads (evaluation/service.ts jobSelect). */
const screenSelect = {
  ...hiringSelect,
  title: true,
  locationText: true,
  workplaceType: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
} as const

/** Runs one queued search to its end. Never throws: an unexpected error fails it as "internal". */
export async function runOfferSearch(
  searchId: string,
  deps: SearchDeps,
  locale: CvLanguage
): Promise<void> {
  try {
    await runSteps(searchId, deps, locale)
  } catch (error) {
    // no person data: the search's id and the error's kind only
    console.error(
      `[offer-search] search ${searchId} failed:`,
      error instanceof Error ? error.name : typeof error
    )
    await db.offerSearch
      .update({
        where: { id: searchId },
        data: { status: "failed", errorCode: "internal", finishedAt: new Date() },
      })
      .catch(() => undefined)
  }
}

async function runSteps(searchId: string, deps: SearchDeps, locale: CvLanguage): Promise<void> {
  // claimed once: a second call for the same search does nothing
  const claimed = await db.offerSearch.updateMany({
    where: { id: searchId, status: "queued" },
    data: { status: "searching" },
  })
  if (!claimed.count) return
  const search = await db.offerSearch.findUniqueOrThrow({ where: { id: searchId } })
  const { userId } = search
  const filters = SearchFilters.parse(search.filters)
  const counts = emptyCounts()
  // updateMany: a search erased while it runs (eraseProfile, eraseAccount) is not an error
  const setStatus = (status: string, extra: Prisma.OfferSearchUpdateManyMutationInput = {}) =>
    db.offerSearch.updateMany({
      where: { id: searchId },
      data: { status, counts: asJson(counts), ...extra },
    })
  // the page's header moves as links are read and evaluated, not only when the status changes
  const saveCounts = () =>
    db.offerSearch.updateMany({ where: { id: searchId }, data: { counts: asJson(counts) } })
  // erased while it runs: it stops before the next link, so no further reads or model runs
  const erased = async () => (await db.offerSearch.count({ where: { id: searchId } })) === 0
  // upsert: a row is written once per link even if a step runs again. A row that cannot be
  // written is that link's failure (false), not the search's
  const write = (url: string, data: Result): Promise<boolean> =>
    db.offerSearchResult
      .upsert({
        where: { searchId_url: { searchId, url } },
        create: { searchId, userId, url, ...data },
        update: data,
      })
      .then(() => true, noted(searchId, "write"))
      .then((written) => written === true)

  // 1. the web step: only the filters and today's date go out
  const web = await findCandidates(filters, { run: deps.run, today: deps.now() })
  if (!web.ok) {
    await setStatus("failed", { errorCode: web.code, finishedAt: new Date() })
    return
  }
  counts.found = web.urls.length

  // 2. what the person already has or dismissed
  const known = await knownOf(userId)
  const fresh = web.urls.filter((url) => !known.urls.has(urlKey(url) ?? url))
  counts.known = web.urls.length - fresh.length

  // 3–4. read each link (one at a time: politeness lives in readOffer), then screen it
  await setStatus("reading")
  const profile = await db.candidateProfile.findUnique({
    where: { userId },
    select: { salaryTarget: true },
  })
  const person = personFromFilters(filters, profile?.salaryTarget ?? null)
  const survivors: { url: string; jobId: string; factsByModel: boolean }[] = []
  const seenJobs = new Set<string>()
  const unread = async (url: string, reason: string) => {
    counts.unreadable += 1
    await write(url, { outcome: "unreadable", reason })
  }
  const readOne = async (url: string): Promise<void> => {
    const reading = await deps.read(url).catch(noted(searchId, "read"))
    const facts = reading?.facts
    let jobId = facts?.jobId ?? null
    // factsByModel: the company and title on the list are the model's reading of the page
    const factsByModel = !jobId && reading?.byModel === true
    if (!jobId) {
      const readable =
        reading &&
        facts?.company &&
        facts.title &&
        reading.outcome !== "unreadable" &&
        reading.outcome !== "link-only"
      if (!readable) return unread(url, unreadReason(reading))
      jobId = await ingested(reading).catch(noted(searchId, "ingest"))
      if (!jobId) return unread(url, "unreadable")
    }
    // the same posting under another link: already in this search, or already the person's
    if (seenJobs.has(jobId) || known.jobIds.has(jobId)) {
      counts.known += 1
      return
    }
    seenJobs.add(jobId)
    const job = await db.job.findUnique({ where: { id: jobId }, select: screenSelect })
    if (!job) return unread(url, "unreadable")
    counts.read += 1
    if (job.status === "CLOSED") {
      counts.closed += 1
      await write(url, { outcome: "closed", jobId, factsByModel })
      return
    }
    const reason = await screenOf(userId, job, reading, filters, person, deps.now())
    if (reason) {
      counts.screened[reason] = (counts.screened[reason] ?? 0) + 1
      await write(url, { outcome: "screened-out", reason, jobId, factsByModel })
      return
    }
    survivors.push({ url, jobId, factsByModel })
  }
  for (const url of fresh) {
    if (await erased()) return
    await readOne(url)
    await saveCounts()
  }

  // 5. evaluate the survivors in the order they were found, each row written when it is done
  await setStatus("evaluating")
  const evaluated: { url: string; decision: Decision; score: number | null }[] = []
  const evaluateOne = async (survivor: (typeof survivors)[number], index: number) => {
    const { url, jobId, factsByModel } = survivor
    if (index >= EVALUATION_LIMIT) {
      counts.notEvaluated += 1
      await write(url, { outcome: "not-evaluated", reason: "limit", jobId, factsByModel })
      return
    }
    const done = await computeEvaluation(userId, jobId, {
      locale,
      person,
      llm: deps.llm,
      http: deps.http,
    }).catch(noted(searchId, "evaluate"))
    if (!done) {
      counts.notEvaluated += 1
      await write(url, { outcome: "not-evaluated", reason: "failed", jobId, factsByModel })
      return
    }
    const { decision, score, result } = done.stored
    const row: Result = { outcome: "ok", jobId, factsByModel, decision, score, evaluation: result }
    // only a written row can be ranked
    if (!(await write(url, row))) {
      counts.notEvaluated += 1
      return
    }
    counts.evaluated += 1
    evaluated.push({ url, decision, score })
  }
  for (const [index, survivor] of survivors.entries()) {
    if (await erased()) return
    await evaluateOne(survivor, index)
    await saveCounts()
  }

  // 6. rank: the best SHOWN of those worth a look are the list; "skip" and the rest are "weaker".
  // One the person dismissed while the search ran takes no place on the list (read again now)
  const dismissed = await db.offerSearchResult.findMany({
    where: { searchId, dismissedAt: { not: null } },
    select: { url: true },
  })
  const gone = new Set(dismissed.map((row) => row.url))
  let rank = 0
  for (const row of rankResults(evaluated.filter((entry) => !gone.has(entry.url)))) {
    const shown = row.decision !== "skip" && rank < SHOWN
    if (shown) {
      rank += 1
      counts.shown += 1
    } else counts.weaker += 1
    await db.offerSearchResult.updateMany({
      where: { searchId, url: row.url },
      data: shown ? { rank } : { outcome: "weaker", rank: null },
    })
  }
  await setStatus("done", { finishedAt: new Date() })
}

/**
 * A catch for one link's step that leaves a trace: the search's id, the step and the error's kind,
 * no person data. The link then counts as unreadable or not evaluated (or, when its row cannot be
 * written, has no row), and the search goes on.
 */
function noted(searchId: string, step: "read" | "ingest" | "evaluate" | "write") {
  return (error: unknown): null => {
    console.error(
      `[offer-search] search ${searchId}: ${step} failed:`,
      error instanceof Error ? error.name : typeof error
    )
    return null
  }
}

/** Why a link could not be read into an offer: unreadable | link-only | partial (no company or title). */
function unreadReason(reading: OfferReading | null): "unreadable" | "link-only" | "partial" {
  if (!reading || reading.outcome === "unreadable") return "unreadable"
  return reading.outcome === "link-only" ? "link-only" : "partial"
}

/** The links (as urlKey) and offers the person already has, or dismissed in an earlier search. */
async function knownOf(userId: number): Promise<{ urls: Set<string>; jobIds: Set<string> }> {
  const jobUrls = { select: { originalUrl: true, canonicalUrl: true } } as const
  const [kept, applied, dismissed] = await Promise.all([
    db.userOffer.findMany({ where: { userId }, select: { jobId: true, job: jobUrls } }),
    db.application.findMany({
      where: { userId },
      select: { jobId: true, url: true, job: jobUrls },
    }),
    db.offerSearchResult.findMany({
      where: { userId, dismissedAt: { not: null } },
      select: { jobId: true, url: true },
    }),
  ])
  const urls = new Set<string>()
  const jobIds = new Set<string>()
  const add = (url: string | null | undefined) => {
    const key = url ? urlKey(url) : null
    if (key) urls.add(key)
  }
  for (const row of [...kept, ...applied]) {
    add(row.job?.originalUrl)
    add(row.job?.canonicalUrl)
    if (row.jobId) jobIds.add(row.jobId)
  }
  for (const row of [...applied, ...dismissed]) add(row.url)
  for (const row of dismissed) if (row.jobId) jobIds.add(row.jobId)
  return { urls, jobIds }
}

/**
 * A page or job board reading with a company and a title, stored as a WEB_SEARCH offer as
 * confirmOffer stores it, without keepOffer: nothing enters the person's Offers until they add it.
 * A job board's or LinkedIn's text is not stored (readOnlyWhenTailoring).
 */
async function ingested(reading: OfferReading): Promise<string | null> {
  const { url, facts } = reading
  if (!facts?.company || !facts.title) return null
  // the posting itself (normalizePostingUrl: an /apply page or an embed), as addOfferByLink stores it
  const description = readOnlyWhenTailoring(url) ? undefined : reading.text?.trim() || undefined
  const result = await ingestOfferPayload({
    url,
    company: facts.company,
    title: facts.title,
    location: facts.location?.trim() || undefined,
    salaryText: facts.salaryText?.trim() || undefined,
    description,
    channel: "web",
  })
  return result.jobId ?? null
}

/**
 * The screen's verdict, from the facts the evaluation reads: the Job's columns, its hiring facts,
 * and the text read just now (else the person's copy or the index's excerpt; no second fetch).
 */
async function screenOf(
  userId: number,
  job: Prisma.JobGetPayload<{ select: typeof screenSelect }>,
  reading: OfferReading | null,
  filters: SearchFilters,
  person: ReturnType<typeof personFromFilters>,
  now: Date
): Promise<ScreenReason | null> {
  const [application, stored] = await Promise.all([
    db.application.findFirst({
      where: { userId, jobId: job.id },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    }),
    reading?.text?.trim() ? null : loadTailorJob(job.id, undefined, userId),
  ])
  const text = reading?.withheld ? "" : reading?.text?.trim() || stored?.text || ""
  return screenOffer(
    {
      title: job.title,
      text,
      workplace: job.workplaceType,
      location: job.locationText,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      hiring: await hiringConfidenceOf(job, application?.status ?? null, now),
      publishedAt: job.publishedAt,
    },
    filters,
    person,
    now
  )
}
