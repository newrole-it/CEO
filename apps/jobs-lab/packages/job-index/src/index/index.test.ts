import { describe, expect, it } from "vitest"
import type { SeedBoard } from "../config/seed-boards"
import { careerListUsesCache, listCareerSite } from "@newrole/ats/adapters/career-site"
import { parseJsonLdJobs } from "@newrole/ats/adapters/jsonld"
import { UnsafeUrlError } from "@newrole/offers/url-safety"
import type { HttpClient } from "@newrole/ats/host"
import type { ListedJob } from "@newrole/ats/schemas"
import { conditionalHttp, NotModifiedError } from "@newrole/ats/conditional"
import { identityFor, unscopedIdentity } from "./store"
import { boardIsIndexable } from "./run"
import { nextCrawlAt, nextStatus } from "./schedule"

const board = (apiUrl: string): SeedBoard => ({
  provider: "CAREER_SITE",
  boardId: "example",
  companyName: "Example",
  careersUrl: apiUrl,
  apiUrl,
  openJobsAtCheck: 1,
  plLocatedJobs: 1,
  identityConfirmed: true,
  priority: 1,
})

describe("index schedule", () => {
  it("steps a missing job from active to closed, and reopens it when it returns", () => {
    expect(nextStatus("ACTIVE", false)).toBe("POSSIBLY_CLOSED")
    expect(nextStatus("POSSIBLY_CLOSED", false)).toBe("CLOSED")
    expect(nextStatus("CLOSED", false)).toBeNull()
    expect(nextStatus("POSSIBLY_CLOSED", true)).toBe("ACTIVE")
    expect(nextStatus("ACTIVE", true)).toBeNull()
  })

  it("refreshes a complete board in a day and keeps an unfinished board ahead of the queue", () => {
    const now = new Date("2026-10-10T18:00:00.000Z")
    expect(nextCrawlAt(now, true, false).toISOString()).toBe("2026-10-11T18:00:00.000Z")
    expect(nextCrawlAt(now, false, false).toISOString()).toBe("1970-01-01T00:00:00.000Z")
    expect(nextCrawlAt(now, false, true).toISOString()).toBe("2026-10-11T00:15:00.000Z")
    // An unfinished board that read nothing waits instead of holding the front of the queue.
    expect(nextCrawlAt(now, false, false, false).getTime()).toBe(now.getTime() + 6 * 3600_000)
  })

  it("keeps each Sii offer when JSON-LD names the employer as the identifier", () => {
    const html = `<script type="application/ld+json">{"@type":"JobPosting","title":"Business Analyst",
      "identifier":{"@type":"PropertyValue","name":"Sii Polska","value":"230601-EYNQW"},
      "hiringOrganization":{"name":"Sii Polska"},
      "url":"https://sii.pl/oferty-pracy/id/30518/business-analyst-f-m-x/"}</script>`
    const [job] = parseJsonLdJobs(
      html,
      "https://sii.pl/oferty-pracy/id/30518/business-analyst-f-m-x/",
      "Sii Polska",
      {
        sourceType: "CAREER_SITE",
        boardId: "sii.pl",
      }
    )
    expect(job.externalId).toBe("230601-EYNQW")
    expect(identityFor(job)).toBe("company_site:sii.pl:230601-EYNQW")
    expect(identityFor({ ...job, externalId: "Sii Polska", companyName: "Sii Polska" })).toBe(
      "url:https://sii.pl/oferty-pracy/id/30518/business-analyst-f-m-x"
    )
  })

  it("does not send a sitemap validator on robots.txt or a job page", async () => {
    const seen = new Map<string, string | undefined>()
    const { client } = conditionalHttp(
      {
        async post() {
          throw new Error("post is unused")
        },
        async get(url, opts) {
          seen.set(url, opts?.headers?.["If-None-Match"])
          return {
            url,
            status: 200,
            body: "",
            contentType: "text/plain",
            headers: { etag: url.includes("sitemap") ? "sitemap-etag" : "other-etag" },
          }
        },
      },
      { etag: "stored-etag" }
    )
    await client.get("https://careers.epam.com/robots.txt")
    await client.get("https://careers.epam.com/sitemap.xml.gz")
    await client.get("https://careers.epam.com/en/vacancy/role")
    expect(seen.get("https://careers.epam.com/robots.txt")).toBeUndefined()
    expect(seen.get("https://careers.epam.com/sitemap.xml.gz")).toBe("stored-etag")
    expect(seen.get("https://careers.epam.com/en/vacancy/role")).toBeUndefined()
  })

  it("does not treat a failed sitemap as an empty catalog", async () => {
    const listed = await listCareerSite(
      "careers.epam.com",
      {
        async post() {
          throw new Error("post is unused")
        },
        async get(url) {
          if (url.endsWith("/robots.txt")) {
            return {
              url,
              status: 200,
              body: "User-agent: *\nAllow: /\nSitemap: https://careers.epam.com/sitemap.xml.gz\n",
              contentType: "text/plain",
            }
          }
          if (url.includes("sitemap")) throw new UnsafeUrlError("Redirect missing location")
          return { url, status: 404, body: "", contentType: "text/plain" }
        },
      },
      "EPAM",
      { detailBudget: 5, knownUrls: new Set() }
    )
    expect(listed.proven).toBe(false)
    expect(listed.complete).toBe(false)
    expect(listed.jobs).toEqual([])
    expect(listed.note).toMatch(/Redirect missing location/)
  })

  it("does not serve a stored listing when the indexer is backfilling", () => {
    expect(careerListUsesCache(undefined)).toBe(true)
    expect(careerListUsesCache({})).toBe(true)
    expect(careerListUsesCache({ detailBudget: 30 })).toBe(false)
    expect(careerListUsesCache({ knownUrls: new Set() })).toBe(false)
  })

  it("indexes allowed hosts and skips link-only hosts", () => {
    expect(boardIsIndexable(board("https://boards-api.greenhouse.io/v1/boards/acme/jobs"))).toBe(
      true
    )
    expect(boardIsIndexable(board("https://jobs.sap.com/search"))).toBe(false)
    expect(boardIsIndexable(board("https://sii.pl/sitemap.xml"))).toBe(true)
  })
})

