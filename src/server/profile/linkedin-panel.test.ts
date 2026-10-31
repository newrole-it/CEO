// @vitest-environment jsdom
import { readFileSync } from "fs"
import { join } from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { startLinkedIn } from "../../../extension/lib/profile-panel.js"

/**
 * Runs the real lib/profile-panel.js against a stub of chrome.* on a page shaped like a LinkedIn
 * profile. What a unit test can say about it; a real Chrome is still needed for the rest.
 */

type Message = { type: string; [key: string]: unknown }
type Handler = (message: Message) => unknown

const page = readFileSync(join(__dirname, "fixtures", "linkedin-page.html"), "utf8")

const AUDIT = {
  score: 72,
  previousScore: 65,
  progress: "O 7 więcej niż w ostatnim audycie (65).",
  summary: "Nagłówek nie mówi o skali, a doświadczenie nie pokazuje zespołu.",
  auditedAt: "2026-10-31T10:00:00.000Z",
  fresh: true,
  notes: [
    {
      id: "kw-1",
      category: "keywords",
      label: "Brakujące słowa kluczowe",
      severity: 5,
      sectionId: "skills",
      section: "Umiejętności",
      field: "body",
      quote: "Kubernetes · TypeScript",
      why: "Oferty wspominają o budżecie, a w Twoim profilu tego nie ma.",
      rewrite: "Kubernetes · TypeScript · budżet zespołu",
      factId: "head-of-engineering:budget-ownership",
    },
    {
      id: "scope-experience-2",
      category: "seniority",
      label: "Poziom i zakres",
      severity: 4,
      sectionId: "experience-2",
      section: "Doświadczenie · Senior Engineer",
      field: "title",
      quote: "Senior Engineer",
      why: "Nie widać zespołu ani budżetu.",
      rewrite: "Senior Engineer. Zespół [N] osób.",
      factId: null,
    },
  ],
  demand: [
    {
      id: "head-of-engineering:budget-ownership",
      role: "Head of Engineering",
      phrase: "odpowiedzialność za budżet",
      percent: 50,
      matchingOffers: 20,
      totalOffers: 40,
    },
  ],
  read: { name: true, headline: true, about: true, experience: 3, education: 1, skills: 2 },
}

let shadow: ShadowRoot | null = null
let listeners: ((...args: unknown[]) => unknown)[] = []
let sent: Message[] = []

