// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * The popup and the options page as Chrome shows them: the real HTML and lib/*.js, a stub of
 * chrome.*, and the browser's language set for each test.
 */

type Message = { type: string; [key: string]: unknown }
type Replies = Record<string, (message: Message) => unknown>

const BASE = "http://127.0.0.1:43123"
const CONNECTED = { ok: true, data: { connected: true, apiBase: BASE, autoTrack: true } }
const ME = { ok: true, data: { user: { email: "a@example.com" } } }

function body(page: "popup" | "options"): string {
  const html = readFileSync(join(__dirname, "..", "entrypoints", page, "index.html"), "utf8")
  return html.slice(html.indexOf("<body"), html.indexOf("<script"))
}

async function open(page: "popup" | "options", language: string, replies: Replies, url = "") {
  vi.resetModules()
  vi.spyOn(navigator, "language", "get").mockReturnValue(language)
  document.documentElement.lang = ""
  document.body.innerHTML = body(page)
  const sent: Message[] = []
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage: async (message: Message) => {
        sent.push(message)
        return replies[message.type]?.(message) ?? { ok: false, error: "HTTP 500" }
      },
    },
    tabs: {
      query: async () => (url ? [{ id: 1, url }] : []),
      sendMessage: async () => null,
      create: vi.fn(async () => undefined),
    },
    storage: { local: { set: vi.fn(async () => undefined) } },
    permissions: {
      contains: async () => false,
      request: async () => false,
      remove: async () => true,
    },
  }
  if (page === "popup") (await import("../lib/popup.js")).startPopup()
  else (await import("../lib/options.js")).startOptions()
  await settle()
  return { sent }
}

async function settle() {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const text = (id: string) => document.getElementById(id)?.textContent?.replace(/\s+/g, " ").trim()

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ""
})

describe("the popup", () => {
  const replies: Replies = { config: () => CONNECTED, me: () => ME }

  it("is in English in a browser that is not Polish", async () => {
    await open("popup", "de-DE", replies)
    expect(document.documentElement.lang).toBe("en")
    expect(text("state")).toBe("Connected: a@example.com")
    expect(text("fill")).toBe("Fill the form on this page")
    expect(text("addOffer")).toBe("Add this offer to newrole.it")
    expect(text("options")).toBe("Options")
    expect(document.body.textContent).not.toMatch(/[ąćęłńóśźż]/i)
  })

  it("is in Polish in a Polish browser", async () => {
    await open("popup", "pl-PL", replies)
    expect(document.documentElement.lang).toBe("pl")
    expect(text("state")).toBe("Połączono: a@example.com")
    expect(text("fill")).toBe("Wypełnij formularz na tej stronie")
    expect(text("autoTrackHint")).toBe("Wysłany formularz aplikacji sam zapisuje się w trackerze.")
  })

  it("says it is not connected", async () => {
    await open("popup", "en-GB", { config: () => ({ ok: true, data: { connected: false } }) })
    expect(text("state")).toBe("The extension isn't connected to the app.")
    expect(text("connect")).toBe("Connect to newrole.it")
  })

  it("never shows a code or a server's sentence it does not know", async () => {
    await open("popup", "en-GB", replies, "https://jobs.example.com/apply")
    document.getElementById("fill")!.click()
    await settle()
    expect(text("message")).toBe("Something went wrong.")
  })

  it("says to wait when the app read too many links, instead of a general failure", async () => {
    const limited = { ok: false, status: 429, error: "Too many links read." }
    await open(
      "popup",
      "en-GB",
      { ...replies, addOffer: () => limited },
      "https://jobs.example.com/offer/1"
    )
    document.getElementById("addOffer")!.click()
    await settle()
    expect(text("message")).toBe("Too many links read. Wait an hour and try again.")
  })

  it("translates a code it knows", async () => {
    await open(
      "popup",
      "en-GB",
      { ...replies, fillTab: () => ({ ok: false, error: "no-form" }) },
      "https://jobs.example.com/apply"
    )
    document.getElementById("fill")!.click()
    await settle()
    expect(text("message")).toBe("I can't see a form here.")
  })

  it("shows the LinkedIn score with the date in the person's format", async () => {
    const audit = { score: 72, auditedAt: "2026-10-31T10:00:00Z" }
    const latest = { linkedinLatest: () => ({ ok: true, data: { audit } }) }
    await open("popup", "en-GB", { ...replies, ...latest })
    expect(text("profileScore")).toBe("LinkedIn profile: 72/100 (31/10/2026)")
    await open("popup", "pl-PL", { ...replies, ...latest })
    expect(text("profileScore")).toBe("Profil LinkedIn: 72/100 (31.10.2026)")
  })

  it("names the mail's reading and each application's status in the person's language", async () => {
    const mail = {
      ok: true,
      mail: {},
      data: {
        mail: { subject: "Next steps", from: "jane@acme.com", receivedAt: "2026-11-02T10:15:00" },
        reading: { signal: "INTERVIEW", evidence: "invite you to an interview" },
        used: null,
        choices: [
          { id: "a1", company: "Acme", title: "SRE", status: "APPLIED", statusLabel: "Aplikowano" },
        ],
        statuses: [{ value: "INTERVIEW", label: "Rozmowy" }],
        suggestion: { applicationId: "a1", status: "INTERVIEW" },
      },
    }
    await open(
      "popup",
      "en-GB",
      { ...replies, mailTab: () => mail },
      "https://mail.google.com/mail/u/0/#inbox/abc"
    )
    document.getElementById("readMail")!.click()
    await settle()
    expect(text("mailReading")).toBe(
      "Read as: an invitation to an interview. “invite you to an interview”"
    )
    expect(text("mailMeta")).toBe("jane@acme.com · 02/11/2026, 10:15")
    expect(text("mailApp")).toContain("Acme · SRE (Applied)")
    expect(text("mailStatus")).toContain("Interviews")
  })
})

describe("the options page", () => {
  it("is in English in a browser that is not Polish", async () => {
    await open("options", "en-GB", { config: () => CONNECTED, me: () => ME })
    expect(document.documentElement.lang).toBe("en")
    expect(document.querySelector("h1")!.textContent).toBe("newrole.it: extension options")
    expect(text("state")).toBe("Connected as a@example.com")
    expect(text("pair")).toBe("Connect to newrole.it")
    expect(document.body.textContent).not.toMatch(/[ąćęłńóśźż]/i)
  })

  it("is in Polish in a Polish browser", async () => {
    await open("options", "pl-PL", { config: () => ({ ok: true, data: { connected: false } }) })
    expect(document.querySelector("h1")!.textContent).toBe("newrole.it: opcje rozszerzenia")
    expect(text("state")).toBe("Nie połączono.")
  })

  it("explains a refused token without showing the server's sentence", async () => {
    await open("options", "en-GB", {
      config: () => CONNECTED,
      me: () => ({ ok: false, status: 401, error: "Missing or invalid token." }),
    })
    expect(text("state")).toBe("The token is not valid or was revoked.")
  })
})