type Reply = { status: number; body?: string; headers?: Record<string, string> } | Error

/** Fake HTTP: every request goes to `route`; an Error reply is thrown like a network failure. */
function fakeHttp(route: (url: string, headers?: Record<string, string>) => Reply) {
  const calls: Array<{ url: string; headers?: Record<string, string> }> = []
  const http: HttpClient = {
    async post() {
      throw new Error("post is unused")
    },
    async get(url, opts) {
      calls.push({ url, headers: opts?.headers })
      const reply = route(url, opts?.headers)
      if (reply instanceof Error) throw reply
      return {
        url,
        status: reply.status,
        body: reply.body ?? "",
        contentType: "text/xml",
        headers: reply.headers,
      }
    },
  }
  return { http, calls }
}

const ZABKA = "https://careers.zabkagroup.com"
const zabkaJob = (slug: string) => `${ZABKA}/oferta-pracy/${slug}`
const urlset = (urls: string[]) =>
  `<?xml version="1.0"?><urlset>${urls
    .map((url) => `<url><loc>${url}</loc></url>`)
    .join("")}</urlset>`
const sitemapIndex = (children: string[]) =>
  `<?xml version="1.0"?><sitemapindex>${children
    .map((child) => `<sitemap><loc>${child}</loc></sitemap>`)
    .join("")}</sitemapindex>`

function zabkaSite(sitemap: (url: string, headers?: Record<string, string>) => Reply | undefined) {
  return fakeHttp((url, headers) => {
    if (url.endsWith("/robots.txt")) return { status: 200, body: "User-agent: *\nAllow: /\n" }
    return sitemap(url, headers) ?? { status: 404 }
  })
}

const listZabka = (http: HttpClient, known: string[] = []) =>
  listCareerSite("careers.zabkagroup.com", http, "Żabka Group", {
    detailBudget: 5,
    knownUrls: new Set(known),
  })

