// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { startBackground } from "../../../extension/lib/background.js"
import { startContent } from "../../../extension/lib/content.js"
import { startPair } from "../../../extension/lib/pair.js"

/**
 * Runs the real lib/content.js, lib/pair.js and lib/background.js against a stub of chrome.*. This
 * is what a unit test can say about them; a real Chrome is still needed for the rest (see
 * extension/README.md).
 */

type Message = { type: string; [key: string]: unknown }
type Handler = (message: Message) => unknown

const GREENHOUSE = `
  <form id="application_form">
    <label for="first_name">First Name *</label><input id="first_name" name="first_name" required>
    <label for="email">Email *</label><input id="email" name="email" type="email" required>
    <label for="resume">Resume/CV</label><input id="resume" name="resume" type="file">
    <label for="q1">Why do you want to join?</label><textarea id="q1" name="q1"></textarea>
    <label for="gender">Gender</label>
    <select id="gender" name="gender"><option value="">-</option><option value="m">Male</option></select>
    <label><input id="consent" name="consent" type="checkbox"> I agree to the Privacy Policy</label>
    <button type="submit">Submit Application</button>
  </form>`

const VERSION = "1.2.3"
const removers: (() => void)[] = []
let shadow: ShadowRoot | null = null

function stubChrome(handler: Handler) {
  const messageListeners: ((...args: unknown[]) => unknown)[] = []
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      lastError: undefined,
      getManifest: () => ({ version: VERSION }),
      sendMessage: (message: Message, callback?: (response: unknown) => void) => {
        const result = Promise.resolve().then(() => handler(message))
        if (callback) void result.then(callback)
        return result
      },
      onMessage: {
        addListener: (listener: (...args: unknown[]) => unknown) => messageListeners.push(listener),
      },
    },
    storage: { onChanged: { addListener: () => undefined } },
  }
  return messageListeners
}

/** Starts the script fresh; the closed shadow root is captured for the assertions. */
async function loadContent() {
  delete (globalThis as unknown as { __nowaRolaContent?: boolean }).__nowaRolaContent
  startContent()
  await flush()
}

async function flush() {
  for (let i = 0; i < 12; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

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

function submit() {
  const form = document.getElementById("application_form") as HTMLFormElement
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
}

function setValue(id: string, value: string) {
  ;(document.getElementById(id) as HTMLInputElement).value = value
}

function connected(extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    data: { connected: true, apiBase: "http://127.0.0.1:43123", autoTrack: true, ...extra },
  }
}

beforeEach(() => {
  shadow = null
  sessionStorage.clear()
  document.title = "Job Application for Staff Engineer at Acme"
  document.body.innerHTML = GREENHOUSE
  // Old instances must not hear this test's events.
  for (const target of [document, window] as EventTarget[]) {
    const add = target.addEventListener.bind(target)
    vi.spyOn(target, "addEventListener").mockImplementation(((
      type: string,
      listener: EventListener,
      options?: boolean
    ) => {
      add(type, listener, options)
      removers.push(() => target.removeEventListener(type, listener, options))
    }) as typeof target.addEventListener)
  }
  const attach = Element.prototype.attachShadow
  vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (
    this: Element,
    init: ShadowRootInit
  ) {
    shadow = attach.call(this, init)
    return shadow
  })
  ;(globalThis as unknown as { MutationObserver: unknown }).MutationObserver = class {
    observe() {}
    disconnect() {}
  }
})

afterEach(() => {
  removers.splice(0).forEach((remove) => remove())
  document.querySelectorAll("[data-nowarola]").forEach((node) => node.remove())
  vi.restoreAllMocks()
})

