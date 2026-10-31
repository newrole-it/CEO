// @vitest-environment jsdom
import { readFileSync } from "fs"
import { join } from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  jobPosting,
  linkedInFacts,
  linkedInJobId,
  offerKey,
  readOffer,
  statusLine,
} from "../../../extension/lib/offer.js"
import { startOffer } from "../../../extension/lib/offer-notice.js"

/**
 * Runs the real lib/offer.js and lib/offer-notice.js against a stub of chrome.*. The JSON-LD below
 * has the shape of justjoin.it, No Fluff Jobs and LinkedIn's public offer pages as of 2026-10-31.
 */

type Message = { type: string; [key: string]: unknown }
type Handler = (message: Message) => unknown

const CONNECTED = {
  ok: true,
  data: { connected: true, apiBase: "http://127.0.0.1:43123", offerCheck: true },
}

const APPLIED = {
  id: "a1",
  company: "Acme",
  title: "Senior Backend Engineer",
  status: "INTERVIEW",
  statusLabel: "Rozmowy",
  tone: "progress",
  appliedAt: "2026-10-12T10:00:00.000Z",
  statusChangedAt: "2026-10-20T10:00:00.000Z",
  stageNote: "2. rozmowa techniczna",
  nextStep: "Rozmowa z CTO",
  nextStepAt: "2026-11-03T10:00:00.000Z",
  match: "url",
}

const OTHER = {
  ...APPLIED,
  id: "a2",
  title: "Frontend Engineer",
  status: "REJECTED",
  statusLabel: "Odrzucono po: Rozmowy",
  tone: "danger",
  stageNote: null,
  nextStep: null,
  nextStepAt: null,
}

let shadow: ShadowRoot | null = null
let scan: (() => void) | null = null
const listeners: ((...args: unknown[]) => unknown)[] = []

function stubChrome(handler: Handler) {
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      lastError: undefined,
      sendMessage: (message: Message, callback?: (response: unknown) => void) => {
        const result = Promise.resolve().then(() => handler(message))
        if (callback) void result.then(callback)
        return result
      },
      onMessage: {
        addListener: (listener: (...args: unknown[]) => unknown) => listeners.push(listener),
      },
    },
    storage: { onChanged: { addListener: () => undefined } },
  }
}

