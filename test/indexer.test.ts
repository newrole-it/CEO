import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import type { HttpClient } from "../src/server/security/safe-fetch"
import type { SeedBoard } from "../config/seed-boards"
import type { ListedJob } from "../src/shared/schemas"

const acme: SeedBoard = {
  provider: "GREENHOUSE",
  boardId: "index-acme",
  companyName: "Index Acme",
  careersUrl: "https://job-boards.greenhouse.io/index-acme",
  apiUrl: "https://boards-api.greenhouse.io/v1/boards/index-acme/jobs",
  openJobsAtCheck: 2,
  plLocatedJobs: 1,
  identityConfirmed: true,
  priority: 1,
}

function json(url: string, body: unknown, status = 200) {
  return {
    url,
    status,
    body: JSON.stringify(body),
    contentType: "application/json",
    headers: { etag: 'W/"v1"' },
  }
}

function greenhouse(jobs: Array<{ id: number; title: string }>): HttpClient {
  return {
    async post() {
      throw new Error("post is unused")
    },
    async get(url: string) {
      if (url.includes("/boards/index-acme/jobs")) {
        return json(url, {
          jobs: jobs.map((job) => ({
            id: job.id,
            title: job.title,
            company_name: "Index Acme",
            absolute_url: `https://job-boards.greenhouse.io/index-acme/jobs/${job.id}`,
            location: { name: "Warsaw, Poland" },
          })),
        })
      }
      return { url, status: 404, body: "missing", contentType: "text/plain" }
    },
  }
}

test("indexer stores every listing and closes jobs that disappear", async () => {
  const db = (await import("../db")).default
  const { indexBoard } = await import("../src/server/index/run")
  const now = new Date("2026-10-10T12:00:00.000Z")
  await indexBoard(
    acme,
    greenhouse([
      { id: 1, title: "Head of Engineering" },
      { id: 2, title: "Account Executive" },
    ]),
    now
  )
  const stored = await db.job.findMany({
    where: { sourceBoardId: "index-acme", status: "ACTIVE" },
    orderBy: { title: "asc" },
  })
  assert.deepEqual(
    stored.map((job) => job.title),
    ["Account Executive", "Head of Engineering"]
  )
  const page = await db.careerPage.findUnique({
    where: { provider_providerBoardId: { provider: "GREENHOUSE", providerBoardId: "index-acme" } },
  })
  assert.equal(page?.indexComplete, true)
  assert.equal(page?.listedCount, 2)
  assert.ok(page?.nextCheckAt && page.nextCheckAt > now)

  await indexBoard(
    acme,
    greenhouse([{ id: 1, title: "Head of Engineering" }]),
    new Date("2026-10-11T12:00:00.000Z")
  )
  const afterMiss = await db.job.findMany({ where: { sourceBoardId: "index-acme" } })
  const executive = afterMiss.find((job) => job.title === "Account Executive")
  assert.equal(executive?.status, "POSSIBLY_CLOSED")

  await indexBoard(
    acme,
    greenhouse([{ id: 1, title: "Head of Engineering" }]),
    new Date("2026-10-12T12:00:00.000Z")
  )
  const closed = await db.job.findFirst({
    where: { sourceBoardId: "index-acme", title: "Account Executive" },
  })
  assert.equal(closed?.status, "CLOSED")
  assert.ok(closed?.closedAt)
})

test("an incomplete career crawl does not close jobs that were not fetched", async () => {
  const db = (await import("../db")).default
  const { storeBoardInventory } = await import("../src/server/index/store")
  const { nextCrawlAt } = await import("../src/server/index/schedule")
  const now = new Date("2026-10-10T15:00:00.000Z")
  const board = {
    provider: "CAREER_SITE" as const,
    boardId: "index.example",
    companyName: "Index Example",
    careersUrl: "https://index.example/jobs",
  }
  const job = (title: string, url: string): ListedJob => ({
    title,
    companyName: "Index Example",
    originalUrl: url,
    sourceType: "CAREER_SITE",
    sourceBoardId: "index.example",
    workplaceType: "HYBRID",
    needsHydration: false,
  })
  await storeBoardInventory({
    board,
    listed: {
      jobs: [job("Kept role", "https://index.example/jobs/1")],
      proven: true,
      complete: false,
      listedCount: 2,
      budgetExhausted: true,
    },
    now,
    nextCheckAt: nextCrawlAt(now, false, true),
  })
  await storeBoardInventory({
    board,
    listed: {
      jobs: [job("Second role", "https://index.example/jobs/2")],
      proven: true,
      complete: false,
      listedCount: 2,
      budgetExhausted: true,
      coveredUrls: undefined,
    },
    now: new Date("2026-10-10T16:00:00.000Z"),
    nextCheckAt: nextCrawlAt(now, false, true),
  })
  const rows = await db.job.findMany({
    where: { sourceBoardId: "index.example" },
    orderBy: { title: "asc" },
  })
  assert.deepEqual(
    rows.map((item) => item.status),
    ["ACTIVE", "ACTIVE"]
  )
  const page = await db.careerPage.findUnique({
    where: {
      provider_providerBoardId: { provider: "CAREER_SITE", providerBoardId: "index.example" },
    },
  })
  assert.equal(page?.indexComplete, false)
})

