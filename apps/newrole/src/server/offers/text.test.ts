import { describe, expect, it } from "vitest"
import { parseJsonLdJobs } from "@newrole/ats/adapters/jsonld"
import { EXCERPT_CHARS } from "@newrole/offers/hygiene"
import type { HttpClient, HttpResponse } from "src/server/security/safe-fetch"
import {
  indexedOfferText,
  OFFER_TEXT_LIMIT,
  pageText,
  readOfferText,
  toOfferSource,
  type OfferSource,
} from "./text"

const LONG = `${"Budujemy platformę płatności dla dużych zespołów. ".repeat(
  12
)}Wymagamy: Go, Kubernetes.`
const STORED = "Fragment z indeksu."

let counter = 0

function source(fields: Partial<OfferSource> = {}): OfferSource {
  counter += 1
  return {
    id: `offer-${counter}`,
    title: "Staff Engineer",
    company: "Acme",
    originalUrl: "https://boards.greenhouse.io/acme/jobs/7",
    sourceType: "GREENHOUSE",
    sourceBoardId: "acme",
    externalId: "7",
    llmOptOut: false,
    stored: STORED,
    ...fields,
  }
}

function fakeHttp(answer: (url: string) => Partial<HttpResponse> | Error) {
  const urls: string[] = []
  const http: HttpClient = {
    get: async (url) => {
      urls.push(url)
      const reply = answer(url)
      if (reply instanceof Error) throw reply
      return { url, status: 200, body: "", contentType: "text/html", ...reply }
    },
    post: async () => {
      throw new Error("Reading an offer never posts")
    },
  }
  return { http, urls }
}

function greenhouse(content: string) {
  return JSON.stringify({
    id: 7,
    title: "Staff Engineer",
    absolute_url: "https://boards.greenhouse.io/acme/jobs/7",
    company_name: "Acme",
    content,
  })
}

function careerPage(description: string, head = "") {
  const posting = { "@type": "JobPosting", title: "Staff Engineer", description }
  return `<html><head>${head}<script type="application/ld+json">${JSON.stringify(
    posting
  )}</script></head></html>`
}

function careerHttp(page: string, robots = "User-agent: *\nAllow: /") {
  return fakeHttp((url) => (url.endsWith("/robots.txt") ? { body: robots } : { body: page }))
}

const CAREER = {
  sourceType: "CAREER_SITE",
  sourceBoardId: null,
  externalId: null,
  originalUrl: "https://careers.acme.example/jobs/7",
} as const