describe("career sitemaps never close a board on a partial read", () => {
  it("does not read a 503 or a reset connection as an empty catalog", async () => {
    for (const failure of [{ status: 503 }, new Error("read ECONNRESET")] as Reply[]) {
      const { http } = zabkaSite((url) =>
        url.endsWith("/sitemap_index.xml") ? failure : undefined
      )
      const listed = await listZabka(http)
      expect(listed.complete).toBe(false)
      expect(listed.proven).toBe(false)
      expect(listed.note).toMatch(/sitemap_index\.xml/)
    }
  })

  it("keeps the board open when one child sitemap fails", async () => {
    const live = zabkaJob("kasjer-warszawa")
    const { http } = zabkaSite((url) => {
      if (url.endsWith("/sitemap_index.xml")) {
        return { status: 200, body: sitemapIndex([`${ZABKA}/job-a.xml`, `${ZABKA}/job-b.xml`]) }
      }
      if (url.endsWith("/job-a.xml")) return { status: 200, body: urlset([live]) }
      if (url.endsWith("/job-b.xml")) return { status: 500 }
      return undefined
    })
    const listed = await listZabka(http, [live])
    expect(listed.proven).toBe(true)
    expect(listed.listedCount).toBe(1)
    expect(listed.complete).toBe(false)
    expect(listed.coveredUrls).toBeUndefined()
    expect(listed.note).toMatch(/job-b\.xml returned 500/)
  })

  it("passes a 304 on the board's sitemap up as not modified", async () => {
    const { http } = zabkaSite((url, headers) =>
      url.endsWith("/sitemap_index.xml") && headers?.["If-None-Match"] === '"v1"'
        ? { status: 304, headers: { etag: '"v1"' } }
        : undefined
    )
    const { client } = conditionalHttp(http, { etag: '"v1"' })
    await expect(listZabka(client)).rejects.toBeInstanceOf(NotModifiedError)
  })

  it("sends validators with the board's first answered request only", async () => {
    const live = zabkaJob("kasjer-warszawa")
    const { http, calls } = zabkaSite((url) => {
      if (url.endsWith("/sitemap_index.xml")) {
        return {
          status: 200,
          body: sitemapIndex([`${ZABKA}/job-a.xml`]),
          headers: { etag: '"v2"' },
        }
      }
      if (url.endsWith("/job-a.xml")) return { status: 200, body: urlset([live]) }
      return undefined
    })
    const wrapped = conditionalHttp(http, { etag: '"v1"' })
    const listed = await listZabka(wrapped.client, [live])
    const sent = (path: string) =>
      calls.find((call) => call.url.endsWith(path))?.headers?.["If-None-Match"]
    // The feed probe 404s, so the sitemap index is the board's answer.
    expect(sent("/jobs.feed.json")).toBe('"v1"')
    expect(sent("/sitemap_index.xml")).toBe('"v1"')
    expect(sent("/job-a.xml")).toBeUndefined()
    expect(wrapped.state.etag).toBe('"v2"')
    expect(listed.complete).toBe(true)
  })

  it("reads every sitemap when only one of several is unchanged", async () => {
    const live = zabkaJob("kasjer-warszawa")
    const { http } = fakeHttp((url, headers) => {
      if (url.endsWith("/robots.txt")) {
        return { status: 200, body: `User-agent: *\nAllow: /\nSitemap: ${ZABKA}/jobs.xml\n` }
      }
      if (url.endsWith("/jobs.xml")) {
        return headers?.["If-None-Match"] ? { status: 304 } : { status: 200, body: urlset([live]) }
      }
      if (url.endsWith("/sitemap_index.xml")) return { status: 200, body: urlset([]) }
      return { status: 404 }
    })
    const listed = await listZabka(conditionalHttp(http, { etag: '"v1"' }).client, [live])
    expect(listed.listedCount).toBe(1)
    expect(listed.complete).toBe(true)
  })
})

describe("career listings", () => {
  it("keeps every listed link when a detail page is refused", async () => {
    const ids = ["aaaaaaaa-0001", "bbbbbbbb-0002", "cccccccc-0003"]
    const listing = ids
      .map((id, index) => `<a href="/en/careers/positions/${id}">Engineer ${index + 1}</a>`)
      .join("")
    const { http } = fakeHttp((url) => {
      if (url.endsWith("/robots.txt")) return { status: 200, body: "User-agent: *\nAllow: /\n" }
      if (url === "https://bolt.eu/en/careers/positions/") return { status: 200, body: listing }
      if (url.endsWith(ids[0])) return { status: 200, body: "<title>Engineer 1 | Bolt</title>" }
      if (url.endsWith(ids[1])) return new UnsafeUrlError("Too many redirects")
      return { status: 404 }
    })
    const listed = await listCareerSite("bolt.eu", http, "Bolt", { detailBudget: 5 })
    expect(listed.jobs.map((job) => job.title)).toEqual(["Engineer 1", "Engineer 2", "Engineer 3"])
    expect(listed.complete).toBe(true)
    expect(listed.note).toMatch(/Detail pages stopped: Too many redirects/)
  })

  it("never counts a search-mode listing as the whole inventory", async () => {
    const { http } = fakeHttp((url) =>
      url.endsWith("/robots.txt")
        ? { status: 200, body: "User-agent: *\nAllow: /\n" }
        : { status: 200, body: "<html></html>" }
    )
    const listed = await listCareerSite("www.synerise.com", http, "Synerise", { detailBudget: 5 })
    expect(listed.proven).toBe(true)
    expect(listed.complete).toBe(false)
  })
})

describe("tenant-local ids", () => {
  const traffit = (boardId: string, externalId: string): ListedJob => ({
    title: "Backend Developer",
    companyName: boardId,
    originalUrl: `https://${boardId}.traffit.com/public/an/${externalId}`,
    sourceType: "TRAFFIT",
    sourceBoardId: boardId,
    externalId,
    workplaceType: "REMOTE",
    needsHydration: false,
  })

  it("keeps two employers' job 106 apart", () => {
    expect(identityFor(traffit("tutlo", "106"))).toBe("company_site:tutlo:106")
    expect(identityFor(traffit("zen", "106"))).toBe("company_site:zen:106")
    // The search pipeline stores ids already scoped by board; both paths meet on one key.
    expect(identityFor(traffit("tutlo", "tutlo:106"))).toBe("company_site:tutlo:106")
  })

  it("knows the key a row had before scoping", () => {
    expect(unscopedIdentity("company_site:tutlo:106", "Tutlo")).toBe("company_site:106")
    expect(unscopedIdentity("greenhouse:77", "acme")).toBeNull()
    expect(unscopedIdentity("company_site:106", null)).toBeNull()
  })
})