describe("lib/content.js", () => {
  it("starts once when it is injected again", async () => {
    const seen: string[] = []
    const listeners = stubChrome((message) => {
      seen.push(message.type)
      if (message.type === "config") return connected()
      return { ok: true, data: null }
    })
    await loadContent()
    startContent()
    await flush()
    expect(listeners).toHaveLength(1)
    expect(seen.filter((type) => type === "config")).toHaveLength(1)
    expect(document.querySelectorAll("[data-nowarola]")).toHaveLength(1)
  })

  it("warns when the form shows that this posting was already applied to", async () => {
    stubChrome((message) => {
      if (message.type === "config") return connected()
      if (message.type === "takeToast") return { ok: true, data: null }
      if (message.type === "status") {
        return {
          ok: true,
          data: { applied: { id: "a1", status: "APPLIED", appliedAt: "2026-10-30T12:00:00.000Z" } },
        }
      }
      return { ok: false, error: "unexpected" }
    })
    await loadContent()
    expect(panelText()).toContain("Już aplikowano")
  })

  it("fills through the panel, marks fields and never touches EEO or consent", async () => {
    const seen: Message[] = []
    stubChrome((message) => {
      seen.push(message)
      if (message.type === "config") return connected()
      if (message.type === "takeToast") return { ok: true, data: null }
      if (message.type === "fill") {
        return {
          ok: true,
          data: {
            values: [
              { key: "first_name", value: "Rafał", kind: "firstName", source: "profile" },
              { key: "email", value: "rafal@example.com", kind: "email", source: "profile" },
              { key: "q1", value: "Szkic.", kind: "openQuestion", source: "ai" },
              // A server bug must not get past the second lock in the browser.
              { key: "gender", value: "Male", kind: "choiceQuestion", source: "ai" },
            ],
            job: { company: "Acme", title: "Staff Engineer" },
            applied: null,
          },
        }
      }
      return { ok: false, error: "unexpected" }
    })
    await loadContent()
    expect(panelText()).toContain("Wypełnij z Nowa Rola")

    panelButton("Wypełnij z Nowa Rola").click()
    await flush()

    const request = seen.find((message) => message.type === "fill")!
    const sent = (request.fields as { label: string }[]).map((field) => field.label)
    expect(sent).toEqual(["First Name", "Email", "Resume/CV", "Why do you want to join?"])
    expect((request.page as { title: string }).title).toContain("Staff Engineer")

    const el = (id: string) => document.getElementById(id) as HTMLInputElement
    expect(el("first_name").value).toBe("Rafał")
    expect(el("email").value).toBe("rafal@example.com")
    expect(el("q1").value).toBe("Szkic.")
    expect(el("gender").value).toBe("")
    expect(el("consent").checked).toBe(false)

    expect(el("first_name").style.outline).toContain("#5b3df5")
    expect(el("q1").style.outline).toContain("#e6a700")
    expect(el("q1").title).toContain("sprawdź")
    expect(panelText()).toContain("Uzupełniono: 2")
    expect(panelText()).toContain("szkice AI do sprawdzenia: 1")
    expect(panelText()).toContain("Why do you want to join?")
    expect(panelText()).toContain("Acme · Staff Engineer")
  })

  it("never submits the form itself", async () => {
    stubChrome((message) => {
      if (message.type === "config") return connected()
      if (message.type === "takeToast") return { ok: true, data: null }
      if (message.type === "fill") {
        return {
          ok: true,
          data: {
            values: [{ key: "email", value: "a@b.pl", kind: "email", source: "profile" }],
            job: null,
            applied: null,
          },
        }
      }
      return { ok: false }
    })
    const form = document.getElementById("application_form") as HTMLFormElement
    const onSubmit = vi.fn((event: Event) => event.preventDefault())
    form.addEventListener("submit", onSubmit)
    const nativeSubmit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => undefined)
    await loadContent()
    panelButton("Wypełnij").click()
    await flush()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(nativeSubmit).not.toHaveBeenCalled()
  })

  it("attaches the CV the service worker returns", async () => {
    const added: File[] = []
    ;(globalThis as unknown as { DataTransfer: unknown }).DataTransfer = class {
      files = added
      items = { add: (file: File) => added.push(file) }
    }
    Object.defineProperty(document.getElementById("resume"), "files", {
      configurable: true,
      writable: true,
      value: null,
    })
    stubChrome((message) => {
      if (message.type === "config") return connected()
      if (message.type === "takeToast") return { ok: true, data: null }
      if (message.type === "cv")
        return {
          ok: true,
          data: { base64: btoa("%PDF-1.7"), name: "CV.pdf", type: "application/pdf" },
        }
      if (message.type === "fill") {
        return {
          ok: true,
          data: {
            values: [{ key: "resume", value: "CV PL", kind: "resume", source: "cv" }],
            job: null,
            applied: null,
          },
        }
      }
      return { ok: false }
    })
    await loadContent()
    panelButton("Wypełnij").click()
    await flush()
    expect(added).toHaveLength(1)
    expect(added[0].name).toBe("CV.pdf")
    expect(added[0].type).toBe("application/pdf")
  })

  it("records one submission, without contact details, and links to the tracker", async () => {
    const submitted: Message[] = []
    stubChrome((message) => {
      if (message.type === "config") return connected()
      if (message.type === "takeToast") return { ok: true, data: null }
      if (message.type === "submitted") {
        submitted.push(message)
        return {
          ok: true,
          data: {
            application: {
              id: "app1",
              company: "Acme",
              title: "Staff Engineer",
              status: "APPLIED",
            },
            created: true,
            answers: { saved: 1, reused: 0 },
          },
        }
      }
      return { ok: false }
    })
    await loadContent()
    setValue("first_name", "Rafał")
    setValue("email", "rafal@example.com")
    setValue("q1", "Bo tak.")
    setValue("gender", "m")

    submit()
    await flush()
    submit()
    await flush()

    expect(submitted).toHaveLength(1)
    expect(submitted[0].fields).toEqual([
      { label: "Why do you want to join?", value: "Bo tak.", type: "textarea" },
    ])
    expect(JSON.stringify(submitted[0])).not.toContain("rafal@example.com")
    expect(panelText()).toContain("Zapisano w trackerze: Acme · Staff Engineer")
    const link = shadow!.querySelector("a") as HTMLAnchorElement
    expect(link.href).toBe("http://127.0.0.1:43123/applications?id=app1")
  })

  it("does not record while required fields are empty, or with tracking off", async () => {
    const submitted: Message[] = []
    stubChrome((message) => {
      if (message.type === "config") return connected()
      if (message.type === "takeToast") return { ok: true, data: null }
      if (message.type === "submitted") submitted.push(message)
      return { ok: false }
    })
    await loadContent()
    setValue("q1", "Bo tak.")
    submit()
    await flush()
    expect(submitted).toHaveLength(0)

    removers.splice(0).forEach((remove) => remove())
    stubChrome((message) => {
      if (message.type === "config") return connected({ autoTrack: false })
      if (message.type === "takeToast") return { ok: true, data: null }
      if (message.type === "submitted") submitted.push(message)
      return { ok: false }
    })
    await loadContent()
    setValue("first_name", "Rafał")
    setValue("email", "rafal@example.com")
    submit()
    await flush()
    expect(submitted).toHaveLength(0)
  })

  it("reports again after a failed save, and says so", async () => {
    let attempts = 0
    stubChrome((message) => {
      if (message.type === "config") return connected()
      if (message.type === "takeToast") return { ok: true, data: null }
      if (message.type === "submitted") {
        attempts += 1
        return { ok: false, status: 0, error: "offline" }
      }
      return { ok: false }
    })
    await loadContent()
    setValue("first_name", "Rafał")
    setValue("email", "rafal@example.com")
    submit()
    await flush()
    expect(attempts).toBe(1)
    expect(panelText()).toContain("Nie zapisano w trackerze")
    submit()
    await flush()
    expect(attempts).toBe(2)
  })

  it("offers to connect when there is no token", async () => {
    const seen: string[] = []
    stubChrome((message) => {
      seen.push(message.type)
      if (message.type === "config")
        return { ok: true, data: { connected: false, apiBase: "x", autoTrack: true } }
      return { ok: true, data: null }
    })
    await loadContent()
    panelButton("Połącz rozszerzenie").click()
    await flush()
    expect(seen).toContain("openOptions")
    expect(seen).not.toContain("fill")
  })

  it("stays silent in a frame without a form, so the frame with one can answer", async () => {
    document.body.innerHTML = "<p>No form here.</p>"
    const listeners = stubChrome((message) => {
      if (message.type === "config") return connected()
      return { ok: true, data: null }
    })
    await loadContent()
    const respond = vi.fn()
    expect(listeners[0]({ type: "nr:fill" }, {}, respond)).toBe(false)
    expect(respond).not.toHaveBeenCalled()
  })
})