test("an index pass reads the live sitemap instead of a short cached listing", async () => {
  const db = (await import("../db")).default
  const { storeBoardInventory } = await import("../src/server/index/store")
  const { listCareerSite } = await import("../src/server/adapters/career-site")
  const now = new Date("2026-10-10T18:30:00.000Z")
  await storeBoardInventory({
    board: {
      provider: "SUCCESSFACTORS",
      boardId: "jobs.gft.com",
      companyName: "GFT Cache Probe",
      careersUrl: "https://jobs.gft.com/",
    },
    listed: {
      jobs: [
        {
          title: "Cached only",
          companyName: "GFT Cache Probe",
          originalUrl: "https://jobs.gft.com/job/Cached-Only/9/",
          sourceType: "SUCCESSFACTORS",
          sourceBoardId: "jobs.gft.com",
          workplaceType: "ONSITE",
          needsHydration: false,
        },
      ],
      proven: true,
      complete: true,
      listedCount: 1,
      note: "cache probe",
    },
    now,
    nextCheckAt: new Date("2026-10-11T18:30:00.000Z"),
  })
  const seen: string[] = []
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://jobs.gft.com/Poland/job/Warsaw-Live-One/1/</loc></url>
    <url><loc>https://jobs.gft.com/Poland/job/Krakow-Live-Two/2/</loc></url>
  </urlset>`
  const listed = await listCareerSite(
    "jobs.gft.com",
    {
      async post() {
        throw new Error("post is unused")
      },
      async get(url: string) {
        seen.push(url)
        if (url.endsWith("/robots.txt")) {
          return { url, status: 200, body: "User-agent: *\nAllow: /\n", contentType: "text/plain" }
        }
        if (url.endsWith("/sitemap.xml")) {
          return { url, status: 200, body: xml, contentType: "text/xml" }
        }
        if (url.includes("/job/")) {
          return {
            url,
            status: 200,
            body: '<html><span itemprop="title">Live role</span></html>',
            contentType: "text/html",
          }
        }
        return { url, status: 404, body: "", contentType: "text/plain" }
      },
    },
    "GFT Cache Probe",
    { detailBudget: 2, knownUrls: new Set(["https://jobs.gft.com/job/Cached-Only/9/"]) }
  )
  assert.equal(
    seen.some((url) => url.endsWith("/sitemap.xml")),
    true
  )
  assert.equal(listed.listedCount, 2)
  assert.equal(
    listed.jobs.some((job) => job.title === "Cached only"),
    false
  )
  assert.equal(listed.jobs.length, 2)
  const page = await db.careerPage.findUnique({
    where: {
      provider_providerBoardId: { provider: "SUCCESSFACTORS", providerBoardId: "jobs.gft.com" },
    },
  })
  assert.equal(page?.indexComplete, true)
})

const ZABKA = "https://careers.zabkagroup.com"
const zabkaBoard: SeedBoard = {
  provider: "CAREER_SITE",
  boardId: "careers.zabkagroup.com",
  companyName: "Index Zabka Probe",
  careersUrl: `${ZABKA}/`,
  apiUrl: `${ZABKA}/sitemap_index.xml`,
  openJobsAtCheck: 2,
  plLocatedJobs: 2,
  identityConfirmed: true,
  priority: 1,
}

/** A sitemap index with one job per child. `index` and `childB` fail on demand. */
function zabkaSite(state: { index: number | Error; childB: number; etag: string }) {
  const calls: Array<{ url: string; ifNoneMatch?: string }> = []
  const reply = (url: string, status: number, body = "", headers?: Record<string, string>) => ({
    url,
    status,
    body,
    contentType: "text/xml",
    headers,
  })
  const urlset = (slug: string) =>
    `<?xml version="1.0"?><urlset><url><loc>${ZABKA}/oferta-pracy/${slug}</loc></url></urlset>`
  const http: HttpClient = {
    async post() {
      throw new Error("post is unused")
    },
    async get(url, opts) {
      const ifNoneMatch = opts?.headers?.["If-None-Match"]
      calls.push({ url, ifNoneMatch })
      if (url.endsWith("/robots.txt")) return reply(url, 200, "User-agent: *\nAllow: /\n")
      if (url.endsWith("/sitemap_index.xml")) {
        if (state.index instanceof Error) throw state.index
        if (state.index !== 200) return reply(url, state.index)
        if (ifNoneMatch === state.etag) return reply(url, 304, "", { etag: state.etag })
        const index = `<?xml version="1.0"?><sitemapindex>
          <sitemap><loc>${ZABKA}/job-a.xml</loc></sitemap>
          <sitemap><loc>${ZABKA}/job-b.xml</loc></sitemap></sitemapindex>`
        return reply(url, 200, index, { etag: state.etag })
      }
      if (url.endsWith("/job-a.xml")) return reply(url, 200, urlset("kasjer-a"))
      if (url.endsWith("/job-b.xml")) return reply(url, state.childB, urlset("kasjer-b"))
      const slug = url.match(/\/oferta-pracy\/(kasjer-[ab])$/)?.[1]
      if (slug) {
        const title = slug === "kasjer-a" ? "Kasjer A" : "Kasjer B"
        const json = JSON.stringify({ "@type": "JobPosting", title, url })
        return reply(url, 200, `<script type="application/ld+json">${json}</script>`)
      }
      return reply(url, 404)
    },
  }
  return { http, calls }
}

test("a failed or partial sitemap read never closes a career site", async () => {
  const db = (await import("../db")).default
  const { indexBoard } = await import("../src/server/index/run")
  const state: { index: number | Error; childB: number; etag: string } = {
    index: 200,
    childB: 200,
    etag: '"z1"',
  }
  const site = zabkaSite(state)
  const day = (n: number) => new Date(Date.UTC(2026, 9, 10 + n, 9))
  const rows = () =>
    db.job.findMany({
      where: { sourceBoardId: zabkaBoard.boardId },
      orderBy: { title: "asc" },
      select: { title: true, status: true },
    })
  const page = () =>
    db.careerPage.findUnique({
      where: {
        provider_providerBoardId: { provider: "CAREER_SITE", providerBoardId: zabkaBoard.boardId },
      },
    })
  const allActive = [
    { title: "Kasjer A", status: "ACTIVE" },
    { title: "Kasjer B", status: "ACTIVE" },
  ]

  assert.equal(await indexBoard(zabkaBoard, site.http, day(0)), "indexed")
  assert.deepEqual(await rows(), allActive)
  assert.equal((await page())?.indexComplete, true)

  for (const failure of [503, new Error("read ECONNRESET")]) {
    state.index = failure
    assert.equal(await indexBoard(zabkaBoard, site.http, day(1)), "failed")
    assert.deepEqual(await rows(), allActive)
    const after = await page()
    assert.equal(after?.lastSuccessfulFetchAt?.getTime(), day(0).getTime())
    assert.equal(after?.lastErrorCode, "TEMPORARY_ERROR")
  }

  // The board's own validators after a complete crawl: 304 is an unchanged board.
  state.index = 200
  assert.equal(await indexBoard(zabkaBoard, site.http, day(2)), "unchanged")
  assert.deepEqual(await rows(), allActive)

  // The site changed and one child sitemap fails: B is not closed, and the read is unfinished.
  state.etag = '"z2"'
  state.childB = 500
  assert.equal(await indexBoard(zabkaBoard, site.http, day(3)), "indexed")
  assert.deepEqual(await rows(), allActive)
  assert.equal((await page())?.indexComplete, false)

  // After an unfinished crawl no validators are sent, so a 304 cannot park the board.
  state.childB = 200
  site.calls.length = 0
  assert.equal(await indexBoard(zabkaBoard, site.http, day(4)), "indexed")
  const index = site.calls.find((call) => call.url.endsWith("/sitemap_index.xml"))
  assert.equal(index?.ifNoneMatch, undefined)
  assert.equal((await page())?.indexComplete, true)
  assert.deepEqual(await rows(), allActive)
})

test("a watched site closes an offer whose link is gone and refreshes the ones still linked", async () => {
  const db = (await import("../db")).default
  const { refreshCareerSite } = await import("../src/server/watchlist/index-watched")
  const site = "https://watched-probe.example"
  const company = await db.company.create({
    data: { name: "Watched Probe", normalizedName: "watched probe index test" },
  })
  const careerPage = await db.careerPage.create({
    data: {
      companyId: company.id,
      url: `${site}/careers`,
      normalizedUrl: `${site}/careers`,
      provider: "GENERIC_HTML",
      providerBoardId: "site:watched-probe.example",
      resolutionStatus: "RESOLVED_ATS",
      confidence: 1,
    },
  })
  let links = ["backend-engineer", "frontend-engineer"]
  const http: HttpClient = {
    async post() {
      throw new Error("post is unused")
    },
    async get(url) {
      const html = (body: string) => ({ url, status: 200, body, contentType: "text/html" })
      if (url.endsWith("/robots.txt")) return html("User-agent: *\nAllow: /\n")
      if (url === `${site}/careers`) {
        return html(links.map((slug) => `<a href="/careers/${slug}">${slug}</a>`).join(""))
      }
      const slug = url.match(/\/careers\/([a-z-]+)$/)?.[1]
      if (slug) {
        const json = JSON.stringify({ "@type": "JobPosting", title: slug, url })
        return html(`<script type="application/ld+json">${json}</script>`)
      }
      return { url, status: 404, body: "", contentType: "text/plain" }
    },
  }
  const day = (n: number) => new Date(Date.UTC(2026, 9, 10 + n, 9))
  const status = async () =>
    Object.fromEntries(
      (
        await db.job.findMany({
          where: { careerPageId: careerPage.id },
          select: { title: true, status: true, lastSeenAt: true },
        })
      ).map((row) => [row.title, `${row.status} ${row.lastSeenAt.toISOString().slice(0, 10)}`])
    )

  assert.equal(await refreshCareerSite(careerPage, company, http, day(0)), "indexed")
  links = ["backend-engineer"]
  await refreshCareerSite(careerPage, company, http, day(1))
  // The kept offer was not read again (known), but it is on the site, so it counts as seen today.
  assert.deepEqual(await status(), {
    "backend-engineer": "ACTIVE 2026-10-11",
    "frontend-engineer": "POSSIBLY_CLOSED 2026-10-10",
  })
  await refreshCareerSite(careerPage, company, http, day(2))
  assert.deepEqual(await status(), {
    "backend-engineer": "ACTIVE 2026-10-12",
    "frontend-engineer": "CLOSED 2026-10-10",
  })
})

const ghBoard = {
  provider: "GREENHOUSE" as const,
  boardId: "index-stripe-probe",
  companyName: "Index Stripe Probe",
  careersUrl: "https://stripe.com/jobs",
}
const ghJob = (id: string, url: string, descriptionText?: string): ListedJob => ({
  externalId: id,
  title: `Role ${id}`,
  companyName: ghBoard.companyName,
  originalUrl: url,
  descriptionText,
  sourceType: "GREENHOUSE",
  sourceBoardId: ghBoard.boardId,
  workplaceType: "REMOTE",
  needsHydration: false,
})

test("one listed job does not keep alive every job on its URL", async () => {
  const db = (await import("../db")).default
  const { storeBoardInventory } = await import("../src/server/index/store")
  const shared = "https://stripe.com/jobs/search"
  const pass = (n: number, jobs: ListedJob[]) =>
    storeBoardInventory({
      board: ghBoard,
      listed: { jobs, proven: true, complete: true },
      now: new Date(Date.UTC(2026, 9, 10 + n, 9)),
      nextCheckAt: new Date(Date.UTC(2026, 9, 11 + n, 9)),
    })
  await pass(0, [ghJob("99000901", shared), ghJob("99000902", shared)])
  await pass(1, [ghJob("99000901", shared)])
  await pass(2, [ghJob("99000901", shared)])
  const rows = await db.job.findMany({
    where: { sourceBoardId: ghBoard.boardId, externalId: { in: ["99000901", "99000902"] } },
    orderBy: { externalId: "asc" },
  })
  assert.deepEqual(
    rows.map((row) => row.status),
    ["ACTIVE", "CLOSED"]
  )
})

test("a listing without text keeps the stored description", async () => {
  const db = (await import("../db")).default
  const { storeBoardInventory } = await import("../src/server/index/store")
  const url = "https://job-boards.greenhouse.io/index-stripe-probe/jobs/99000903"
  const text = "Build payment rails for Poland. Rust, Postgres, on-call one week in six."
  const store = (job: ListedJob, n: number) =>
    storeBoardInventory({
      board: ghBoard,
      listed: { jobs: [job], proven: true, complete: false },
      now: new Date(Date.UTC(2026, 9, 10 + n, 9)),
      nextCheckAt: new Date(Date.UTC(2026, 9, 11 + n, 9)),
    })
  await store(ghJob("99000903", url, text), 0)
  const before = await db.job.findFirstOrThrow({ where: { identityKey: "greenhouse:99000903" } })
  await store(ghJob("99000903", url), 1)
  const after = await db.job.findFirstOrThrow({ where: { identityKey: "greenhouse:99000903" } })
  assert.equal(after.descriptionText, text)
  assert.equal(after.summary, before.summary)
  assert.equal(after.contentHash, before.contentHash)
  assert.equal(after.lastSeenAt.toISOString(), "2026-10-11T09:00:00.000Z")
})

const traffitJob = (board: string, id: string): ListedJob => ({
  externalId: id,
  title: `Developer ${board} ${id}`,
  companyName: `Index Traffit ${board}`,
  originalUrl: `https://${board}.traffit.com/public/an/${id}`,
  sourceType: "TRAFFIT",
  sourceBoardId: board,
  workplaceType: "REMOTE",
  needsHydration: false,
})
const traffitBoard = (board: string) => ({
  provider: "TRAFFIT" as const,
  boardId: board,
  companyName: `Index Traffit ${board}`,
  careersUrl: `https://${board}.traffit.com/`,
})

