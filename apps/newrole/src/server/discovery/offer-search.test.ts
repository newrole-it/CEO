import { describe, expect, it } from "vitest"
import type { HttpClient } from "src/server/security/safe-fetch"
import {
  hitsFromBravePayload,
  hitsFromSerperPayload,
  searchProvider,
  searchWeb,
} from "./web-search"
import { formatMonthlyPln, offerPayFields } from "src/server/jobs/offer-facts"
import {
  choosePay,
  companiesMatch,
  fetchedOfferAccepted,
  figureFromText,
  keepExternalPay,
  offerQuery,
  pickFocus,
  planOfferHits,
  salaryTag,
  storageMode,
  titlesEquivalent,
  type KnownOffer,
  type PayFigure,
} from "./offer-search"

const booksyDoe: KnownOffer = {
  id: "booksy-doe",
  company: "Booksy",
  title: "Director of Engineering",
  canonicalUrl: "https://careers.booksy.com/jobs/director-of-engineering.3774",
  salaryMin: null,
  salaryMax: null,
}

const booksyManager: KnownOffer = {
  id: "booksy-em",
  company: "Booksy",
  title: "Engineering Manager",
  canonicalUrl: "https://apply.workable.com/booksy-1/j/EM123",
  salaryMin: null,
  salaryMax: null,
}

const booksDoe: KnownOffer = {
  id: "books-doe",
  company: "Books",
  title: "Director of Engineering",
  canonicalUrl: "https://careers.books.example/jobs/director",
  salaryMin: null,
  salaryMax: null,
}