describe("lib/pair.js", () => {
  async function loadPair(config: Record<string, unknown>) {
    const seen: Message[] = []
    stubChrome((message) => {
      seen.push(message)
      if (message.type === "config") return { ok: true, data: config }
      if (message.type === "setToken") {
        config.connected = true
        return { ok: true }
      }
      return { ok: false }
    })
    startPair()
    return seen
  }

  function post(data: unknown, origin: string, source: unknown = window) {
    window.dispatchEvent(
      new MessageEvent("message", { data, origin, source: source as MessageEventSource })
    )
  }

  const TOKEN = "nr_abcdefghijklmnopqrstuvwxyz"
  const LOCAL = "http://127.0.0.1:43123"

  it("stores a token from the app and answers the page", async () => {
    const seen = await loadPair({ customBase: false, apiBase: "http://localhost:43123" })
    const reply = vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
    post({ type: "nowarola:pair", token: TOKEN, origin: LOCAL }, LOCAL)
    await flush()
    expect(seen.find((message) => message.type === "setToken")).toMatchObject({
      token: TOKEN,
      origin: LOCAL,
    })
    expect(reply).toHaveBeenCalledWith({ type: "nowarola:paired" }, LOCAL)
  })

  it("ignores other origins, other windows and mismatched claims", async () => {
    const seen = await loadPair({ customBase: true, apiBase: "https://app.example" })
    post({ type: "nowarola:pair", token: TOKEN, origin: LOCAL }, LOCAL)
    post(
      { type: "nowarola:pair", token: TOKEN, origin: "https://evil.example" },
      "https://app.example"
    )
    post(
      { type: "nowarola:pair", token: TOKEN, origin: "https://app.example" },
      "https://app.example",
      null
    )
    post({ type: "other", token: TOKEN }, "https://app.example")
    await flush()
    expect(seen.some((message) => message.type === "setToken")).toBe(false)
  })

  describe("hello", () => {
    // jsdom's page address, which the options treat as a self-hosted app here.
    const HERE = location.origin
    const app = (extra: Record<string, unknown> = {}) => ({
      customBase: true,
      apiBase: HERE,
      connected: false,
      ...extra,
    })
    const hello = (connected: boolean) => ({ type: "nowarola:hello", connected, version: VERSION })

    it("posts to the page on load, with no token even if the config had one", async () => {
      const reply = vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
      await loadPair(app({ connected: true, token: TOKEN }))
      await flush()
      expect(reply).toHaveBeenCalledTimes(1)
      expect(reply).toHaveBeenCalledWith(hello(true), HERE)
    })

    it("stays quiet on load on an address that is not the app", async () => {
      const reply = vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
      await loadPair({ customBase: false, apiBase: LOCAL })
      await flush()
      expect(HERE).not.toBe(LOCAL)
      expect(reply).not.toHaveBeenCalled()
    })

    it("answers a ping with the same hello", async () => {
      const reply = vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
      await loadPair(app())
      await flush()
      reply.mockClear()
      post({ type: "nowarola:ping" }, HERE)
      await flush()
      expect(reply).toHaveBeenCalledTimes(1)
      expect(reply).toHaveBeenCalledWith(hello(false), HERE)
    })

    it("ignores pings from other origins and other windows", async () => {
      const reply = vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
      await loadPair(app())
      await flush()
      reply.mockClear()
      post({ type: "nowarola:ping" }, "https://evil.example")
      post({ type: "nowarola:ping" }, HERE, null)
      await flush()
      expect(reply).not.toHaveBeenCalled()
    })

    it("says hello again after pairing, and the token never goes back to the page", async () => {
      const reply = vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
      await loadPair(app())
      await flush()
      reply.mockClear()
      post({ type: "nowarola:pair", token: TOKEN, origin: HERE }, HERE)
      await flush()
      expect(reply.mock.calls).toEqual([
        [{ type: "nowarola:paired" }, HERE],
        [hello(true), HERE],
      ])
    })

    it("says nothing more when the token was refused", async () => {
      const reply = vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
      await loadPair(app())
      await flush()
      stubChrome((message) =>
        message.type === "config" ? { ok: true, data: app() } : { ok: false, error: "forbidden" }
      )
      reply.mockClear()
      post({ type: "nowarola:pair", token: TOKEN, origin: HERE }, HERE)
      await flush()
      expect(reply).not.toHaveBeenCalled()
    })
  })
})