test("two employers' job 106 are two rows, and an old unscoped row moves to the new key", async () => {
  const db = (await import("../db")).default
  const { storeBoardInventory, ensureCareerPage } = await import("../src/server/index/store")
  const now = new Date("2026-10-10T09:00:00.000Z")
  const store = (board: string, ids: string[]) =>
    storeBoardInventory({
      board: traffitBoard(board),
      listed: { jobs: ids.map((id) => traffitJob(board, id)), proven: true, complete: false },
      now,
      nextCheckAt: now,
    })

  // A row written before the fix, under the unscoped key, with a user's feedback on it.
  const page = await ensureCareerPage(traffitBoard("idx-tutlo"), "Index Traffit idx-tutlo", now)
  const legacy = await db.job.create({
    data: {
      companyId: page.companyId,
      careerPageId: page.id,
      sourceType: "TRAFFIT",
      sourceBoardId: "idx-tutlo",
      externalId: "107",
      title: "Old title",
      normalizedTitle: "Old title",
      summary: "",
      descriptionText: "",
      originalUrl: "https://idx-tutlo.traffit.com/public/an/107",
      canonicalUrl: "https://idx-tutlo.traffit.com/public/an/107",
      contentHash: "x",
      fingerprint: "x",
      identityKey: "company_site:107",
    },
  })

  await store("idx-tutlo", ["106", "107"])
  await store("idx-zen", ["106", "107"])
  const rows = await db.job.findMany({
    where: { sourceBoardId: { in: ["idx-tutlo", "idx-zen"] } },
    orderBy: { identityKey: "asc" },
    select: { id: true, identityKey: true, title: true },
  })
  assert.deepEqual(
    rows.map((row) => row.identityKey),
    [
      "company_site:idx-tutlo:106",
      "company_site:idx-tutlo:107",
      "company_site:idx-zen:106",
      "company_site:idx-zen:107",
    ]
  )
  const moved = rows.find((row) => row.identityKey === "company_site:idx-tutlo:107")
  assert.equal(moved?.id, legacy.id)
  assert.equal(moved?.title, "Developer idx-tutlo 107")
})

