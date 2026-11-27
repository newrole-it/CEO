import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { pgAdapter } from "../db/client"
import type { OfferReading } from "../src/server/applications/read-offer"
import { createCv } from "../src/server/cv/service"
import { keepOffer } from "../src/server/offers/service"
import { filtersFromProfile } from "../src/server/offer-search/filters"
import {
  addSearchResult,
  dismissSearchResult,
  getOfferSearchView,
  startSearchFromForm,
} from "../src/server/offer-search/service"
import {
  EVALUATION_LIMIT,
  OfferSearchError,
  SHOWN,
  recoverInterruptedSearches,
  runOfferSearch,
  startOfferSearch,
  type SearchCounts,
  type SearchDeps,
} from "../src/server/offer-search/run"
import type { WebRun } from "../src/server/offer-search/web-step"
import type { HttpClient, HttpResponse } from "../src/server/security/safe-fetch"
import type { SearchFilters } from "../src/shared/offer-search"
import { parseEvaluation } from "@newrole/cv-core/evaluation"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import type { LlmClient } from "@newrole/llm/common"

/**
 * "Find offers" (src/server/offer-search/run.ts): the web step's links are read, screened by
 * rules, evaluated against the search's filters and ranked, each result written as it is done.
 * Nothing here starts the claude binary, a model or the network: run, read, llm and http are fakes.
 */

const db = new PrismaClient({ adapter: pgAdapter() })
const stamp = `offer-search-${Date.now()}`

after(async () => {
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.job.deleteMany({ where: { originalUrl: { contains: stamp } } })
  await db.company.deleteMany({
    where: { OR: [{ name: { contains: stamp } }, { normalizedName: { contains: stamp } }] },
  })
  await db.$disconnect()
})

let counter = 0

const OFFER_TEXT = [
  "Senior Platform Engineer",
  "Wymagamy: Kubernetes w produkcji, PostgreSQL. Mile widziane: Terraform.",
  "Praca zdalna.",
].join("\n")

const PERSON_NAME = "Zofia Testowa-Szukająca"
const FACT_TEXT = "Prowadziłam migrację klastra w banku Omega"

async function makeUser() {
  counter += 1
  const user = await db.user.create({
    data: { email: `u${counter}-${stamp}@example.com`, name: PERSON_NAME, role: "USER" },
  })
  await db.candidateProfile.create({
    data: {
      userId: user.id,
      seniority: "senior",
      salaryFloor: 20000,
      salaryTarget: 25000,
      salaryCurrency: "PLN",
      salaryPeriod: "month",
      salaryContract: "b2b",
      remotePreference: "remote",
      homeCity: "Łódź",
    },
  })
  await db.candidateFact.create({ data: { userId: user.id, text: FACT_TEXT } })
  await createCv({ userId: user.id, from: "content", content: syntheticCv(2), title: "Główne" })
  return user
}

async function makeJob(data: Record<string, unknown> = {}) {
  counter += 1
  const key = `${stamp}-${counter}`
  const company = await db.company.create({
    data: { name: `Acme ${key}`, normalizedName: `acme-${key}` },
  })
  return db.job.create({
    data: {
      companyId: company.id,
      sourceType: "LEVER",
      title: "Senior Platform Engineer",
      normalizedTitle: "senior platform engineer",
      summary: "",
      descriptionText: "Wymagamy Kubernetes i PostgreSQL.",
      locationText: "Polska",
      workplaceType: "REMOTE",
      salaryMin: 22000,
      salaryMax: 27000,
      salaryCurrency: "PLN/month",
      publishedAt: new Date(),
      originalUrl: `https://example.com/jobs/${key}`,
      canonicalUrl: `https://example.com/jobs/${key}`,
      contentHash: `hash-${key}`,
      identityKey: `job-${key}`,
      fingerprint: `fp-${key}`,
      ...data,
    },
  })
}

const FILTERS: SearchFilters = {
  ...filtersFromProfile(null),
  roles: ["Senior Platform Engineer"],
  level: "senior",
  skills: ["Kubernetes"],
  places: ["Łódź"],
  workMode: "remote",
  minPay: { amount: 20000, currency: "PLN", period: "month", contract: "b2b" },
}

const analysisReply = {
  role: "Buduje platformę.",
  seniority: "Senior",
  requirements: [
    { text: "Kubernetes w produkcji", importance: "required", kind: "tool", keyword: "Kubernetes" },
    { text: "PostgreSQL", importance: "required", kind: "tool", keyword: "PostgreSQL" },
  ],
  keywords: [{ term: "Kubernetes", type: "hard", importance: "required" }],
  responsibilities: [],
  redFlags: [],
  signals: [],
}

const matchReply = {
  requirements: [
    { id: "r1", status: "met", evidence: "Node.js, PostgreSQL, Kubernetes, API" },
    { id: "r2", status: "met", evidence: "Node.js, PostgreSQL, Kubernetes, API" },
  ],
  strengths: [],
  emphasize: [],
  talkingPoints: [],
}

/** A required item the person lacks at the critical level: the evaluation's decision is "skip". */
const skipMatchReply = {
  ...matchReply,
  requirements: [
    { id: "r1", status: "missing", gap: "critical" },
    { id: "r2", status: "met", evidence: "Node.js, PostgreSQL, Kubernetes, API" },
  ],
}
const SKIP_MARKER = "Wymagamy licencji pilota"

/**
 * A model that answers the evaluation's two steps and calls `onCall` before each answer. An offer
 * whose text holds SKIP_MARKER gets a match that makes it a "skip".
 */
