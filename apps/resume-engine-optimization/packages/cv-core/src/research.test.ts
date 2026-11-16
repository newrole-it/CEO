import { describe, expect, it } from "vitest"
import {
  cleanOfferBrief,
  CompanyBriefResult,
  mergePoints,
  numbersBacked,
  onDomain,
  OfferBriefReply,
  pageAboutCompany,
  parseCompanyBrief,
  quoteFound,
  screenWebClaims,
  sensitiveTopics,
  settleWebClaim,
  sourceUrl,
  unknownAxes,
  type BriefPoint,
} from "./research"

const OFFER = `Acme Robotics builds warehouse robots for European retailers.
We are migrating our fleet software from a monolith to Go services.
The team of 8 engineers ships to production every day with trunk-based development.
Requirements: 5+ years with Go, Kubernetes in production.`

const CV = "Senior engineer. Built Go services on Kubernetes in production for 6 years."

describe("quoteFound", () => {
  it("finds a quote word for word, ignoring case and punctuation", () => {
    expect(quoteFound(OFFER, "migrating our fleet software from a monolith")).toBe(true)
    expect(quoteFound(OFFER, "MIGRATING our fleet-software, from a monolith!")).toBe(true)
  })
  it("refuses a paraphrase and a quote too short to prove anything", () => {
    expect(quoteFound(OFFER, "moving our fleet software off a monolith")).toBe(false)
    expect(quoteFound(OFFER, "Go services")).toBe(false)
  })
  it("accepts a quote that skips a stretch with an ellipsis only when every part is there", () => {
    expect(quoteFound(OFFER, "Acme Robotics builds … for European retailers")).toBe(true)
    expect(quoteFound(OFFER, "Acme Robotics builds … for American retailers")).toBe(false)
  })
  it("does not match a word inside a longer one", () => {
    expect(quoteFound("we ship daily releases", "we ship dai")).toBe(false)
  })
})

describe("numbers and sensitive topics", () => {
  it("needs every number of the statement in the sources", () => {
    expect(numbersBacked("A team of 8 engineers", OFFER)).toBe(true)
    expect(numbersBacked("A team of 12 engineers", OFFER)).toBe(false)
    expect(numbersBacked("Revenue of 22 000", "revenue was 22,000")).toBe(true)
  })
  it("names the topics that need a web page", () => {
    expect(sensitiveTopics("The company has 500 employees")).toContain("headcount")
    expect(sensitiveTopics("It raised a Series B")).toContain("funding")
    expect(sensitiveTopics("Firma przeprowadziła zwolnienia")).toContain("layoffs")
    expect(sensitiveTopics("Rated 4.2 on Glassdoor")).toContain("ratings")
    expect(sensitiveTopics("Pays 20 000 PLN")).toContain("pay")
    expect(sensitiveTopics("They ship every day")).toEqual([])
  })
})

describe("cleanOfferBrief", () => {
  const reply = OfferBriefReply.parse({
    points: [
      {
        axis: "challenges",
        text: "The team is moving its fleet software to Go services.",
        quote: "migrating our fleet software from a monolith to Go services",
      },
      // a quote the offer does not hold
      {
        axis: "strategy",
        text: "Acme sells to the US.",
        quote: "builds robots for American stores",
      },
      // a number not in its quote
      {
        axis: "culture",
        text: "A team of 20 engineers ships daily.",
        quote: "ships to production every day with trunk-based development",
      },
      // headcount from the offer alone is never shown
      {
        axis: "culture",
        text: "The team has 8 engineers.",
        quote: "The team of 8 engineers ships to production every day",
      },
    ],
    angle: [
      {
        text: "You have run Go on Kubernetes in production.",
        offerQuote: "Go, Kubernetes in production",
        evidence: "Built Go services on Kubernetes in production",
      },
      // evidence not in the person's data
      {
        text: "You led a robotics team.",
        offerQuote: "Acme Robotics builds warehouse robots",
        evidence: "Led a robotics team of ten",
      },
    ],
    questions: [
      { text: "How far along is the migration?", quote: "migrating our fleet software" },
      { text: "Why did you lay off half the team?" },
      { text: "How many of the 40 services are in Go?" },
      { text: "Not a question" },
    ],
  })
  const brief = cleanOfferBrief(reply, { offerText: OFFER, evidence: CV })

  it("keeps a point only with its quote in the offer, its numbers in the quote, and no sensitive topic", () => {
    expect(brief.points).toEqual([
      {
        axis: "challenges",
        text: "The team is moving its fleet software to Go services.",
        source: {
          kind: "offer",
          quote: "migrating our fleet software from a monolith to Go services",
        },
      },
    ])
    expect(brief.dropped.offer).toBe(3)
  })
  it("keeps an angle point only with evidence found in the person's data", () => {
    expect(brief.angle.map((item) => item.text)).toEqual([
      "You have run Go on Kubernetes in production.",
    ])
    expect(brief.dropped.angle).toBe(1)
  })
  it("keeps questions that assert nothing", () => {
    expect(brief.questions).toEqual([
      { text: "How far along is the migration?", quote: "migrating our fleet software" },
    ])
    expect(brief.dropped.questions).toBe(3)
  })
  it("reads a reply with broken parts as empty, not as an error", () => {
    const broken = OfferBriefReply.parse({ points: "nope", angle: [{ text: 1 }] })
    expect(cleanOfferBrief(broken, { offerText: OFFER, evidence: CV })).toEqual({
      points: [],
      angle: [],
      questions: [],
      dropped: { offer: 0, angle: 0, questions: 0 },
    })
  })
})