test("the identity repair script rekeys old rows, skips taken and collided ones, and is idempotent", async () => {
  const db = (await import("../db")).default
  const { ensureCareerPage } = await import("../src/server/index/store")
  const { repairIdentityKeys } = await import("../scripts/migrate-identity-keys")
  const now = new Date("2026-10-10T09:00:00.000Z")
  const tutlo = await ensureCareerPage(traffitBoard("idx-rep-a"), "Index Traffit idx-rep-a", now)
  const zen = await ensureCareerPage(traffitBoard("idx-rep-b"), "Index Traffit idx-rep-b", now)
  const row = (
    key: string,
    board: string,
    id: string,
    careerPageId: string,
    url = `https://${board}.traffit.com/public/an/${id}`,
    canonicalUrl = url
  ) =>
    db.job.create({
      data: {
        companyId: tutlo.companyId,
        careerPageId,
        sourceType: board === "gh" ? "GREENHOUSE" : "TRAFFIT",
        sourceBoardId: board,
        externalId: id,
        title: `Repair ${key}`,
        normalizedTitle: `Repair ${key}`,
        summary: "",
        descriptionText: "",
        originalUrl: url,
        canonicalUrl,
        contentHash: "x",
        fingerprint: "x",
        identityKey: key,
      },
    })
  const plain = await row("company_site:9001", "idx-rep-a", "9001", tutlo.id)
  // Same job stored twice: the scoped key already exists.
  await row("company_site:idx-rep-a:9002", "idx-rep-a", "9002", tutlo.id)
  const taken = await row("company_site:9002", "idx-rep-a", "9002", tutlo.id)
  // Board idx-rep-b's crawl wrote this row last time: two employers on one row.
  const collided = await row("company_site:9003", "idx-rep-a", "9003", zen.id)
  const gh = await row(
    "greenhouse:9004",
    "gh",
    "9004",
    tutlo.id,
    "https://stripe.com/jobs/search?gh_jid=9004",
    "https://stripe.com/jobs/search"
  )
  const where = { title: { startsWith: "Repair " } }

  const dry = await repairIdentityKeys({ apply: false, where })
  assert.deepEqual(
    {
      rekeyed: dry.rekeyed,
      canonicalFixed: dry.canonicalFixed,
      taken: dry.taken,
      collided: dry.collided,
    },
    { rekeyed: 1, canonicalFixed: 1, taken: 1, collided: 1 }
  )
  const untouched = await db.job.findUniqueOrThrow({ where: { id: plain.id } })
  assert.equal(untouched.identityKey, "company_site:9001")

  await repairIdentityKeys({ apply: true, where })
  const keyOf = async (id: string) =>
    (await db.job.findUniqueOrThrow({ where: { id } })).identityKey
  assert.equal(await keyOf(plain.id), "company_site:idx-rep-a:9001")
  assert.equal(await keyOf(taken.id), "company_site:9002")
  assert.equal(await keyOf(collided.id), "company_site:9003")
  const healed = await db.job.findUniqueOrThrow({ where: { id: gh.id } })
  assert.equal(healed.canonicalUrl, "https://stripe.com/jobs/search?gh_jid=9004")
  assert.equal(healed.identityKey, "greenhouse:9004")

  const again = await repairIdentityKeys({ apply: true, where })
  assert.equal(again.rekeyed, 0)
  assert.equal(again.canonicalFixed, 0)
})

