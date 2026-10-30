import { describe, expect, it } from "vitest"
import type { HttpClient, HttpResponse } from "src/server/security/safe-fetch"
import { boardAgrees, normalizeInputUrl, rankSearchHits, resolveName, resolveUrl } from "./resolve"

type Routes = Record<string, { status?: number; body: string; contentType?: string }>

function mockHttp(routes: Routes): HttpClient & { calls: string[] } {
  const calls: string[] = []
  const get = async (url: string): Promise<HttpResponse> => {
    calls.push(url)
    const route = routes[url]
    if (!route) return { url, status: 404, body: "", contentType: "text/plain" }
    return { url, status: route.status ?? 200, body: route.body, contentType: route.contentType ?? "text/html" }
  }
  return {
    calls,
    get,
    post: async (url: string) => {
      calls.push(`POST ${url}`)
      return { url, status: 404, body: "", contentType: "" }
    },
  }
}

const greenhouseJobs = JSON.stringify({
  jobs: [
    {
      id: 101,
      title: "Senior Backend Engineer",
      company_name: "Acme Software",
      absolute_url: "https://job-boards.greenhouse.io/acmesoftware/jobs/101",
      location: { name: "Warsaw, Poland" },
      content: "<p>Kotlin and Kafka</p>",
      updated_at: "2026-10-01T00:00:00Z",
    },
  ],
})

const noSlots = { takeSlot: async () => true }

describe("resolveUrl", () => {
  it("follows the careers link to an embedded Greenhouse board and validates it", async () => {
    const http = mockHttp({
      "https://acme.pl/": {
        body: `<title>Acme Software</title><a href="/kariera">Kariera</a>`,
      },
      "https://acme.pl/kariera": {
        body: `<div id="grnhse_app"></div><script src="https://boards.greenhouse.io/embed/job_board/js?for=acmesoftware"></script>`,
      },
      "https://boards-api.greenhouse.io/v1/boards/acmesoftware/jobs": {
        body: greenhouseJobs,
        contentType: "application/json",
      },
    })
    const result = await resolveUrl("acme.pl", { http, ...noSlots })
    expect(result).toMatchObject({
      kind: "ats",
      provider: "GREENHOUSE",
      boardId: "acmesoftware",
      companyName: "Acme Software",
      domain: "acme.pl",
      openJobs: 1,
    })
    expect(http.calls).toContain("https://acme.pl/robots.txt")
  })

  it("respects robots.txt and keeps a disallowed careers page as a link", async () => {
    const http = mockHttp({
      "https://acme.pl/robots.txt": { body: "User-agent: *\nDisallow: /kariera", contentType: "text/plain" },
      "https://acme.pl/": { body: `<a href="/kariera">Kariera</a>` },
      "https://acme.pl/kariera": { body: "should not be read" },
    })
    const result = await resolveUrl("https://acme.pl/", { http, ...noSlots })
    expect(http.calls).not.toContain("https://acme.pl/kariera")
    expect(result.kind).toBe("link-only")
    if (result.kind === "link-only") expect(result.reason).toContain("robots.txt")
  })

  it("registers a career site when job pages carry JSON-LD JobPosting", async () => {
    const posting = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Frontend Developer",
      hiringOrganization: { name: "Acme" },
      url: "https://acme.pl/kariera/frontend-developer",
      description: "React",
    }
    const http = mockHttp({
      "https://acme.pl/": { body: `<a href="/kariera">Praca</a>` },
      "https://acme.pl/kariera": {
        body: `<h1>Oferty</h1><a href="/kariera/frontend-developer">Frontend Developer</a>`,
      },
      "https://acme.pl/kariera/frontend-developer": {
        body: `<script type="application/ld+json">${JSON.stringify(posting)}</script>`,
      },
    })
    const result = await resolveUrl("https://acme.pl/", { http, ...noSlots })
    expect(result.kind).toBe("career-site")
    if (result.kind === "career-site") {
      expect(result.careersUrl).toBe("https://acme.pl/kariera")
      expect(result.jobs[0]?.title).toBe("Frontend Developer")
    }
  })

  it("does not trust an empty ATS feed when the site lists offers, and reads each page once", async () => {
    const http = mockHttp({
      "https://momentum.pl/": { body: `<a href="/careers">Careers</a>` },
      "https://momentum.pl/careers": {
        body: `<a href="https://applover.traffit.com/public/form/a/1">Send CV</a>
          <a href="/careers/senior-ror-dev">Senior RoR</a><a href="/careers">Careers</a>`,
      },
      "https://momentum.pl/careers/senior-ror-dev": {
        body: `<a href="/careers">Back</a><a href="https://applover.traffit.com/public/form/a/2">Apply</a>`,
      },
      "https://applover.traffit.com/public/job_posts/published": {
        body: "[]",
        contentType: "application/json",
      },
    })
    const result = await resolveUrl("https://momentum.pl/", { http, ...noSlots })
    expect(result.kind).toBe("link-only")
    if (result.kind === "link-only") expect(result.careersUrl).toBe("https://momentum.pl/careers")
    const counts = (url: string) => http.calls.filter((call) => call === url).length
    expect(counts("https://momentum.pl/careers")).toBe(1)
    expect(counts("https://applover.traffit.com/public/job_posts/published")).toBe(1)
  })

  it("never fetches LinkedIn or Polish job boards", async () => {
    const http = mockHttp({})
    const linkedin = await resolveUrl("https://www.linkedin.com/company/acme", { http })
    const board = await resolveUrl("https://justjoin.it/job-offer/acme-java", { http })
    expect(linkedin.kind).toBe("not-found")
    expect(board.kind).toBe("not-found")
    expect(http.calls).toEqual([])
  })

  it("validates a direct ATS URL with the adapter", async () => {
    const http = mockHttp({
      "https://boards-api.greenhouse.io/v1/boards/acmesoftware/jobs": {
        body: greenhouseJobs,
        contentType: "application/json",
      },
    })
    const result = await resolveUrl("https://job-boards.greenhouse.io/acmesoftware", { http })
    expect(result).toMatchObject({ kind: "ats", provider: "GREENHOUSE", openJobs: 1 })
  })
})

