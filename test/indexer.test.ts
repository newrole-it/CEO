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

after(async () => {
  const db = (await import("../db")).default
  await db.job.deleteMany({
    where: {
      sourceBoardId: { in: ["index-acme", "index.example", "jobs.gft.com"] },
    },
  })
  await db.careerPage.deleteMany({
    where: { providerBoardId: { in: ["index-acme", "index.example", "jobs.gft.com"] } },
  })
  await db.company.deleteMany({
    where: { name: { in: ["Index Acme", "Index Example", "GFT Cache Probe"] } },
  })
  await db.$disconnect()
})