after(async () => {
  const db = (await import("../db")).default
  await db.job.deleteMany({
    where: {
      OR: [
        {
          sourceBoardId: {
            in: [
              "index-acme",
              "index.example",
              "jobs.gft.com",
              "careers.zabkagroup.com",
              "index-stripe-probe",
              "idx-tutlo",
              "idx-zen",
              "idx-rep-a",
              "gh",
            ],
          },
        },
        { title: { startsWith: "Repair " } },
        { careerPage: { providerBoardId: "site:watched-probe.example" } },
      ],
    },
  })
  await db.careerPage.deleteMany({
    where: {
      providerBoardId: {
        in: [
          "index-acme",
          "index.example",
          "jobs.gft.com",
          "careers.zabkagroup.com",
          "site:watched-probe.example",
          "index-stripe-probe",
          "idx-tutlo",
          "idx-zen",
          "idx-rep-a",
          "idx-rep-b",
        ],
      },
    },
  })
  await db.crawlBudget.deleteMany({
    where: { host: { in: ["careers.zabkagroup.com", "watched-probe.example"] } },
  })
  await db.company.deleteMany({
    where: {
      name: {
        in: [
          "Index Acme",
          "Index Example",
          "GFT Cache Probe",
          "Index Zabka Probe",
          "Watched Probe",
          "Index Stripe Probe",
          "Index Traffit idx-tutlo",
          "Index Traffit idx-zen",
          "Index Traffit idx-rep-a",
          "Index Traffit idx-rep-b",
        ],
      },
    },
  })
  await db.$disconnect()
})