describe("readOfferText", () => {
  it("reads the whole offer from a detail API, far past what the index keeps", async () => {
    const { http, urls } = fakeHttp(() => ({ body: greenhouse(`&lt;p&gt;${LONG}&lt;/p&gt;`) }))

    const read = await readOfferText(source(), http)

    expect(read.origin).toBe("full")
    expect(read.text.length).toBeGreaterThan(EXCERPT_CHARS)
    expect(read.text).toContain("Wymagamy: Go, Kubernetes.")
    expect(read.text).not.toContain("<p>")
    expect(urls).toEqual([expect.stringContaining("/boards/acme/jobs/7")])
  })

  it("finds the offer in a feed that lists every description", async () => {
    const postings = [
      {
        id: "other",
        text: "Other",
        hostedUrl: "https://jobs.lever.co/acme/other",
        descriptionPlain: "Inna oferta",
      },
      {
        id: "7",
        text: "Staff Engineer",
        hostedUrl: "https://jobs.lever.co/acme/7",
        descriptionPlain: LONG,
      },
    ]
    const { http } = fakeHttp(() => ({ body: JSON.stringify(postings) }))

    const read = await readOfferText(
      source({ sourceType: "LEVER", originalUrl: "https://jobs.lever.co/acme/7" }),
      http
    )

    expect(read.origin).toBe("full")
    expect(read.text).toContain("Wymagamy: Go, Kubernetes.")
    expect(read.text).not.toContain("Inna oferta")
  })

  it("reads a company page in full, while the parser the index uses keeps its limit", async () => {
    const page = careerPage(`<p>${LONG}</p>`)
    const { http } = careerHttp(page)

    const read = await readOfferText(source(CAREER), http)

    expect(read.origin).toBe("full")
    expect(read.text).toContain("Wymagamy: Go, Kubernetes.")
    const indexed = parseJsonLdJobs(page, CAREER.originalUrl)[0]
    expect(indexed.descriptionText?.length).toBeLessThanOrEqual(EXCERPT_CHARS)
  })

  it("reads the main text of a company page that has no structured data", async () => {
    const page = `<html><body><nav>Kariera · Blog · Kontakt</nav><main><h1>Staff Engineer</h1><p>${LONG}</p></main><footer>© Acme</footer></body></html>`
    const { http } = careerHttp(page)

    const read = await readOfferText(source(CAREER), http)

    expect(read.origin).toBe("full")
    expect(read.text).toContain("Wymagamy: Go, Kubernetes.")
    expect(read.text).not.toContain("Blog")
    expect(read.text).not.toContain("© Acme")
  })

  it("keeps the excerpt when a page without structured data holds almost no text", async () => {
    const { http } = careerHttp("<html><body><main>Ładowanie…</main></body></html>")

    expect(await readOfferText(source(CAREER), http)).toEqual({ text: STORED, origin: "excerpt" })
    expect(pageText("<main>Ładowanie…</main>")).toBe("")
  })

  it("drops contact details and stops at the limit", async () => {
    const body = `Napisz do jan.kowalski@acme.example albo zadzwoń +48 600 700 800. ${"x".repeat(
      OFFER_TEXT_LIMIT * 2
    )}`
    const { http } = fakeHttp(() => ({ body: greenhouse(body) }))

    const read = await readOfferText(source(), http)

    expect(read.text).not.toContain("jan.kowalski@acme.example")
    expect(read.text).not.toContain("600 700 800")
    expect(read.text.length).toBe(OFFER_TEXT_LIMIT)
  })

  it("asks nothing and returns nothing for an offer that opted out of AI", async () => {
    const { http, urls } = fakeHttp(() => ({ body: greenhouse(LONG) }))

    const read = await readOfferText(source({ llmOptOut: true }), http)

    expect(read).toEqual({ text: "", origin: "withheld" })
    expect(urls).toEqual([])
  })

  it("respects an opt-out that appeared on the page since it was indexed", async () => {
    const { http } = careerHttp(careerPage(LONG, '<meta name="robots" content="ai-input=no">'))

    const read = await readOfferText(source(CAREER), http)

    expect(read).toEqual({ text: "", origin: "withheld" })
  })

  it("does not read a page that robots.txt disallows", async () => {
    const { http, urls } = careerHttp(careerPage(LONG), "User-agent: *\nDisallow: /jobs/")

    const read = await readOfferText(source(CAREER), http)

    expect(read).toEqual({ text: STORED, origin: "excerpt" })
    expect(urls).toEqual(["https://careers.acme.example/robots.txt"])
  })

  it.each([
    ["a site where only the listing may be read", "https://kariera.wp.pl/oferta/7"],
    ["a Polish job board", "https://justjoin.it/job-offer/7"],
    ["LinkedIn", "https://www.linkedin.com/jobs/view/7"],
  ])("sends no request to %s", async (_label, originalUrl) => {
    const { http, urls } = fakeHttp(() => ({ body: careerPage(LONG) }))

    const read = await readOfferText(
      source({ sourceType: "WEB_SEARCH", sourceBoardId: null, externalId: null, originalUrl }),
      http
    )

    expect(read).toEqual({ text: STORED, origin: "excerpt" })
    expect(urls).toEqual([])
  })

  it.each([
    ["a network failure", new Error("socket hang up")],
    ["an offer that is gone", { status: 404, body: "{}" }],
    ["a reply without text", { body: greenhouse("") }],
  ])("falls back to the excerpt after %s", async (_label, reply) => {
    const { http } = fakeHttp(() => reply)

    expect(await readOfferText(source(), http)).toEqual({ text: STORED, origin: "excerpt" })
  })

  it("says so when there is neither a live text nor an excerpt", async () => {
    const { http } = fakeHttp(() => new Error("socket hang up"))

    expect(await readOfferText(source({ stored: "" }), http)).toEqual({ text: "", origin: "none" })
  })

  it("reads one offer once, even when two requests ask at the same time", async () => {
    const { http, urls } = fakeHttp(() => ({ body: greenhouse(LONG) }))
    const offer = source()

    const [first, second] = await Promise.all([
      readOfferText(offer, http),
      readOfferText(offer, http),
    ])
    const third = await readOfferText(offer, http)

    expect(first).toEqual(second)
    expect(third).toEqual(first)
    expect(urls).toHaveLength(1)
  })
})

describe("toOfferSource", () => {
  const row = {
    id: "job",
    title: "Staff Engineer",
    summary: "",
    descriptionText: "",
    originalUrl: "https://example.com/7",
    sourceType: "GREENHOUSE",
    sourceBoardId: "acme",
    externalId: "7",
    llmOptOut: false,
    company: { name: "Acme" },
  }

  it("does not count a title copied into the summary as the offer's text", () => {
    const offer = toOfferSource({ ...row, summary: "Staff Engineer" })

    expect(offer.stored).toBe("")
    expect(indexedOfferText(offer)).toEqual({ text: "", origin: "none" })
  })

  it("prefers the description and falls back to a real summary", () => {
    expect(toOfferSource({ ...row, descriptionText: "Opis", summary: "Skrót" }).stored).toBe("Opis")
    expect(toOfferSource({ ...row, summary: "Skrót oferty" }).stored).toBe("Skrót oferty")
  })

  it("marks an opted-out offer as withheld without touching the network", () => {
    expect(
      indexedOfferText(toOfferSource({ ...row, descriptionText: "Opis", llmOptOut: true }))
    ).toEqual({
      text: "",
      origin: "withheld",
    })
  })
})