describe("lib/background.js", () => {
  type Sender = { id?: string; tab?: { id: number }; url?: string }
  const ID = "extension-id"
  const STORED = { token: "nr_abcdefghijklmnopqrstuvwxyz" } as Record<string, unknown>

  async function loadBackground(
    stored: Record<string, unknown> = { ...STORED },
    { allowed = false } = {}
  ) {
    let listener: (
      message: Message,
      sender: Sender,
      respond: (value: unknown) => void
    ) => unknown = () => undefined
    const event = () => ({ addListener: vi.fn() })
    const set = vi.fn(async (update: Record<string, unknown>) => Object.assign(stored, update))
    const chrome = {
      runtime: {
        id: ID,
        getURL: (path: string) => `chrome-extension://${ID}/${path}`,
        onInstalled: event(),
        onStartup: event(),
        openOptionsPage: vi.fn(async () => undefined),
        onMessage: { addListener: (fn: typeof listener) => (listener = fn) },
      },
      storage: {
        local: {
          get: async () => stored,
          set,
          remove: vi.fn(async (key: string) => delete stored[key]),
        },
      },
      tabs: {
        onUpdated: event(),
        onActivated: event(),
        get: vi.fn(),
        create: vi.fn(async () => undefined),
        sendMessage: vi.fn(async () => ({ ok: true })),
      },
      permissions: { onAdded: event(), onRemoved: event(), contains: vi.fn(async () => allowed) },
      scripting: {
        getRegisteredContentScripts: vi.fn(async () => []),
        registerContentScripts: vi.fn(async () => undefined),
        unregisterContentScripts: vi.fn(async () => undefined),
        executeScript: vi.fn(async () => []),
      },
      action: {
        setBadgeBackgroundColor: vi.fn(async () => undefined),
        setBadgeText: vi.fn(async () => undefined),
      },
    }
    ;(globalThis as unknown as { chrome: unknown }).chrome = chrome
    startBackground()
    const call = (message: Message, sender: Sender = { id: ID }) =>
      new Promise<{ ok: boolean; [key: string]: unknown }>((resolve) => {
        listener(message, sender, resolve as (value: unknown) => void)
      })
    const installed = async (reason: string) => {
      chrome.runtime.onInstalled.addListener.mock.calls[0][0]({ reason })
      await flush()
    }
    return { call, stored, set, chrome, installed }
  }

  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    ;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock
  })

  it("calls the API with the Bearer token and never hands the token out", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ user: { email: "a@b.pl" } })))
    const { call } = await loadBackground()
    const me = await call({ type: "me" })
    expect(me).toMatchObject({ ok: true, data: { user: { email: "a@b.pl" } } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("http://127.0.0.1:43123/api/ext/me")
    expect(init.headers.Authorization).toBe(`Bearer ${STORED.token}`)
    const config = await call({ type: "config" })
    expect(JSON.stringify(config)).not.toContain("nr_")
    expect(config).toMatchObject({ ok: true, data: { connected: true, autoTrack: true } })
  })

  it("reports offline and missing tokens instead of throwing", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"))
    const online = await loadBackground()
    expect(await online.call({ type: "me" })).toMatchObject({ ok: false, error: "offline" })
    const none = await loadBackground({})
    expect(await none.call({ type: "me" })).toMatchObject({ ok: false, error: "not-connected" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("passes on API errors with their status", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Missing or invalid token." }), { status: 401 })
    )
    const { call } = await loadBackground()
    expect(await call({ type: "me" })).toEqual({
      ok: false,
      status: 401,
      error: "Missing or invalid token.",
    })
  })

  it("posts fill and submitted bodies, and sets the badge after a submission", async () => {
    const application = { id: "app1", company: "Acme", title: "SRE", status: "APPLIED" }
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ application, created: true }))
    )
    const { call, chrome } = await loadBackground()
    const page = { url: "https://jobs.lever.co/a/1", title: "T", text: "x" }
    await call({ type: "fill", page, fields: [] })
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:43123/api/ext/fill")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ page, fields: [] })
    await call({ type: "submitted", page, fields: [] }, { id: ID, tab: { id: 7 }, url: page.url })
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: "✓" })
  })

  it("returns the CV as base64 with its name", async () => {
    fetchMock.mockResolvedValue(
      new Response("%PDF", { headers: { "X-Cv-Name": encodeURIComponent("Rafał CV.pdf") } })
    )
    const { call } = await loadBackground()
    const result = await call({ type: "cv" })
    expect(result).toMatchObject({
      ok: true,
      data: { name: "Rafał CV.pdf", type: "application/pdf" },
    })
    expect(atob((result.data as { base64: string }).base64)).toBe("%PDF")
  })

  it("takes a token only from the pairing page or its own pages", async () => {
    const token = "nr_abcdefghijklmnopqrstuvwxyz0123"
    const { call, stored, set } = await loadBackground({})
    const attacker = { id: ID, tab: { id: 1 }, url: "https://evil.example/connect/extension" }
    const atsPage = { id: ID, tab: { id: 1 }, url: "https://jobs.lever.co/acme/1" }
    const wrongPath = { id: ID, tab: { id: 1 }, url: "http://127.0.0.1:43123/settings" }
    for (const sender of [attacker, atsPage, wrongPath]) {
      expect(await call({ type: "setToken", token }, sender)).toEqual({
        ok: false,
        error: "forbidden",
      })
    }
    expect(set).not.toHaveBeenCalled()

    const page = { id: ID, tab: { id: 1 }, url: "http://localhost:43123/connect/extension" }
    expect(await call({ type: "setToken", token, origin: "http://localhost:43123" }, page)).toEqual(
      { ok: true }
    )
    expect(stored).toMatchObject({ token, apiBase: "http://localhost:43123" })
    expect(await call({ type: "setToken", token: "not-a-token" })).toEqual({
      ok: false,
      error: "invalid-token",
    })
  })

  it("trusts the options page in its tab, but not a content script in a tab", async () => {
    const token = "nr_abcdefghijklmnopqrstuvwxyz0123"
    const { call, set } = await loadBackground({})
    const options = { id: ID, tab: { id: 1 }, url: `chrome-extension://${ID}/options.html` }
    expect(await call({ type: "setToken", token }, options)).toEqual({ ok: true })
    expect(await call({ type: "clearToken" }, options)).toEqual({ ok: true })
    expect(set).toHaveBeenCalled()

    const content = { id: ID, tab: { id: 2 }, url: "https://jobs.lever.co/acme/1" }
    expect(await call({ type: "clearToken" }, content)).toEqual({ ok: false, error: "forbidden" })
    const lookalike = {
      id: ID,
      tab: { id: 2 },
      url: `https://evil.example/chrome-extension://${ID}/`,
    }
    expect(await call({ type: "clearToken" }, lookalike)).toEqual({ ok: false, error: "forbidden" })
  })

  it("takes a token from the setup page too, but not from a look-alike path", async () => {
    const token = "nr_abcdefghijklmnopqrstuvwxyz0123"
    const { call, stored, set } = await loadBackground({})
    const lookAlike = { id: ID, tab: { id: 1 }, url: "http://127.0.0.1:43123/setup-evil" }
    expect(await call({ type: "setToken", token }, lookAlike)).toEqual({
      ok: false,
      error: "forbidden",
    })
    expect(set).not.toHaveBeenCalled()
    const setup = { id: ID, tab: { id: 1 }, url: "http://127.0.0.1:43123/setup?ext=installed" }
    expect(await call({ type: "setToken", token }, setup)).toEqual({ ok: true })
    expect(stored.token).toBe(token)
  })

  it("opens the setup page on a fresh install only", async () => {
    const { chrome, installed } = await loadBackground({})
    await installed("update")
    await installed("chrome_update")
    expect(chrome.tabs.create).not.toHaveBeenCalled()
    await installed("install")
    expect(chrome.tabs.create).toHaveBeenCalledTimes(1)
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "http://127.0.0.1:43123/setup?ext=installed",
    })
  })

  it("opens the setup page on the chosen app address", async () => {
    const { chrome, installed } = await loadBackground({ apiBase: "https://app.example" })
    await installed("install")
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "https://app.example/setup?ext=installed",
    })
  })

  it("injects the built content script on demand, and only that file", async () => {
    const { call, chrome } = await loadBackground()
    expect(await call({ type: "fillTab", tabId: 5 })).toEqual({ ok: true })
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 5, allFrames: true },
      files: ["content-scripts/content.js"],
    })
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(5, { type: "nr:fill" })
  })

  it("registers the built content script on all sites once allowed", async () => {
    const { chrome, installed } = await loadBackground({}, { allowed: true })
    await installed("update")
    expect(chrome.scripting.registerContentScripts).toHaveBeenCalledWith([
      {
        id: "nowarola-all-sites",
        matches: ["https://*/*"],
        js: ["content-scripts/content.js"],
        runAt: "document_idle",
        allFrames: true,
      },
    ])
  })

  it("registers the built pair script on a self-hosted address", async () => {
    const { chrome, installed } = await loadBackground(
      { apiBase: "https://app.example" },
      { allowed: true }
    )
    await installed("update")
    expect(chrome.scripting.registerContentScripts).toHaveBeenCalledWith([
      {
        id: "nowarola-pair",
        matches: ["https://app.example/connect/extension*", "https://app.example/setup*"],
        js: ["content-scripts/pair.js"],
        runAt: "document_start",
      },
    ])
  })

  it("keeps settings changes to its own pages", async () => {
    const { call, stored } = await loadBackground()
    const content = { id: ID, tab: { id: 1 }, url: "https://jobs.lever.co/acme/1" }
    expect(await call({ type: "clearToken" }, content)).toEqual({ ok: false, error: "forbidden" })
    expect(await call({ type: "setApiBase", apiBase: "https://evil.example" }, content)).toEqual({
      ok: false,
      error: "forbidden",
    })
    expect(await call({ type: "fillTab", tabId: 1 }, content)).toEqual({
      ok: false,
      error: "forbidden",
    })
    expect(stored.token).toBe(STORED.token)
    expect(await call({ type: "setApiBase", apiBase: "http://192.168.0.5:43123" })).toEqual({
      ok: false,
      error: "invalid-url",
    })
    expect(await call({ type: "clearToken" })).toEqual({ ok: true })
    expect(stored.token).toBeUndefined()
  })

  it("rejects unknown messages", async () => {
    const { call } = await loadBackground()
    expect(await call({ type: "nope" })).toEqual({ ok: false, error: "unknown-message" })
  })
})
