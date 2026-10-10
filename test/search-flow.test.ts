import assert from "node:assert/strict"
import {after, test} from "node:test"
import type {HttpClient} from "../src/server/security/safe-fetch"
import type {SeedBoard} from "../config/seed-boards"

const requested: string[] = []

const http: HttpClient = {
  async get(url: string) {
    requested.push(url)
    if (url.includes("/boards/wise")) {
      throw new Error("blocked slug was fetched")
    }
    if (url.includes("justjoin.it") || url.includes("teamtailor.com") || url.includes("nofluffjobs")) {
      throw new Error(`refused source was fetched: ${url}`)
    }
    if (url.includes("/boards/acme/jobs")) {
      return json(url, {
        jobs: [
          {
            id: 1001,
            title: "Head of Engineering",
            company_name: "Acme",
            absolute_url: "https://job-boards.greenhouse.io/acme/jobs/1001",
            location: {name: "Warsaw, Poland"},
            first_published: "2026-10-01T00:00:00.000Z",
          },
          {
            id: 1002,
            title: "Account Executive",
            company_name: "Acme",
            absolute_url: "https://job-boards.greenhouse.io/acme/jobs/1002",
            location: {name: "Warsaw, Poland"},
            first_published: "2026-10-01T00:00:00.000Z",
          },
        ],
      })
    }
    if (url.includes("/boards/newco/jobs")) {
      return json(url, {
        jobs: [
          {
            id: 42,
            title: "Director of Engineering",
            company_name: "New Co",
            absolute_url: "https://job-boards.greenhouse.io/newco/jobs/42",
            location: {name: "Kraków, Poland"},
            first_published: "2026-09-20T00:00:00.000Z",
          },
        ],
      })
    }
    if (url.includes("smartrecruiters.com")) {
      return json(url, {totalFound: 0, content: []})
    }
    return {url, status: 404, body: "missing", contentType: "text/plain"}
  },
}

function json(url: string, body: unknown) {
  return {url, status: 200, body: JSON.stringify(body), contentType: "application/json"}
}

const acme: SeedBoard = {
  provider: "GREENHOUSE",
  boardId: "acme",
  companyName: "Acme",
  careersUrl: "https://job-boards.greenhouse.io/acme",
  apiUrl: "https://boards-api.greenhouse.io/v1/boards/acme/jobs",
  openJobsAtCheck: 2,
  plLocatedJobs: 2,
  identityConfirmed: true,
  priority: 1,
}

let userId = 0

test("search flow ranks mocked ATS jobs and does not store search hits", async () => {
  const db = (await import("../db")).default
  const {executeSearch} = await import("../src/server/search/pipeline")
  const user = await db.user.create({
    data: {email: `flow-${Date.now()}@jobscanner.local`, name: "Flow", role: "ADMIN"},
  })
  userId = user.id
  const search = await db.savedSearch.create({
    data: {
      userId: user.id,
      name: "Head of Engineering",
      phrase: "Head of Engineering",
      locationHint: "Warsaw",
      workMode: "ANY",
      targetTitles: [],
      includedKeywords: [],
      excludedKeywords: [],
      seniority: [],
    },
  })
  const run = await db.searchRun.create({
    data: {savedSearchId: search.id, status: "QUEUED", phase: "queued", progress: 0, message: "Queued"},
  })
  await executeSearch(run.id, {
    http,
    llm: null,
    boards: [acme],
    now: new Date("2026-10-10T12:00:00.000Z"),
    search: async () => ({
      provider: "brave",
      hits: [
        {url: "https://job-boards.greenhouse.io/newco/jobs/42"},
        {url: "https://job-boards.greenhouse.io/wise/jobs/9"},
        {url: "https://justjoin.it/job-offers/head-of-engineering"},
        {url: "https://acme.teamtailor.com/jobs/1"},
        {url: "https://jobs.smartrecruiters.com/madeup/123"},
      ],
    }),
  })
  const finished = await db.searchRun.findUnique({where: {id: run.id}})
  assert.equal(finished?.status, "SUCCEEDED")
  const matches = await db.jobMatch.findMany({where: {searchRunId: run.id}, include: {job: true}, orderBy: {score: "desc"}})
  const titles = matches.map((match) => match.job.title)
  assert.ok(titles.includes("Head of Engineering"), `missing head role in ${titles.join(", ")}`)
  assert.ok(titles.includes("Director of Engineering"))
  assert.equal(titles.includes("Account Executive"), false)
  assert.ok(matches.every((match) => match.score >= 40))
  assert.equal(matches.every((match) => match.isNew === false), true)
  const logs = await db.searchLog.findMany({where: {searchRunId: run.id}})
  const blob = logs.map((entry) => entry.message).join("\n")
  assert.equal(blob.includes("justjoin.it"), false)
  assert.equal(blob.includes("teamtailor.com"), false)
  assert.equal(requested.some((url) => url.includes("/boards/wise")), false)
  assert.equal(requested.some((url) => url.includes("justjoin.it")), false)
  const stats = JSON.stringify(finished?.stats ?? {})
  assert.equal(stats.includes("justjoin.it/job-offers"), false)
  assert.equal(stats.includes("wise/jobs"), false)
  const discoveries = await db.discoveryRun.findMany({where: {searchRunId: run.id}})
  assert.ok(discoveries.length > 0)
  assert.equal(JSON.stringify(discoveries).includes("justjoin.it/job-offers"), false)
})

after(async () => {
  if (!userId) return
  const db = (await import("../db")).default
  await db.user.delete({where: {id: userId}}).catch(() => undefined)
  await db.$disconnect()
})