describe("web claims", () => {
  it("accepts only a public https address", () => {
    expect(sourceUrl("https://acme.example/about#team")?.toString()).toBe(
      "https://acme.example/about"
    )
    expect(sourceUrl("http://acme.example/about")).toBeNull()
    expect(sourceUrl("https://user:pw@acme.example/")).toBeNull()
    expect(sourceUrl("https://acme.example:8443/")).toBeNull()
    expect(sourceUrl("https://10.0.0.1/")).toBeNull()
    expect(sourceUrl("https://localhost/")).toBeNull()
    expect(sourceUrl("not a url")).toBeNull()
  })
  it("tells the company's own domain", () => {
    expect(onDomain("www.blog.acme.example", "acme.example")).toBe(true)
    expect(onDomain("notacme.example", "acme.example")).toBe(false)
    expect(onDomain("acme.example", null)).toBe(false)
  })

  const quote = "Acme opened a new engineering office in Kraków this spring"
  it("screens out the offer's own page, short quotes, unbacked numbers and sensitive topics", () => {
    const { claims, dropped } = screenWebClaims(
      {
        points: [
          {
            axis: "moves",
            text: "Acme opened an office in Kraków.",
            url: "https://news.example/acme",
            quote,
          },
          { axis: "moves", text: "Same.", url: "https://jobs.example/offer/1?ref=x", quote },
          {
            axis: "moves",
            text: "Too short.",
            url: "https://news.example/a",
            quote: "Acme opened",
          },
          {
            axis: "moves",
            text: "Acme has 300 engineers in Kraków.",
            url: "https://news.example/b",
            quote,
          },
          {
            axis: "strategy",
            text: "Acme raised a Series B round.",
            url: "https://news.example/c",
            quote: "Acme sells robots to European retailers",
          },
        ],
      },
      { offerUrls: ["https://www.jobs.example/offer/1/"] }
    )
    expect(claims).toEqual([
      {
        axis: "moves",
        text: "Acme opened an office in Kraków.",
        url: "https://news.example/acme",
        host: "news.example",
        quote,
      },
    ])
    expect(dropped).toBe(4)
  })

  const company = { names: ["Acme Robotics", "Acme"], domain: "acme.example" }
  const claim = {
    axis: "moves" as const,
    text: "Acme opened an office in Kraków.",
    url: "https://news.example/acme",
    host: "news.example",
    quote,
  }
  const at = new Date("2026-11-16T10:00:00Z")

  it("keeps a claim only when the quote is on the page read and the page is about the company", () => {
    const page = { text: `News. ${quote}, the company said.` }
    expect(settleWebClaim(claim, page, company, at)).toEqual({
      axis: "moves",
      text: claim.text,
      source: {
        kind: "web",
        url: claim.url,
        host: "news.example",
        quote,
        own: false,
        checkedAt: "2026-11-16T10:00:00.000Z",
      },
    })
    expect(settleWebClaim(claim, { text: "Acme did something else." }, company, at)).toBeNull()
  })
  it("does not take a page about another firm", () => {
    expect(pageAboutCompany({ host: "news.example", text: "Acmeson Ltd news" }, company)).toBe(
      false
    )
    expect(pageAboutCompany({ host: "careers.acme.example", text: "" }, company)).toBe(true)
  })
})

describe("merging and unknowns", () => {
  const point = (axis: BriefPoint["axis"], n: number, kind: "offer" | "web"): BriefPoint => ({
    axis,
    text: `${axis} ${n}`,
    source:
      kind === "offer"
        ? { kind, quote: "q q q" }
        : {
            kind,
            url: "https://x.example/",
            host: "x.example",
            quote: "q q q",
            own: false,
            checkedAt: "",
          },
  })
  it("puts the offer's points first within an axis and caps the web's", () => {
    const web = [1, 2, 3, 4].map((n) => point("culture", n, "web"))
    const merged = mergePoints([point("culture", 0, "offer"), point("strategy", 0, "offer")], web)
    expect(merged.map((p) => p.text)).toEqual([
      "strategy 0",
      "culture 0",
      "culture 1",
      "culture 2",
      "culture 3",
    ])
    expect(unknownAxes(merged)).toEqual(["moves", "challenges", "competitors"])
  })
  it("reads back a stored brief and refuses another shape", () => {
    const result: CompanyBriefResult = {
      version: 1,
      points: [],
      angle: [],
      questions: [],
      offer: "done",
      web: { state: "provider", searches: null, searchCap: 5, unread: [] },
      dropped: { offer: 0, web: 0, angle: 0, questions: 0 },
    }
    expect(parseCompanyBrief(JSON.parse(JSON.stringify(result)))).toEqual(result)
    expect(parseCompanyBrief({ version: 2 })).toBeNull()
  })
})