function fakeLlm(onCall?: (count: number) => Promise<void>): LlmClient & { purposes: string[] } {
  let skipNext = false
  const llm = {
    model: "fake",
    purposes: [] as string[],
    async completeJson(args: Parameters<LlmClient["completeJson"]>[0]) {
      llm.purposes.push(args.purpose)
      await onCall?.(llm.purposes.length)
      let reply: unknown = null
      if (args.purpose === "offer-analysis") {
        skipNext = args.user.includes(SKIP_MARKER)
        reply = analysisReply
      } else if (args.purpose === "cv-match") {
        reply = skipNext ? skipMatchReply : matchReply
      }
      if (reply == null) return null
      return { data: args.schema.parse(reply), tokenInput: 0, tokenOutput: 0, cached: false }
    },
    async completeText() {
      return null
    },
  }
  return llm as LlmClient & { purposes: string[] }
}

/** Every request gets a 404, so the evaluation's live read falls back to the index; asked are kept. */
const asked: string[] = []
const notFound = async (url: string): Promise<HttpResponse> => {
  asked.push(url)
  return { url, status: 404, body: "", contentType: "text/html" }
}
const http404: HttpClient = { get: notFound, post: notFound }

const webReply = (urls: string[]): WebRun => {
  return async () => ({ text: JSON.stringify({ offers: urls.map((url) => ({ url })) }) })
}

const unreadable = (url: string): OfferReading => ({
  url,
  outcome: "unreadable",
  facts: null,
  note: "fetch failed",
})

function deps(overrides: Partial<SearchDeps>): SearchDeps {
  return {
    run: webReply([]),
    read: async (url) => unreadable(url),
    llm: fakeLlm(),
    http: http404,
    now: () => new Date(),
    ...overrides,
  }
}

async function newSearch(userId: number, filters: SearchFilters = FILTERS) {
  return db.offerSearch.create({ data: { userId, filters } })
}

async function statusOf(searchId: string) {
  return (await db.offerSearch.findUniqueOrThrow({ where: { id: searchId } })).status
}