describe("resolveName", () => {
  it("explains what to paste when no search provider exists", async () => {
    const result = await resolveName("Acme Software", { http: mockHttp({}) })
    expect(result.kind).toBe("not-found")
    if (result.kind === "not-found") expect(result.message).toMatch(/website|careers page/i)
  })

  it("uses search hits that agree with the name", async () => {
    const http = mockHttp({
      "https://boards-api.greenhouse.io/v1/boards/acmesoftware/jobs": {
        body: greenhouseJobs,
        contentType: "application/json",
      },
    })
    const result = await resolveName("Acme Software", {
      http,
      search: async () => ({
        provider: "claude",
        hits: [
          { url: "https://www.linkedin.com/company/acme" },
          { url: "https://job-boards.greenhouse.io/othercorp" },
          { url: "https://job-boards.greenhouse.io/acmesoftware" },
        ],
      }),
    })
    expect(result).toMatchObject({ kind: "ats", boardId: "acmesoftware" })
  })
})

describe("helpers", () => {
  it("normalizes input and checks board identity", () => {
    expect(normalizeInputUrl("acme.pl/kariera")).toBe("https://acme.pl/kariera")
    expect(normalizeInputUrl("not a url")).toBeNull()
    expect(normalizeInputUrl("javascript:alert(1)")).toBeNull()
    expect(boardAgrees({ boardId: "acmesoftware" }, { name: "Acme Software" })).toBe(true)
    expect(boardAgrees({ boardId: "othercorp" }, { name: "Acme Software", domain: "acme.pl" })).toBe(false)
    expect(boardAgrees({ boardId: "acme" }, { name: null, domain: "acme.pl" })).toBe(true)
    expect(
      rankSearchHits("Acme", [
        { url: "https://nofluffjobs.com/acme" },
        { url: "https://news.example.com/acme" },
        { url: "https://acme.pl/kariera" },
      ])
    ).toEqual(["https://acme.pl/kariera"])
  })
})