async function flush() {
  for (let i = 0; i < 12; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

async function load(handler: Handler, options: { settleMs?: number } = {}) {
  stubChrome(handler)
  delete (globalThis as unknown as { __nowaRolaOffer?: boolean }).__nowaRolaOffer
  startOffer(options)
  await flush()
}

async function rescan() {
  scan?.()
  await new Promise((resolve) => setTimeout(resolve, 900))
  await flush()
}

function goTo(path: string) {
  history.pushState({}, "", path)
}

function setPage(title: string, html: string) {
  document.title = title
  document.body.innerHTML = html
}

const posting = (company: string, title: string) =>
  `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title,
    hiringOrganization: { "@type": "Organization", name: company },
  })}</script>`

function panel() {
  return document.querySelector<HTMLElement>("[data-nowarola='offer']")
}

function visible() {
  const host = panel()
  return Boolean(host && host.style.display !== "none")
}

beforeEach(() => {
  shadow = null
  sessionStorage.clear()
  history.replaceState({}, "", "/")
  setPage("", "")
  listeners.length = 0
  const attach = Element.prototype.attachShadow
  vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (
    this: Element,
    init: ShadowRootInit
  ) {
    shadow = attach.call(this, init)
    return shadow
  })
  ;(globalThis as unknown as { MutationObserver: unknown }).MutationObserver = class {
    constructor(callback: () => void) {
      scan = callback
    }
    observe() {}
    disconnect() {}
  }
})

afterEach(() => {
  document.querySelectorAll("[data-nowarola]").forEach((node) => node.remove())
  vi.restoreAllMocks()
})

describe("linkedInJobId", () => {
  it.each([
    ["https://www.linkedin.com/jobs/view/3912345678/", "3912345678"],
    ["https://www.linkedin.com/jobs/view/senior-engineer-at-acme-3912345678?x=1", "3912345678"],
    ["https://www.linkedin.com/jobs/search/?currentJobId=111&geoId=9", "111"],
    ["https://www.linkedin.com/jobs/collections/recommended/?currentJobId=222", "222"],
  ])("finds the offer in %s", (url, id) => {
    expect(linkedInJobId(url)).toBe(id)
  })

  it.each([
    ["https://www.linkedin.com/in/jan-kowalski/"],
    ["https://www.linkedin.com/feed/"],
    ["https://www.linkedin.com/jobs/search/?keywords=java"],
    ["https://jobs.lever.co/jobs/view/123"],
  ])("finds none in %s", (url) => {
    expect(linkedInJobId(url)).toBeNull()
  })
})

describe("jobPosting", () => {
  it("reads the company and role of an offer", () => {
    setPage("Java Developer - emagine Polska", posting("emagine Polska", "Java Developer"))
    expect(jobPosting(document)).toEqual({ company: "emagine Polska", title: "Java Developer" })
  })

  it("finds it among other data, in a graph, or with a company given as text", () => {
    const graph = {
      "@graph": [
        { "@type": "Organization" },
        { "@type": ["JobPosting"], title: "QA", hiringOrganization: "Acme" },
      ],
    }
    setPage(
      "QA | Acme",
      `<script type="application/ld+json">not json</script>
       <script type="application/ld+json">${JSON.stringify(graph)}</script>`
    )
    expect(jobPosting(document)).toEqual({ company: "Acme", title: "QA" })
  })

  it("takes the heading for proof when the window title differs", () => {
    setPage("Oferta pracy", `<h1>Team Lead (Java)</h1>${posting("CDQ", "Team Lead (Java)")}`)
    expect(jobPosting(document)).toMatchObject({ company: "CDQ" })
  })

  it("ignores data the page left behind from the previous offer", () => {
    setPage(
      "Python Developer - Globex",
      `<h1>Python Developer</h1>${posting("Acme", "Java Developer")}`
    )
    expect(jobPosting(document)).toBeNull()
  })

  it("ignores pages with no offer", () => {
    setPage(
      "Blog",
      `<script type="application/ld+json">{"@type":"Article","title":"Blog"}</script>`
    )
    expect(jobPosting(document)).toBeNull()
  })
})

describe("linkedInFacts", () => {
  it("reads the top card", () => {
    setPage(
      "LinkedIn",
      `<h1 class="job-details-jobs-unified-top-card__job-title">Staff Engineer</h1>
       <div class="job-details-jobs-unified-top-card__company-name"><a>Acme</a></div>`
    )
    expect(linkedInFacts(document)).toEqual({ company: "Acme", title: "Staff Engineer" })
  })

  it("falls back on the window title, with or without a notification count", () => {
    setPage("Staff Engineer | Acme | LinkedIn", "")
    expect(linkedInFacts(document)).toEqual({ company: "Acme", title: "Staff Engineer" })
    setPage("(3) Staff Engineer | Acme | LinkedIn", "")
    expect(linkedInFacts(document)).toEqual({ company: "Acme", title: "Staff Engineer" })
  })

  it("reads nothing from a list's title", () => {
    setPage("Job search | LinkedIn", "")
    expect(linkedInFacts(document)).toBeNull()
  })
})

describe("readOffer", () => {
  it("never asks about LinkedIn pages that are no offers", () => {
    setPage("Jan Kowalski | LinkedIn", posting("Acme", "Jan Kowalski"))
    expect(readOffer(document, "https://www.linkedin.com/in/jan-kowalski/")).toBeNull()
    expect(readOffer(document, "https://www.linkedin.com/feed/")).toBeNull()
  })

  it("sends only the address where it cannot tell what the page is", () => {
    setPage("Acme - Senior Engineer", "")
    expect(readOffer(document, "https://blog.example.com/post")).toEqual({
      url: "https://blog.example.com/post",
    })
  })

  it("reads an offer with JobPosting data on any site", () => {
    setPage("Java Developer - Acme", posting("Acme", "Java Developer"))
    expect(readOffer(document, "https://acme.pl/kariera/1")).toEqual({
      url: "https://acme.pl/kariera/1",
      company: "Acme",
      title: "Java Developer",
    })
  })

  it("passes the window title on from a known ATS", () => {
    setPage("Job Application for Staff Engineer at Acme", "")
    expect(readOffer(document, "https://jobs.lever.co/acme/1")).toEqual({
      url: "https://jobs.lever.co/acme/1",
      pageTitle: "Job Application for Staff Engineer at Acme",
    })
  })
})

describe("offerKey", () => {
  it("is one for every LinkedIn address of an offer", () => {
    expect(offerKey("https://www.linkedin.com/jobs/view/111/")).toBe(
      offerKey("https://www.linkedin.com/jobs/search/?currentJobId=111")
    )
  })

  it("keeps the query elsewhere", () => {
    expect(offerKey("https://acme.pl/careers?gh_jid=1")).not.toBe(
      offerKey("https://acme.pl/careers?gh_jid=2")
    )
  })
})

describe("statusLine", () => {
  it("says what is known, and how sure it is", () => {
    expect(statusLine({ applied: APPLIED, sameCompany: [] })).toMatch(
      /^Już aplikowano .*2026\. Status: Rozmowy\.$/
    )
    expect(statusLine({ applied: { ...APPLIED, match: "role" }, sameCompany: [] })).toMatch(
      /^Prawdopodobnie już aplikowano/
    )
    expect(statusLine({ applied: null, sameCompany: [OTHER] })).toBe(
      "W tej firmie już aplikowano: Frontend Engineer. Status: Odrzucono po: Rozmowy."
    )
    expect(statusLine({ applied: null, sameCompany: [] })).toBe("")
    expect(statusLine(null)).toBe("")
  })
})

describe("lib/offer-notice.js", () => {
  function answering(data: unknown, seen: Message[] = []): Handler {
    return (message) => {
      seen.push(message)
      if (message.type === "config") return CONNECTED
      if (message.type === "offerStatus") return { ok: true, data }
      return { ok: true }
    }
  }

  it("shows the status, the stage, the next step and a link to the tracker", async () => {
    await load(answering({ applied: APPLIED, sameCompany: [] }))
    const text = shadow?.textContent ?? ""
    expect(text).toContain("Już aplikowano na tę ofertę")
    expect(text).toContain("Rozmowy")
    expect(text).toContain("2. rozmowa techniczna")
    expect(text).toContain("Następny krok: Rozmowa z CTO, 3.11.2026")
    expect(text).toContain("status od 20.10.2026")
    const link = shadow?.querySelector("a") as HTMLAnchorElement
    expect(link.textContent).toBe("Acme · Senior Backend Engineer")
    expect(link.href).toBe("http://127.0.0.1:43123/applications?id=a1")
  })

  it("says when it is only a likely match", async () => {
    await load(answering({ applied: { ...APPLIED, match: "role" }, sameCompany: [] }))
    expect(shadow?.textContent).toContain("Prawdopodobnie już aplikowano na tę ofertę")
    expect(shadow?.textContent).toContain("Inny adres, ale zgadzają się firma i stanowisko.")
  })

  it("says when the company's name is only similar", async () => {
    await load(
      answering({
        applied: { ...APPLIED, match: "role", companyMatch: "similar" },
        sameCompany: [],
      })
    )
    expect(shadow?.textContent).toContain("nazwa firmy jest podobna")
  })

  it("gives no reason when the address settles it", async () => {
    await load(answering({ applied: APPLIED, sameCompany: [] }))
    expect(shadow?.textContent).not.toContain("Inny adres")
  })

  it("tells about other roles at the company", async () => {
    await load(answering({ applied: null, sameCompany: [OTHER] }))
    expect(shadow?.textContent).toContain("W tej firmie już aplikowano")
    expect(shadow?.textContent).toContain("Frontend Engineer")
    expect(shadow?.textContent).toContain("Odrzucono po: Rozmowy")
    expect(shadow?.textContent).not.toContain("Już aplikowano na tę ofertę")
  })

  it("draws nothing when the person did not apply", async () => {
    await load(answering({ applied: null, sameCompany: [] }))
    expect(panel()).toBeNull()
  })

  it("draws nothing when the app does not answer", async () => {
    await load((message) =>
      message.type === "config" ? CONNECTED : { ok: false, status: 0, error: "offline" }
    )
    expect(panel()).toBeNull()
  })

  it.each([
    ["not connected", { ...CONNECTED.data, connected: false }],
    ["switched off", { ...CONNECTED.data, offerCheck: false }],
  ])("asks nothing when %s", async (_name, config) => {
    const seen: Message[] = []
    await load((message) => {
      seen.push(message)
      return message.type === "config" ? { ok: true, data: config } : { ok: true, data: null }
    })
    expect(seen.map((message) => message.type)).toEqual(["config"])
  })

  it("stays closed for this offer once dismissed, and comes back on the next", async () => {
    await load(answering({ applied: APPLIED, sameCompany: [] }))
    ;(shadow?.querySelector("button") as HTMLButtonElement).click()
    expect(visible()).toBe(false)

    goTo("/other-offer")
    await rescan()
    expect(visible()).toBe(true)

    goTo("/")
    await rescan()
    expect(visible()).toBe(false)
  })

  it("asks once per offer, however much the page changes", async () => {
    const seen: Message[] = []
    await load(answering({ applied: null, sameCompany: [] }, seen))
    await rescan()
    await rescan()
    expect(seen.filter((message) => message.type === "offerStatus")).toHaveLength(1)
  })

  it("asks again when the page's details show up after the address", async () => {
    const seen: Message[] = []
    await load(answering({ applied: null, sameCompany: [] }, seen))
    setPage("Java Developer - Acme", posting("Acme", "Java Developer"))
    await rescan()
    const offers = seen.filter((message) => message.type === "offerStatus")
    expect(offers).toHaveLength(2)
    expect(offers[1].offer).toMatchObject({ company: "Acme", title: "Java Developer" })
  })

  it("does not ask about the old offer's details under the new address", async () => {
    setPage("Java Developer - Acme", posting("Acme", "Java Developer"))
    const seen: Message[] = []
    await load(answering({ applied: APPLIED, sameCompany: [] }, seen), { settleMs: 60_000 })
    expect(visible()).toBe(true)

    goTo("/next-offer")
    await rescan()
    // Moved on, and the screen still shows the old offer: the old answer is gone, nothing is asked.
    expect(visible()).toBe(false)
    expect(seen.filter((message) => message.type === "offerStatus")).toHaveLength(1)

    setPage("Python Developer - Globex", posting("Globex", "Python Developer"))
    await rescan()
    const offers = seen.filter((message) => message.type === "offerStatus")
    expect(offers).toHaveLength(2)
    expect(offers[1].offer).toMatchObject({ company: "Globex" })
  })

  it("still asks about a next offer that reads just like the last one", async () => {
    setPage("Java Developer - Acme", posting("Acme", "Java Developer"))
    const seen: Message[] = []
    await load(answering({ applied: null, sameCompany: [] }, seen), { settleMs: 50 })
    goTo("/same-looking-offer")
    await rescan()
    await new Promise((resolve) => setTimeout(resolve, 80))
    await flush()
    const offers = seen.filter((message) => message.type === "offerStatus")
    expect(offers).toHaveLength(2)
    expect(String(offers[1].offer && (offers[1].offer as { url: string }).url)).toContain(
      "/same-looking-offer"
    )
  })

  it("clears the icon when leaving an offer for a page that is none", async () => {
    const seen: Message[] = []
    await load(answering({ applied: APPLIED, sameCompany: [] }, seen))
    goTo("/somewhere")
    await rescan()
    expect(seen.map((message) => message.type)).toContain("offerLeft")
  })

  it("gives the popup what the page found", async () => {
    await load(answering({ applied: APPLIED, sameCompany: [] }))
    const answer = await new Promise((resolve) => {
      listeners.forEach((listener) => listener({ type: "nr:offer" }, {}, resolve))
    })
    expect(answer).toMatchObject({ ok: true, data: { applied: { id: "a1" } } })
  })

  it("starts once when it is injected again", async () => {
    await load(answering({ applied: APPLIED, sameCompany: [] }))
    startOffer()
    await flush()
    expect(listeners).toHaveLength(1)
    expect(document.querySelectorAll("[data-nowarola='offer']")).toHaveLength(1)
  })
})

describe("the built popup", () => {
  it("has every element popup.js looks for", () => {
    const extension = join(__dirname, "..", "..", "..", "extension")
    const script = readFileSync(join(extension, "lib", "popup.js"), "utf8")
    const html = readFileSync(join(extension, "entrypoints", "popup", "index.html"), "utf8")
    const wanted = [...script.matchAll(/\$\("([A-Za-z]+)"\)|show\("([A-Za-z]+)"/g)].map(
      (match) => match[1] ?? match[2]
    )
    expect(wanted.length).toBeGreaterThan(5)
    expect(wanted.filter((id) => !html.includes(`id="${id}"`))).toEqual([])
  })
})