describe("offer search", () => {
  it("merges Booksy Director of Engineering pay from the listing that states it", () => {
    const plan = planOfferHits(
      [
        {
          url: "https://careers.booksy.com/jobs/director-of-engineering.3774",
          title: "Director of Engineering",
          snippet: "Booksy is hiring a Director of Engineering. Location United Kingdom.",
        },
        {
          url: "https://posada24.pl/director-of_katowice-c378126/2026-10-booksy_i4245854112",
          title: "Director of Engineering: AI & Growth Leader - Booksy",
          snippet:
            "Booksy Katowice, Śląskie, PL. 480,000 - 720,000 zł. Rodzaj wynagrodzenia Przez rok. Opublikowany 2026-10-15.",
        },
        {
          url: "https://posada24.pl/engineering-director_katowice-c378126/2026-09-booksy_i4216331977",
          title: "Engineering Director: AI-driven Growth - Booksy",
          snippet:
            "Aplikacje na to stanowisko są chwilowo wstrzymane. 600,000 - 900,000 zł rocznie.",
        },
        {
          url: "https://justjoin.it/job-offer/booksy-engineering-manager-warszawa",
          title: "Engineering Manager - Booksy",
          snippet: "Warszawa, hybrid. 18 000 - 24 000 PLN.",
        },
        {
          url: "https://nofluffjobs.com/pl/job/director-of-engineering-books-warsaw",
          title: "Director of Engineering - Books",
          snippet: "Warsaw. 22 000 - 30 000 PLN.",
        },
      ],
      [booksyDoe, booksyManager, booksDoe],
      { company: "Booksy", title: "Director of Engineering" }
    )

    expect(plan.create).toEqual([])
    const doe = plan.enrich.find((item) => item.id === "booksy-doe")
    const manager = plan.enrich.find((item) => item.id === "booksy-em")
    const books = plan.enrich.find((item) => item.id === "books-doe")
    expect(doe?.pay).toMatchObject({
      min: 480_000,
      max: 720_000,
      currency: "PLN",
      period: "year",
      sourceUrl: "https://posada24.pl/director-of_katowice-c378126/2026-10-booksy_i4245854112",
    })
    expect(doe?.pay.raw).toContain("480,000")
    expect(doe?.pay.raw).not.toContain("900,000")
    const shown = offerPayFields(
      {
        salaryMin: doe!.pay.min,
        salaryMax: doe!.pay.max,
        salaryCurrency: salaryTag(doe!.pay.currency, doe!.pay.period),
        salarySourceUrl: doe!.pay.sourceUrl,
      },
      "pl"
    )
    expect(shown.monthly).toMatchObject({
      listed: true,
      converted: true,
      min: 40_000,
      max: 60_000,
      period: "year",
    })
    expect(shown.card).toMatchObject({
      payMin: 40_000,
      payMax: 60_000,
      payFromOther: true,
      payNote: "year",
      paySourceUrl: doe!.pay.sourceUrl,
      payLabel: formatMonthlyPln(40_000, 60_000, "pl"),
    })
    expect(manager?.pay).toMatchObject({
      min: 18_000,
      max: 24_000,
      currency: "PLN",
      period: "month",
    })
    expect(books?.pay).toMatchObject({ min: 22_000, max: 30_000 })
    expect(books?.pay.sourceUrl).toContain("nofluffjobs.com")
  })

  it("does not merge a different role or a different company", () => {
    expect(titlesEquivalent("Director of Engineering", "Engineering Manager", "Booksy")).toBe(false)
    expect(titlesEquivalent("Director of Engineering", "Director of Product", "Booksy")).toBe(false)
    expect(
      titlesEquivalent("Director of Engineering", "Senior Director of Engineering", "Booksy")
    ).toBe(false)
    expect(
      titlesEquivalent(
        "Director of Engineering",
        "Director of Engineering: AI & Growth Leader",
        "Booksy"
      )
    ).toBe(true)
    expect(titlesEquivalent("VP of Engineering", "Vice President of Engineering")).toBe(true)
    expect(companiesMatch("Booksy", "Books")).toBe(false)
    expect(companiesMatch("Booksy", "Booksy Media")).toBe(false)
    expect(companiesMatch("Booksy", "Booksy Inc")).toBe(true)
  })

  it("does not treat up to, estimates, or a failed fetch as a salary", () => {
    expect(
      figureFromText("Booksy Director of Engineering, do 40 000 zł", "https://example.com/job", 1)
    ).toBeNull()
    expect(
      figureFromText(
        "Estimated salary $189,694 per year at Booksy",
        "https://comparably.com/booksy",
        1
      )
    ).toBeNull()
    expect(fetchedOfferAccepted(404, 1)).toBe(false)
    expect(fetchedOfferAccepted(200, 0)).toBe(false)
    expect(fetchedOfferAccepted(200, 1)).toBe(true)
  })

  it("keeps one explicit figure when two amounts do not overlap, and the shared band when they do", () => {
    const low = figure("20 000 - 25 000 PLN", "https://board.example/a", 1)
    const high = figure("40 000 - 50 000 PLN", "https://board.example/b", 1)
    const chosen = choosePay([low, high])
    expect(chosen).toMatchObject({ min: 20_000, max: 25_000 })
    expect((chosen!.min + chosen!.max) / 2).not.toBe(35_000)

    const left = figure("25 000 - 32 000 PLN", "https://board.example/c", 1)
    const right = figure("28 000 - 35 000 PLN", "https://board.example/d", 1)
    expect(choosePay([left, right])).toMatchObject({ min: 28_000, max: 32_000 })

    const employer = figure(
      "30 000 - 40 000 PLN",
      "https://careers.booksy.com/jobs/director-of-engineering.3774",
      3
    )
    const board = figure("18 000 - 24 000 PLN", "https://justjoin.it/job-offer/booksy-director", 2)
    expect(choosePay([board, employer])).toMatchObject({ min: 30_000, max: 40_000, rank: 3 })
  })

  it("dedupes a new board offer by company and title, and by canonical URL", () => {
    const plan = planOfferHits(
      [
        {
          url: "https://justjoin.it/job-offer/acme-staff-engineer-krakow/",
          title: "Staff Engineer - Acme",
          snippet: "Kraków, remote. Requirements: Go, Kubernetes. 22 000 - 28 000 PLN.",
        },
        {
          url: "https://justjoin.it/job-offer/acme-staff-engineer-krakow",
          title: "Staff Engineer at Acme",
          snippet: "Same offer again. 22 000 - 28 000 PLN.",
        },
        {
          url: "https://nofluffjobs.com/pl/job/staff-engineer-acme-krakow",
          title: "Staff Engineer - Acme",
          snippet: "Kraków. 22 000 - 28 000 PLN.",
        },
      ],
      []
    )
    expect(plan.enrich).toEqual([])
    expect(plan.create).toHaveLength(1)
    expect(plan.create[0]).toMatchObject({
      company: "Acme",
      mode: "snippet",
      locationText: "Kraków, PL",
      workplaceType: "REMOTE",
    })
    expect(plan.create[0]?.pay).toMatchObject({ min: 22_000, max: 28_000, currency: "PLN" })
    expect(plan.create[0]?.canonicalUrl).toBe(
      "https://justjoin.it/job-offer/acme-staff-engineer-krakow"
    )
  })

  it("does not open a second card when the role is already indexed", () => {
    const plan = planOfferHits(
      [
        {
          url: "https://nofluffjobs.com/pl/job/director-of-engineering-booksy",
          title: "Director of Engineering - Booksy",
          snippet: "28 000 - 35 000 PLN.",
        },
      ],
      [booksyDoe]
    )
    expect(plan.create).toEqual([])
    expect(plan.enrich).toHaveLength(1)
    expect(plan.enrich[0]?.id).toBe("booksy-doe")
  })

  it("does not call the network when no search key is set", async () => {
    const previous = {
      brave: process.env.BRAVE_SEARCH_API_KEY,
      serper: process.env.SERPER_API_KEY,
    }
    const restore = (
      name: "BRAVE_SEARCH_API_KEY" | "SERPER_API_KEY",
      value: string | undefined
    ) => {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    const fetchImpl = globalThis.fetch
    let called = false
    globalThis.fetch = (() => {
      called = true
      throw new Error("search network was called")
    }) as typeof fetch
    try {
      delete process.env.BRAVE_SEARCH_API_KEY
      delete process.env.SERPER_API_KEY
      expect(searchProvider()).toEqual({ configured: false, provider: "none" })
      process.env.BRAVE_SEARCH_API_KEY = "   "
      process.env.SERPER_API_KEY = ""
      expect(searchProvider()).toEqual({ configured: false, provider: "none" })
      const http = {
        get: async () => {
          throw new Error("http")
        },
      } as unknown as HttpClient
      const result = await searchWeb("Director of Engineering Booksy", http)
      expect(result).toEqual({ provider: "none", hits: [] })
      expect(called).toBe(false)
      process.env.BRAVE_SEARCH_API_KEY = "present"
      const configured = searchProvider()
      expect(configured).toEqual({ configured: true, provider: "brave" })
      expect(JSON.stringify(configured)).not.toContain("present")
    } finally {
      globalThis.fetch = fetchImpl
      restore("BRAVE_SEARCH_API_KEY", previous.brave)
      restore("SERPER_API_KEY", previous.serper)
    }
  })

  it("parses search payloads and drops rows without a URL", () => {
    const brave = hitsFromBravePayload({
      web: {
        results: [
          {
            url: "https://justjoin.it/job-offer/a",
            title: "Staff Engineer - Acme",
            description: "22 000 PLN",
          },
          { title: "missing url", description: "no" },
          { url: "https://nofluffjobs.com/pl/job/b", title: "B", description: "text" },
        ],
      },
    })
    expect(brave).toEqual([
      {
        url: "https://justjoin.it/job-offer/a",
        title: "Staff Engineer - Acme",
        snippet: "22 000 PLN",
      },
      { url: "https://nofluffjobs.com/pl/job/b", title: "B", snippet: "text" },
    ])
    expect(
      hitsFromSerperPayload({
        organic: [
          {
            link: "https://bulldogjob.pl/companies/jobs/1",
            title: "Role - Acme",
            snippet: "remote",
          },
        ],
      })
    ).toEqual([
      { url: "https://bulldogjob.pl/companies/jobs/1", title: "Role - Acme", snippet: "remote" },
    ])
  })

  it("keeps Polish boards as snippets and career pages as fetches", () => {
    expect(storageMode("https://justjoin.it/job-offer/booksy-director")).toBe("snippet")
    expect(storageMode("https://nofluffjobs.com/pl/job/director-of-engineering-booksy")).toBe(
      "snippet"
    )
    expect(storageMode("https://bulldogjob.pl/companies/jobs/director-booksy")).toBe("snippet")
    expect(storageMode("https://careers.booksy.com/jobs/director-of-engineering.3774")).toBe(
      "fetch"
    )
    expect(storageMode("https://www.levels.fyi/companies/booksy/salaries")).toBe("salary-only")
    expect(storageMode("https://www.linkedin.com/jobs/view/123")).toBe("salary-only")
  })

  it("preserves an external salary when the crawl has none, and clears it when the employer states pay", () => {
    const existing = {
      salaryMin: 480_000,
      salaryMax: 720_000,
      salaryCurrency: "PLN/year",
      salarySourceUrl: "https://posada24.pl/job",
      salarySourceRaw: "480,000 - 720,000 zł",
    }
    expect(keepExternalPay(existing, { salaryMin: undefined, salaryMax: undefined })).toMatchObject(
      existing
    )
    expect(
      keepExternalPay(existing, { salaryMin: 40_000, salaryMax: 50_000, salaryCurrency: "PLN" })
    ).toMatchObject({
      salaryMin: 40_000,
      salaryMax: 50_000,
      salarySourceUrl: null,
      salarySourceRaw: null,
    })
  })

  it("rotates the unpaid role a bounded sync searches", () => {
    const jobs = [
      { company: "Booksy", title: "Director of Engineering" },
      { company: "Acme", title: "Engineering Manager" },
    ]
    const first = pickFocus(jobs, null)
    expect(first?.company).toBe("Booksy")
    const second = pickFocus(jobs, first!.key)
    expect(second?.company).toBe("Acme")
    expect(offerQuery("Booksy", 'Director "of" Engineering')).toBe(
      '"Director of Engineering" "Booksy"'
    )
  })
})

function figure(text: string, sourceUrl: string, rank: number): PayFigure {
  const parsed = figureFromText(text, sourceUrl, rank)
  if (!parsed) throw new Error(`expected a figure in ${text}`)
  return parsed
}