async function settled(searchId: string) {
  for (let i = 0; i < 200; i++) {
    const row = await db.offerSearch.findUniqueOrThrow({ where: { id: searchId } })
    if (row.status === "done" || row.status === "failed") return row
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error("the search did not finish")
}

test("a search reads, screens, evaluates and ranks", async () => {
  const user = await makeUser()
  const jobA = await makeJob()
  const jobC = await makeJob({ salaryMin: 8000, salaryMax: 9000 })
  const urlB = `https://example.com/careers/${stamp}-b`
  const urlD = `https://example.com/careers/${stamp}-d`
  const search = await newSearch(user.id)
  const seen: string[] = []

  // seen inside the fakes, asserted after the run: an assertion thrown in a fake would be caught
  // by the run as that link's failure
  let decisionOfAWhenBStarts: string | null | undefined
  let screenedWhenDRead: unknown
  const llm = fakeLlm(async (count) => {
    seen.push(`llm:${await statusOf(search.id)}`)
    if (count === 3) {
      const rowA = await db.offerSearchResult.findFirst({
        where: { searchId: search.id, jobId: jobA.id },
      })
      decisionOfAWhenBStarts = rowA?.decision
    }
  })
  const readings: Record<string, OfferReading> = {
    [jobA.originalUrl]: {
      url: jobA.originalUrl,
      outcome: "read",
      facts: {
        jobId: jobA.id,
        company: "Acme",
        title: jobA.title,
        location: "Polska",
        salaryText: "22 000–27 000 PLN",
      },
      text: OFFER_TEXT,
    },
    [urlB]: {
      url: urlB,
      outcome: "read",
      facts: {
        jobId: null,
        company: `Beta ${stamp}`,
        title: "Senior Platform Engineer",
        location: "Polska",
        salaryText: null,
      },
      text: OFFER_TEXT,
      byModel: true,
    },
    [jobC.originalUrl]: {
      url: jobC.originalUrl,
      outcome: "read",
      facts: {
        jobId: jobC.id,
        company: "Acme",
        title: jobC.title,
        location: "Polska",
        salaryText: "8 000–9 000 PLN",
      },
    },
    [urlD]: unreadable(urlD),
  }

  await runOfferSearch(
    search.id,
    deps({
      run: async (args) => {
        seen.push(`run:${await statusOf(search.id)}`)
        return webReply([jobA.originalUrl, urlB, jobC.originalUrl, urlD])(args)
      },
      read: async (url) => {
        seen.push(`read:${await statusOf(search.id)}`)
        if (url === urlD) {
          const now = await db.offerSearch.findUniqueOrThrow({ where: { id: search.id } })
          screenedWhenDRead = (now.counts as SearchCounts).screened
        }
        return readings[url] ?? unreadable(url)
      },
      llm,
    }),
    "pl"
  )

  const row = await db.offerSearch.findUniqueOrThrow({ where: { id: search.id } })
  assert.equal(row.status, "done")
  assert.equal(row.errorCode, null)
  assert.ok(row.finishedAt)
  assert.deepEqual([...new Set(seen)], ["run:searching", "read:reading", "llm:evaluating"])
  assert.ok(decisionOfAWhenBStarts, "A's result is written before B is evaluated")
  assert.deepEqual(
    screenedWhenDRead,
    { "pay-below": 1 },
    "the counts move as links are read, not only when the status changes"
  )

  const results = await db.offerSearchResult.findMany({ where: { searchId: search.id } })
  const byUrl = new Map(results.map((result) => [result.url, result]))
  assert.equal(results.length, 4)

  const a = byUrl.get(jobA.originalUrl)!
  const b = byUrl.get(urlB)!
  const c = byUrl.get(jobC.originalUrl)!
  const d = byUrl.get(urlD)!
  assert.equal(a.outcome, "ok")
  assert.equal(b.outcome, "ok")
  assert.ok(a.decision && b.decision)
  assert.ok(a.evaluation && b.evaluation)
  assert.deepEqual([a.rank, b.rank].sort(), [1, 2])
  assert.equal(a.factsByModel, false)
  assert.equal(b.factsByModel, true)
  assert.ok(b.jobId, "the page's reading is stored as an offer")
  const jobB = await db.job.findUniqueOrThrow({ where: { id: b.jobId! } })
  assert.equal(jobB.sourceType, "WEB_SEARCH")

  assert.equal(c.outcome, "screened-out")
  assert.equal(c.reason, "pay-below")
  assert.equal(c.decision, null)
  assert.equal(d.outcome, "unreadable")
  assert.equal(d.reason, "unreadable")
  assert.equal(d.jobId, null)
  assert.equal(d.score, null)

  const counts = row.counts as SearchCounts
  assert.equal(counts.found, 4)
  assert.equal(counts.known, 0)
  assert.equal(counts.read, 3)
  assert.equal(counts.unreadable, 1)
  assert.deepEqual(counts.screened, { "pay-below": 1 })
  assert.equal(counts.evaluated, 2)
  assert.equal(counts.shown, 2)
  assert.equal(counts.weaker, 0)
  assert.deepEqual(llm.purposes, ["offer-analysis", "cv-match", "offer-analysis", "cv-match"])

  assert.equal(await db.userOffer.count({ where: { userId: user.id } }), 0)
  assert.equal(
    await db.userOffer.count({ where: { jobId: { in: [jobA.id, jobB.id, jobC.id] } } }),
    0,
    "nothing enters anyone's Offers"
  )
  assert.equal(await db.offerEvaluation.count({ where: { userId: user.id } }), 0)
  assert.ok(
    asked.some((url) => url.includes(`${stamp}-b`)),
    "the evaluation reads through the injected http, not the network"
  )
})

test("past the limits: 20 evaluated, 15 shown, a skip is never shown", async () => {
  const user = await makeUser()
  // found first, so it is evaluated: its text makes the evaluation say "skip"
  const skipped = await makeJob({ descriptionText: `${SKIP_MARKER}. Wymagamy Kubernetes.` })
  const fine: Awaited<ReturnType<typeof makeJob>>[] = []
  for (let i = 0; i < EVALUATION_LIMIT; i++) fine.push(await makeJob())
  const jobs = [skipped, ...fine]
  const search = await newSearch(user.id)
  const byUrl = new Map(jobs.map((job) => [job.originalUrl, job]))

  await runOfferSearch(
    search.id,
    deps({
      run: webReply(jobs.map((job) => job.originalUrl)),
      read: async (url) => {
        const job = byUrl.get(url)!
        return {
          url,
          outcome: "read",
          facts: {
            jobId: job.id,
            company: "Acme",
            title: job.title,
            location: null,
            salaryText: null,
          },
        }
      },
    }),
    "pl"
  )

  const row = await db.offerSearch.findUniqueOrThrow({ where: { id: search.id } })
  assert.equal(row.status, "done")
  const counts = row.counts as SearchCounts
  assert.equal(counts.found, EVALUATION_LIMIT + 1)
  assert.equal(counts.evaluated, EVALUATION_LIMIT)
  assert.equal(counts.notEvaluated, 1)
  assert.equal(counts.shown, SHOWN)
  // 19 that fit, 15 of them shown, and the skip
  assert.equal(counts.weaker, EVALUATION_LIMIT - 1 - SHOWN + 1)

  const results = await db.offerSearchResult.findMany({ where: { searchId: search.id } })
  const of = (job: { originalUrl: string }) =>
    results.find((result) => result.url === job.originalUrl)!
  assert.equal(of(skipped).decision, "skip")
  assert.equal(of(skipped).outcome, "weaker")
  assert.equal(of(skipped).rank, null)
  const last = of(fine.at(-1)!)
  assert.deepEqual([last.outcome, last.reason, last.decision], ["not-evaluated", "limit", null])
  const ranked = results.filter((result) => result.rank != null).sort((a, b) => a.rank! - b.rank!)
  assert.deepEqual(
    ranked.map((result) => result.rank),
    Array.from({ length: SHOWN }, (_, i) => i + 1)
  )
  assert.equal(ranked[0]?.decision, "apply")
  assert.ok(ranked.every((result) => result.outcome === "ok" && result.decision !== "skip"))
  assert.equal(results.filter((result) => result.outcome === "weaker").length, counts.weaker)
})

test("a skip is never ranked, an apply is", async () => {
  const user = await makeUser()
  const skipped = await makeJob({ descriptionText: `${SKIP_MARKER}. Wymagamy Kubernetes.` })
  const fits = await makeJob()
  const search = await newSearch(user.id)
  const jobs = new Map([skipped, fits].map((job) => [job.originalUrl, job]))
  await runOfferSearch(
    search.id,
    deps({
      run: webReply([skipped.originalUrl, fits.originalUrl]),
      read: async (url) => {
        const job = jobs.get(url)!
        return {
          url,
          outcome: "read",
          facts: {
            jobId: job.id,
            company: "Acme",
            title: job.title,
            location: null,
            salaryText: null,
          },
        }
      },
    }),
    "pl"
  )
  const results = await db.offerSearchResult.findMany({ where: { searchId: search.id } })
  const of = (job: { originalUrl: string }) =>
    results.find((result) => result.url === job.originalUrl)
  assert.deepEqual(
    [of(skipped)?.decision, of(skipped)?.outcome, of(skipped)?.rank],
    ["skip", "weaker", null]
  )
  assert.deepEqual([of(fits)?.decision, of(fits)?.outcome, of(fits)?.rank], ["apply", "ok", 1])
  const counts = (await db.offerSearch.findUniqueOrThrow({ where: { id: search.id } }))
    .counts as SearchCounts
  assert.deepEqual([counts.shown, counts.weaker], [1, 1])
})

test("a page is stored under the posting's own link, a job board's without its text", async () => {
  const user = await makeUser()
  const posting = `https://example.com/careers/${stamp}-posting`
  const applyPage = `${posting}/apply`
  const board = `https://justjoin.it/job-offer/${stamp}-acme-senior-platform-engineer`
  const boardText = "Tekst ogłoszenia z tablicy, którego nie przechowujemy"
  const pageText = "Tekst ze strony pracodawcy: Kubernetes i PostgreSQL"
  const search = await newSearch(user.id)
  const readings: Record<string, OfferReading> = {
    // readOffer gives back the posting itself for an /apply link (normalizePostingUrl)
    [applyPage]: {
      url: posting,
      outcome: "read",
      facts: {
        jobId: null,
        company: `Gamma ${stamp}`,
        title: "Senior Platform Engineer",
        location: null,
        salaryText: null,
      },
      text: pageText,
      byModel: true,
    },
    [board]: {
      url: board,
      outcome: "read",
      facts: {
        jobId: null,
        company: `Delta ${stamp}`,
        title: "Senior Platform Engineer",
        location: null,
        salaryText: null,
      },
      text: boardText,
    },
  }

  await runOfferSearch(
    search.id,
    deps({ run: webReply([applyPage, board]), read: async (url) => readings[url]! }),
    "pl"
  )

  const results = await db.offerSearchResult.findMany({ where: { searchId: search.id } })
  const page = results.find((result) => result.url === applyPage)
  const fromBoard = results.find((result) => result.url === board)
  assert.ok(page?.jobId && fromBoard?.jobId, "both are stored as offers, under the found links")
  const pageJob = await db.job.findUniqueOrThrow({ where: { id: page.jobId } })
  assert.equal(pageJob.originalUrl, posting)
  assert.ok(pageJob.descriptionText.includes("Kubernetes i PostgreSQL"))
  // the end-to-end guarantee: payloadToJob also leaves an aggregator's text out (the same hosts as
  // readOnlyWhenTailoring), so this holds even if run.ts's own check went missing
  const boardJob = await db.job.findUniqueOrThrow({ where: { id: fromBoard.jobId } })
  assert.ok(!boardJob.descriptionText.includes(boardText), "a job board's text is not stored")
  assert.ok(!boardJob.summary.includes(boardText))
  assert.equal(await db.userOffer.count({ where: { userId: user.id } }), 0)
})

test("a closed offer is counted and not evaluated", async () => {
  const user = await makeUser()
  const job = await makeJob({ status: "CLOSED" })
  const search = await newSearch(user.id)
  const llm = fakeLlm()
  await runOfferSearch(
    search.id,
    deps({
      run: webReply([job.originalUrl]),
      read: async (url) => ({
        url,
        outcome: "read",
        facts: {
          jobId: job.id,
          company: "Acme",
          title: job.title,
          location: null,
          salaryText: null,
        },
      }),
      llm,
    }),
    "pl"
  )
  const [result] = await db.offerSearchResult.findMany({ where: { searchId: search.id } })
  assert.equal(result?.outcome, "closed")
  assert.equal(result?.jobId, job.id)
  assert.deepEqual(llm.purposes, [])
  const row = await db.offerSearch.findUniqueOrThrow({ where: { id: search.id } })
  assert.equal((row.counts as SearchCounts).closed, 1)
})

test("links the person already has or dismissed are skipped", async () => {
  const user = await makeUser()
  const kept = await makeJob()
  await keepOffer(user.id, kept.id)
  const dismissedUrl = `https://example.com/careers/${stamp}-dismissed`
  const earlier = await newSearch(user.id)
  await db.offerSearch.update({ where: { id: earlier.id }, data: { status: "done" } })
  await db.offerSearchResult.create({
    data: {
      searchId: earlier.id,
      userId: user.id,
      url: dismissedUrl,
      outcome: "unreadable",
      dismissedAt: new Date(),
    },
  })
  const fresh = `https://example.com/careers/${stamp}-fresh`
  const search = await newSearch(user.id)
  const read: string[] = []

  await runOfferSearch(
    search.id,
    deps({
      // the same postings spelled another way: www., a tracking parameter, a trailing slash
      run: webReply([
        kept.originalUrl.replace("https://", "https://www.") + "?utm_source=x",
        `${dismissedUrl}/`,
        fresh,
      ]),
      read: async (url) => {
        read.push(url)
        return unreadable(url)
      },
    }),
    "pl"
  )

  assert.deepEqual(read, [fresh])
  const row = await db.offerSearch.findUniqueOrThrow({ where: { id: search.id } })
  assert.equal(row.status, "done")
  assert.equal((row.counts as SearchCounts).known, 2)
  assert.equal((row.counts as SearchCounts).found, 3)
})

test("a failed web step fails the search", async () => {
  const user = await makeUser()
  const search = await newSearch(user.id)
  await runOfferSearch(search.id, deps({ run: async () => null }), "pl")
  const row = await db.offerSearch.findUniqueOrThrow({ where: { id: search.id } })
  assert.equal(row.status, "failed")
  assert.equal(row.errorCode, "web-failed")
  assert.ok(row.finishedAt)
})

test("an empty web step is a done search with nothing", async () => {
  const user = await makeUser()
  const search = await newSearch(user.id)
  await runOfferSearch(search.id, deps({ run: webReply([]) }), "pl")
  const row = await db.offerSearch.findUniqueOrThrow({ where: { id: search.id } })
  assert.equal(row.status, "done")
  assert.equal((row.counts as SearchCounts).found, 0)
  assert.equal(await db.offerSearchResult.count({ where: { searchId: search.id } }), 0)
})

test("an unexpected error fails the search as internal", async () => {
  const user = await makeUser()
  const search = await newSearch(user.id)
  const errors: unknown[][] = []
  const original = console.error
  console.error = (...args: unknown[]) => void errors.push(args)
  try {
    await runOfferSearch(
      search.id,
      deps({
        now: () => {
          throw new Error(`clock broke for ${PERSON_NAME}`)
        },
      }),
      "pl"
    )
  } finally {
    console.error = original
  }
  const row = await db.offerSearch.findUniqueOrThrow({ where: { id: search.id } })
  assert.equal(row.status, "failed")
  assert.equal(row.errorCode, "internal")
  assert.equal(errors.length, 1)
  assert.ok(!JSON.stringify(errors).includes(PERSON_NAME))
})

test("a link that throws while read is unreadable, logged without person data", async () => {
  const user = await makeUser()
  const search = await newSearch(user.id)
  const errors: unknown[][] = []
  const original = console.error
  console.error = (...args: unknown[]) => void errors.push(args)
  try {
    await runOfferSearch(
      search.id,
      deps({
        run: webReply([`https://example.com/careers/${stamp}-throws`]),
        read: async () => {
          throw new Error(`cannot read for ${PERSON_NAME}`)
        },
      }),
      "pl"
    )
  } finally {
    console.error = original
  }
  const row = await db.offerSearch.findUniqueOrThrow({ where: { id: search.id } })
  assert.equal(row.status, "done")
  assert.equal((row.counts as SearchCounts).unreadable, 1)
  assert.equal(errors.length, 1)
  assert.ok(String(errors[0]?.[0]).includes(search.id))
  assert.ok(!JSON.stringify(errors).includes(PERSON_NAME))
})

test("one search at a time", async () => {
  const user = await makeUser()
  let release: (value: { text: string } | null) => void = () => {}
  const held = new Promise<{ text: string } | null>((resolve) => (release = resolve))
  let running = false
  const first = await startOfferSearch(
    user.id,
    FILTERS,
    "pl",
    deps({
      run: () => {
        running = true
        return held
      },
    })
  )
  assert.equal(first.started, true)
  for (let i = 0; i < 200 && !running; i++) await new Promise((r) => setTimeout(r, 10))
  assert.equal(await statusOf(first.searchId), "searching")

  const second = await startOfferSearch(user.id, FILTERS, "pl", deps({}))
  assert.deepEqual(second, { searchId: first.searchId, started: false })
  assert.equal(await db.offerSearch.count({ where: { userId: user.id } }), 1)

  release(null)
  const row = await settled(first.searchId)
  assert.equal(row.status, "failed")
  assert.equal(row.errorCode, "web-failed")
  const stored = await db.offerSearch.findUniqueOrThrow({ where: { id: first.searchId } })
  assert.deepEqual(stored.filters, FILTERS)
})

test("without Claude Code no search starts", async () => {
  const user = await makeUser()
  const provider = process.env.LLM_PROVIDER
  process.env.LLM_PROVIDER = "none"
  try {
    await assert.rejects(
      startOfferSearch(user.id, FILTERS, "pl", { read: async (url) => unreadable(url) }),
      (error: unknown) => error instanceof OfferSearchError && error.code === "no-cli"
    )
  } finally {
    if (provider === undefined) delete process.env.LLM_PROVIDER
    else process.env.LLM_PROVIDER = provider
  }
  assert.equal(await db.offerSearch.count({ where: { userId: user.id } }), 0)
})

test("recoverInterruptedSearches fails what was running before the boot", async () => {
  const user = await makeUser()
  const bootedAt = new Date()
  const stuck = await db.offerSearch.create({
    data: {
      userId: user.id,
      filters: FILTERS,
      status: "reading",
      createdAt: new Date(bootedAt.getTime() - 60_000),
    },
  })
  const done = await newSearch(user.id)
  await db.offerSearch.update({ where: { id: done.id }, data: { status: "done" } })
  // started by this server, after it booted: still running
  const other = await makeUser()
  const fresh = await db.offerSearch.create({
    data: {
      userId: other.id,
      filters: FILTERS,
      status: "searching",
      createdAt: new Date(bootedAt.getTime() + 1_000),
    },
  })

  assert.ok((await recoverInterruptedSearches(bootedAt)) >= 1)
  const row = await db.offerSearch.findUniqueOrThrow({ where: { id: stuck.id } })
  assert.equal(row.status, "failed")
  assert.equal(row.errorCode, "interrupted")
  assert.ok(row.finishedAt)
  assert.equal(await statusOf(done.id), "done")
  assert.equal(await statusOf(fresh.id), "searching", "a search started after the boot goes on")
  await db.offerSearch.update({ where: { id: fresh.id }, data: { status: "done" } })

  const next = await startOfferSearch(user.id, FILTERS, "pl", deps({ run: webReply([]) }))
  assert.equal(next.started, true)
  assert.notEqual(next.searchId, stuck.id)
  assert.equal((await settled(next.searchId)).status, "done")
})

/** The profile fields "Also save to my profile" writes, as they are in the database. */
const profileFields = async (userId: number) =>
  db.candidateProfile.findUniqueOrThrow({
    where: { userId },
    select: { remotePreference: true, salaryFloor: true, salaryCurrency: true, homeCity: true },
  })

/** FILTERS changed in the fields "Also save to my profile" writes. */
const EDITED: SearchFilters = {
  ...FILTERS,
  workMode: "onsite",
  places: ["Gdańsk"],
  minPay: { ...FILTERS.minPay, amount: 31000, currency: "EUR" },
}

test("save to profile without Claude Code writes nothing to the profile", async () => {
  const user = await makeUser()
  const before = await profileFields(user.id)
  const provider = process.env.LLM_PROVIDER
  process.env.LLM_PROVIDER = "none"
  try {
    await assert.rejects(
      startSearchFromForm(user.id, { filters: EDITED, saveToProfile: true }, "pl", {
        read: async (url) => unreadable(url),
      }),
      (error: unknown) => error instanceof OfferSearchError && error.code === "no-cli"
    )
  } finally {
    if (provider === undefined) delete process.env.LLM_PROVIDER
    else process.env.LLM_PROVIDER = provider
  }
  assert.deepEqual(await profileFields(user.id), before)
  assert.equal(await db.offerSearch.count({ where: { userId: user.id } }), 0)
})

test("save to profile while a search runs writes nothing to the profile", async () => {
  const user = await makeUser()
  const before = await profileFields(user.id)
  const running = await db.offerSearch.create({
    data: { userId: user.id, filters: FILTERS, status: "reading" },
  })
  const result = await startSearchFromForm(
    user.id,
    { filters: EDITED, saveToProfile: true },
    "pl",
    deps({ run: webReply([]) })
  )
  assert.deepEqual(result, { searchId: running.id, started: false })
  assert.deepEqual(await profileFields(user.id), before)
  await db.offerSearch.update({ where: { id: running.id }, data: { status: "done" } })
})

test("save to profile on a search that starts writes the profile fields", async () => {
  const user = await makeUser()
  const result = await startSearchFromForm(
    user.id,
    { filters: EDITED, saveToProfile: true },
    "pl",
    deps({ run: webReply([]) })
  )
  assert.equal(result.started, true)
  assert.deepEqual(await profileFields(user.id), {
    remotePreference: "onsite",
    salaryFloor: 31000,
    salaryCurrency: "EUR",
    homeCity: "Gdańsk",
  })
  assert.equal((await settled(result.searchId)).status, "done")
})

/** A reading of a Job the person can read: company, title, the offer's text. */
const readingOf = (job: { id: string; originalUrl: string; title: string }): OfferReading => ({
  url: job.originalUrl,
  outcome: "read",
  facts: {
    jobId: job.id,
    company: "Acme",
    title: job.title,
    location: "Polska",
    salaryText: "22 000–27 000 PLN",
  },
  text: OFFER_TEXT,
})

test("a result row that cannot be written fails that link, not the search", async () => {
  const user = await makeUser()
  const jobA = await makeJob()
  const jobB = await makeJob()
  const search = await newSearch(user.id)
  const readings = new Map([jobA, jobB].map((job) => [job.originalUrl, readingOf(job)]))
  // A's offer disappears while it is evaluated: its row (jobId A) can no longer be written
  const llm = fakeLlm(async (count) => {
    if (count === 2) await db.job.delete({ where: { id: jobA.id } })
  })
  const errors: unknown[][] = []
  const original = console.error
  console.error = (...args: unknown[]) => void errors.push(args)
  try {
    await runOfferSearch(
      search.id,
      deps({
        run: webReply([jobA.originalUrl, jobB.originalUrl]),
        read: async (url) => readings.get(url)!,
        llm,
      }),
      "pl"
    )
  } finally {
    console.error = original
  }
  const row = await db.offerSearch.findUniqueOrThrow({ where: { id: search.id } })
  assert.equal(row.status, "done")
  assert.equal(row.errorCode, null)
  const results = await db.offerSearchResult.findMany({ where: { searchId: search.id } })
  assert.deepEqual(
    results.map((result) => [result.url, result.outcome, result.rank]),
    [[jobB.originalUrl, "ok", 1]]
  )
  const counts = row.counts as SearchCounts
  assert.deepEqual([counts.evaluated, counts.notEvaluated, counts.shown], [1, 1, 1])
  assert.equal(errors.length, 1)
  assert.ok(String(errors[0]?.[0]).includes(search.id))
  assert.ok(String(errors[0]?.[0]).includes("write"))
  assert.ok(!JSON.stringify(errors).includes(PERSON_NAME))
})

test("a result dismissed while the search runs takes no ranking slot", async () => {
  const user = await makeUser()
  const jobA = await makeJob()
  const jobB = await makeJob()
  const search = await newSearch(user.id)
  const readings = new Map([jobA, jobB].map((job) => [job.originalUrl, readingOf(job)]))
  // A is evaluated and shown on the page; the person dismisses it while B is evaluated
  const llm = fakeLlm(async (count) => {
    if (count !== 3) return
    const rowA = await db.offerSearchResult.findFirstOrThrow({
      where: { searchId: search.id, jobId: jobA.id },
    })
    await dismissSearchResult(user.id, rowA.id)
  })
  await runOfferSearch(
    search.id,
    deps({
      run: webReply([jobA.originalUrl, jobB.originalUrl]),
      read: async (url) => readings.get(url)!,
      llm,
    }),
    "pl"
  )
  const results = await db.offerSearchResult.findMany({ where: { searchId: search.id } })
  const of = (job: { id: string }) => results.find((result) => result.jobId === job.id)
  assert.ok(of(jobA)?.dismissedAt)
  assert.equal(of(jobA)?.rank, null)
  assert.equal(of(jobB)?.rank, 1)
  const counts = (await db.offerSearch.findUniqueOrThrow({ where: { id: search.id } }))
    .counts as SearchCounts
  assert.deepEqual([counts.evaluated, counts.shown, counts.weaker], [2, 1, 0])
})

for (const erasedAt of ["before the evaluation", "between two reads"] as const) {
  test(`a search erased ${erasedAt} stops quietly, with no more model runs`, async () => {
    const user = await makeUser()
    const jobA = await makeJob()
    const jobB = await makeJob()
    const search = await newSearch(user.id)
    const readings = new Map([jobA, jobB].map((job) => [job.originalUrl, readingOf(job)]))
    // the person deletes the profile (eraseProfile deletes the searches) while a link is read
    const erasingUrl = erasedAt === "between two reads" ? jobA.originalUrl : jobB.originalUrl
    const read: string[] = []
    const llm = fakeLlm()
    const errors: unknown[][] = []
    const original = console.error
    console.error = (...args: unknown[]) => void errors.push(args)
    try {
      await runOfferSearch(
        search.id,
        deps({
          run: webReply([jobA.originalUrl, jobB.originalUrl]),
          read: async (url) => {
            read.push(url)
            if (url === erasingUrl) await db.offerSearch.delete({ where: { id: search.id } })
            return readings.get(url)!
          },
          llm,
        }),
        "pl"
      )
    } finally {
      console.error = original
    }
    assert.deepEqual(
      read,
      erasedAt === "between two reads" ? [jobA.originalUrl] : [jobA.originalUrl, jobB.originalUrl],
      "no link is read after the erase"
    )
    assert.deepEqual(llm.purposes, [], "no model runs after the erase")
    assert.deepEqual(errors, [], "nothing logged: the erase is not a failure")
    assert.equal(await db.offerSearch.count({ where: { id: search.id } }), 0)
    assert.equal(await db.offerSearchResult.count({ where: { searchId: search.id } }), 0)
  })
}

test("the web step gets only the filters", async () => {
  const user = await makeUser()
  const search = await newSearch(user.id)
  let sent = ""
  await runOfferSearch(
    search.id,
    deps({
      run: async (args) => {
        sent = `${args.prompt}\n${args.system ?? ""}`
        return { text: '{"offers":[]}' }
      },
    }),
    "pl"
  )
  assert.ok(sent.includes("Senior Platform Engineer"), "the filters are there")
  const cv = syntheticCv(2)
  for (const secret of [
    PERSON_NAME,
    user.email,
    FACT_TEXT,
    cv.header.name,
    cv.header.email,
    "Przykładowa Firma",
  ]) {
    assert.ok(!sent.includes(secret), `the web step does not get ${secret}`)
  }
})

/** One search over one offer the person can read, run to its end; the offer's result row. */
async function searchedOne(userId: number, filters: SearchFilters = FILTERS) {
  const job = await makeJob()
  const search = await newSearch(userId, filters)
  const reading: OfferReading = {
    url: job.originalUrl,
    outcome: "read",
    facts: {
      jobId: job.id,
      company: "Acme",
      title: job.title,
      location: "Polska",
      salaryText: "22 000–27 000 PLN",
    },
    text: OFFER_TEXT,
  }
  await runOfferSearch(
    search.id,
    deps({ run: webReply([job.originalUrl]), read: async () => reading }),
    "pl"
  )
  const result = await db.offerSearchResult.findFirstOrThrow({ where: { searchId: search.id } })
  return { job, search, result }
}

test("add keeps the offer and evaluates it against the profile", async () => {
  const user = await makeUser()
  // the search asks for more than the profile's floor of 20000
  const { job, result } = await searchedOne(user.id, {
    ...FILTERS,
    minPay: { ...FILTERS.minPay, amount: 21000 },
  })
  assert.equal(result.outcome, "ok")
  assert.equal(await db.userOffer.count({ where: { userId: user.id } }), 0)

  const added = await addSearchResult(user.id, result.id, "pl", { llm: fakeLlm(), http: http404 })
  assert.deepEqual(added, { jobId: job.id })
  assert.equal(await db.userOffer.count({ where: { userId: user.id, jobId: job.id } }), 1)
  const row = await db.offerSearchResult.findUniqueOrThrow({ where: { id: result.id } })
  assert.ok(row.addedAt)
  const stored = await db.offerEvaluation.findUniqueOrThrow({
    where: { userId_jobId: { userId: user.id, jobId: job.id } },
  })
  const evaluation = parseEvaluation(stored.result)
  assert.ok(evaluation)
  const pay = evaluation.dimensions.pay as { expected?: { floor?: number | null } }
  assert.equal(pay.expected?.floor, 20000, "the profile's floor, not the search's 21000")
})

test("add twice is one offer", async () => {
  const user = await makeUser()
  const { result } = await searchedOne(user.id)
  const llm = fakeLlm()
  await addSearchResult(user.id, result.id, "pl", { llm, http: http404 })
  const first = await db.offerSearchResult.findUniqueOrThrow({ where: { id: result.id } })
  await addSearchResult(user.id, result.id, "pl", { llm, http: http404 })
  const second = await db.offerSearchResult.findUniqueOrThrow({ where: { id: result.id } })
  assert.equal(await db.userOffer.count({ where: { userId: user.id } }), 1)
  assert.equal(second.addedAt?.getTime(), first.addedAt?.getTime())
})

test("another person's result is not found", async () => {
  const owner = await makeUser()
  const other = await makeUser()
  const { result, search } = await searchedOne(owner.id)
  const unlinked = await db.offerSearchResult.create({
    data: {
      searchId: search.id,
      userId: owner.id,
      url: `https://example.com/${stamp}-x`,
      outcome: "unreadable",
    },
  })
  const code = async (run: () => Promise<unknown>) =>
    run().then(
      () => null,
      (error: unknown) => (error instanceof OfferSearchError ? error.code : "other")
    )
  assert.equal(
    await code(() => addSearchResult(other.id, result.id, "pl", { llm: fakeLlm() })),
    "not-found"
  )
  assert.equal(
    await code(() => addSearchResult(owner.id, unlinked.id, "pl", { llm: fakeLlm() })),
    "not-found"
  )
  assert.equal(
    await code(() => addSearchResult(owner.id, "nope", "pl", { llm: fakeLlm() })),
    "not-found"
  )
  assert.equal(await code(() => dismissSearchResult(other.id, result.id)), "not-found")
  assert.equal(await db.userOffer.count({ where: { userId: other.id } }), 0)
})

test("dismissed results are left out of the view", async () => {
  const user = await makeUser()
  const { result, search } = await searchedOne(user.id)
  const before = await getOfferSearchView(user.id)
  assert.equal(before.search?.id, search.id)
  assert.equal(before.search?.shown.length, 1)
  const shown = before.search!.shown[0]
  assert.equal(shown.id, result.id)
  assert.equal(shown.rank, 1)
  assert.equal(
    shown.company,
    "Acme " +
      (
        await db.company.findFirstOrThrow({ where: { jobs: { some: { id: result.jobId! } } } })
      ).name.slice(5)
  )
  assert.equal(shown.required, 2)
  assert.equal(shown.met, 2)
  assert.equal(shown.gaps, 0)
  assert.deepEqual(
    [shown.salaryMin, shown.salaryMax, shown.salaryCurrency],
    [22000, 27000, "PLN/month"]
  )
  assert.equal(shown.topGap, null)

  await dismissSearchResult(user.id, result.id)
  await dismissSearchResult(user.id, result.id)
  const after = await getOfferSearchView(user.id)
  assert.equal(after.search?.shown.length, 0)
  assert.equal(after.search?.weaker.length, 0)
  assert.equal(after.search?.unreadable.length, 0)
})

test("the view lists weaker and unreadable ones, and counts the rest", async () => {
  const user = await makeUser()
  const { search } = await searchedOne(user.id)
  await db.offerSearchResult.createMany({
    data: [
      {
        searchId: search.id,
        userId: user.id,
        url: `https://example.com/${stamp}-u`,
        outcome: "unreadable",
        reason: "partial",
      },
      {
        searchId: search.id,
        userId: user.id,
        url: `https://example.com/${stamp}-c`,
        outcome: "closed",
      },
      {
        searchId: search.id,
        userId: user.id,
        url: `https://example.com/${stamp}-w`,
        outcome: "weaker",
        decision: "skip",
        score: 10,
      },
    ],
  })
  const view = await getOfferSearchView(user.id)
  assert.equal(view.search?.shown.length, 1)
  assert.deepEqual(
    view.search?.weaker.map((r) => r.decision),
    ["skip"]
  )
  assert.deepEqual(
    view.search?.unreadable.map((r) => r.reason),
    ["partial"]
  )
  assert.equal(view.search?.shown[0].gaps, 0)
})

test("the view proposes the last search's filters", async () => {
  const user = await makeUser()
  const empty = await getOfferSearchView(user.id)
  assert.equal(empty.search, null)
  assert.deepEqual(
    empty.proposed,
    filtersFromProfile(await db.candidateProfile.findUnique({ where: { userId: user.id } }))
  )
  assert.equal(empty.differsFromProfile, false)
  assert.deepEqual(empty.profileFilters, empty.proposed)

  const filters = { ...FILTERS, minPay: { ...FILTERS.minPay, amount: 33000 } }
  const search = await newSearch(user.id, filters)
  const view = await getOfferSearchView(user.id)
  assert.deepEqual(view.proposed, filters)
  assert.equal(view.differsFromProfile, true)
  assert.equal(view.profileFilters.minPay.amount, 20000)
  assert.equal(view.search?.id, search.id)
  assert.equal(typeof view.available, "boolean")
})

test("while a search runs, evaluated results are shown without their rank", async () => {
  const user = await makeUser()
  const search = await db.offerSearch.create({
    data: { userId: user.id, filters: FILTERS, status: "evaluating" },
  })
  const row = (key: string, decision: string, score: number) => ({
    searchId: search.id,
    userId: user.id,
    url: `https://example.com/${stamp}-${key}`,
    outcome: "ok",
    decision,
    score,
  })
  await db.offerSearchResult.createMany({
    data: [row("run-c", "consider", 55), row("run-s", "skip", 90), row("run-a", "apply", 70)],
  })
  const view = await getOfferSearchView(user.id)
  assert.deepEqual(
    view.search?.shown.map((r) => [r.decision, r.rank]),
    [
      ["apply", null],
      ["consider", null],
    ]
  )
})