function stubChrome(handler: Handler) {
  listeners = []
  sent = []
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      lastError: undefined,
      sendMessage: (message: Message, callback?: (response: unknown) => void) => {
        sent.push(message)
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

function connected(extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    data: {
      connected: true,
      apiBase: "http://127.0.0.1:43123",
      linkedinAuto: true,
      linkedinSlug: null,
      ...extra,
    },
  }
}

function answering(audit: unknown = AUDIT, extra: Record<string, unknown> = {}): Handler {
  return (message) => {
    if (message.type === "config") return connected(extra)
    if (message.type === "linkedinAudit") return { ok: true, data: { audit } }
    return { ok: false, error: "unknown-message" }
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Real timers, short: the page counts as settled after 30 ms instead of 2.5 s. */
async function load(path: string) {
  history.replaceState({}, "", path)
  delete (globalThis as unknown as { __nowaRolaLinkedIn?: boolean }).__nowaRolaLinkedIn
  startLinkedIn({ settleMs: 30, minGapMs: 0 })
  // The config round trip, then the first scan.
  await wait(10)
}

/** Long enough for the settle wait, the request and the render. */
const settled = () => wait(150)

function panelText() {
  return shadow?.textContent ?? ""
}

function panelButton(text: string): HTMLButtonElement {
  const button = Array.from(shadow!.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text)
  )
  if (!button) throw new Error(`no button "${text}" in: ${panelText()}`)
  return button as HTMLButtonElement
}

const audits = () => sent.filter((message) => message.type === "linkedinAudit")

beforeEach(() => {
  shadow = null
  sessionStorage.clear()
  document.body.innerHTML = page
  const attach = Element.prototype.attachShadow
  vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (
    this: Element,
    init: ShadowRootInit
  ) {
    shadow = attach.call(this, init)
    return shadow
  })
  Element.prototype.scrollIntoView = vi.fn()
  ;(globalThis as unknown as { MutationObserver: unknown }).MutationObserver = class {
    observe() {}
    disconnect() {}
  }
})

afterEach(async () => {
  // A scan the old instance still has scheduled must fire against this test's stub, not the next.
  await wait(80)
  document.querySelectorAll("[data-nowarola]").forEach((node) => node.remove())
  vi.restoreAllMocks()
})

describe("lib/profile-panel.js", () => {
  it("audits the person's own profile once the page has stopped changing", async () => {
    stubChrome(answering())
    await load("/in/jan-kowalski/")
    // Not yet: sections may still be loading.
    expect(audits()).toHaveLength(0)
    await settled()
    expect(audits()).toHaveLength(1)
    const request = audits()[0]
    expect(request.force).toBe(false)
    expect(request.slug).toBe("jan-kowalski")
    expect(request.profileUrl).toMatch(/\/in\/jan-kowalski\/$/)
    const sections = request.sections as { name: string; experience: unknown[]; skills: string[] }
    expect(sections.name).toBe("Jan Kowalski")
    expect(sections.experience).toHaveLength(3)
    expect(sections.skills).toEqual(["Kubernetes", "TypeScript"])

    const text = panelText()
    expect(text).toContain("72")
    expect(text).toContain("O 7 więcej niż w ostatnim audycie (65).")
    expect(text).toContain(AUDIT.summary)
    expect(text).toContain("Najważniejsze zmiany")
    expect(text).toContain("Brakujące słowa kluczowe")
    expect(text).toContain("Kubernetes · TypeScript · budżet zespołu")
    expect(text).toContain("50% ofert „Head of Engineering” wspomina: odpowiedzialność za budżet")
    expect(text).toContain("3 role")
    expect(panelButton("Kopiuj")).toBeTruthy()

    panelButton("Pokaż").click()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()

    // The same page is not sent twice.
    await settled()
    expect(audits()).toHaveLength(1)
  })

  it("stays quiet on other people's profiles and off the profile path", async () => {
    stubChrome(answering())
    document.querySelector('a[aria-label="Edit intro"]')!.remove()
    await load("/in/someone-else/")
    await settled()
    expect(audits()).toHaveLength(0)
    expect(shadow).toBeNull()

    await load("/feed/")
    await settled()
    expect(audits()).toHaveLength(0)
    expect(shadow).toBeNull()
  })

  it("knows a profile the app already audited even without edit controls", async () => {
    stubChrome(answering(AUDIT, { linkedinSlug: "jan-kowalski" }))
    document.querySelector('a[aria-label="Edit intro"]')!.remove()
    await load("/in/jan-kowalski/")
    await settled()
    expect(audits()).toHaveLength(1)
  })

  it("offers a button instead of sending when the automatic audit is off", async () => {
    stubChrome(answering(AUDIT, { linkedinAuto: false }))
    await load("/in/jan-kowalski/")
    await settled()
    expect(audits()).toHaveLength(0)
    panelButton("Oceń mój profil").click()
    await wait(20)
    expect(audits()).toHaveLength(1)
    expect(audits()[0].force).toBe(true)
    expect(panelText()).toContain("72")
  })

  it("audits on request from the popup, whatever the page looks like", async () => {
    stubChrome(answering())
    document.querySelector('a[aria-label="Edit intro"]')!.remove()
    await load("/in/jan-kowalski/")
    await settled()
    expect(audits()).toHaveLength(0)
    const response = await new Promise<unknown>((resolve) => {
      const keep = listeners[0]({ type: "nr:linkedin" }, {}, resolve)
      expect(keep).toBe(true)
    })
    expect(response).toEqual({ ok: true, score: 72 })
    expect(audits()).toHaveLength(1)
    expect(audits()[0].force).toBe(true)
    expect(panelText()).toContain("Najważniejsze zmiany")
  })

  it("explains an app that is not running and lets the person retry", async () => {
    let fail = true
    stubChrome((message) => {
      if (message.type === "config") return connected()
      if (message.type === "linkedinAudit")
        return fail
          ? { ok: false, status: 0, error: "offline" }
          : { ok: true, data: { audit: AUDIT } }
      return { ok: false }
    })
    await load("/in/jan-kowalski/")
    await settled()
    expect(panelText()).toContain("Czy Nowa Rola jest uruchomiona?")
    fail = false
    panelButton("Spróbuj ponownie").click()
    await wait(20)
    expect(panelText()).toContain("72")
  })
})
