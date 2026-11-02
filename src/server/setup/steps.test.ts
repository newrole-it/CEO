import { describe, expect, it } from "vitest"
import { buildSteps, isReady, nextStep, progress, type SetupFacts, type StepId } from "./steps"

const now = new Date("2026-10-30T12:00:00Z")

/** A fresh clone after `npm run go`: everything local runs, nothing personal is set up yet. */
function fresh(overrides: Partial<SetupFacts> = {}): SetupFacts {
  return {
    db: { ok: true, pendingMigrations: 0 },
    worker: { lastSeenAt: new Date(now.getTime() - 5_000) },
    index: { offers: 0, companies: 0 },
    claude: { provider: "claude-cli", installed: true, loggedIn: true },
    chrome: true,
    user: { signedIn: false, guest: false, email: null },
    profile: false,
    details: { firstName: false, email: false, phone: false },
    cvCount: 0,
    extension: {
      built: true,
      path: "/repo/extension/.output/chrome-mv3",
      tokens: 0,
      lastUsedAt: null,
    },
    mcp: { lastSeenAt: null, command: "claude mcp add newrole -s user -- npm run mcp" },
    sheet: { connected: false, lastSyncedAt: null, lastError: null },
    now,
    ...overrides,
  }
}

const step = (facts: SetupFacts, id: StepId) => buildSteps(facts).find((item) => item.id === id)!

describe("buildSteps", () => {
  it("lists the steps in the order a person does them", () => {
    expect(buildSteps(fresh()).map((item) => item.id)).toEqual([
      "db",
      "worker",
      "claude",
      "index",
      "account",
      "profile",
      "details",
      "cv",
      "extension",
      "mcp",
      "sheet",
    ])
  })

  it("gives a command for a database that is down or behind", () => {
    const down = step(fresh({ db: { ok: false, pendingMigrations: 0 } }), "db")
    expect(down).toMatchObject({ state: "error", note: "down", command: "docker compose up -d db" })
    const behind = step(fresh({ db: { ok: true, pendingMigrations: 2 } }), "db")
    expect(behind).toMatchObject({ state: "error", command: "npm run db:deploy", vars: { n: 2 } })
  })

  it("calls the worker stopped once its heartbeat is old", () => {
    expect(step(fresh(), "worker").state).toBe("done")
    const old = fresh({ worker: { lastSeenAt: new Date(now.getTime() - 120_000) } })
    expect(step(old, "worker")).toMatchObject({ state: "todo", command: "npm run worker" })
    expect(step(fresh({ worker: { lastSeenAt: null } }), "worker").state).toBe("todo")
  })

  it("waits for the index while the worker runs, and asks for the worker when it does not", () => {
    expect(step(fresh(), "index")).toMatchObject({ state: "wait", note: "filling" })
    expect(step(fresh({ worker: { lastSeenAt: null } }), "index").note).toBe("needsWorker")
    const filled = fresh({ index: { offers: 16000, companies: 250 } })
    expect(step(filled, "index")).toMatchObject({ state: "done", vars: { offers: 16000 } })
  })

  it("separates a missing Claude from a signed-out one, and accepts an API key instead", () => {
    const claude = (value: SetupFacts["claude"]) => step(fresh({ claude: value }), "claude")
    expect(claude({ provider: "none", installed: false, loggedIn: null }).note).toBe("missing")
    expect(claude({ provider: "claude-cli", installed: true, loggedIn: false }).note).toBe("login")
    // An older CLI without `auth status`: installed, unknown, do not nag.
    expect(claude({ provider: "claude-cli", installed: true, loggedIn: null }).state).toBe("done")
    expect(claude({ provider: "openai", installed: false, loggedIn: null })).toMatchObject({
      state: "done",
      note: "api",
    })
  })

  it("walks the extension from build to install to connected", () => {
    const extension = (value: Partial<SetupFacts["extension"]>) =>
      step(fresh({ extension: { ...fresh().extension, ...value } }), "extension")
    expect(extension({ built: false })).toMatchObject({
      note: "build",
      command: "npm run ext:build",
    })
    expect(extension({})).toMatchObject({
      note: "install",
      path: "/repo/extension/.output/chrome-mv3",
    })
    expect(extension({ tokens: 1 }).note).toBe("install")
    expect(extension({ tokens: 1, lastUsedAt: now })).toMatchObject({ state: "done", note: "ok" })
  })

  it("shows a failing sheet as an error, but keeps it optional", () => {
    const sheet = { connected: true, lastSyncedAt: null, lastError: "http: 404" }
    expect(step(fresh({ sheet }), "sheet")).toMatchObject({
      state: "error",
      importance: "optional",
      vars: { error: "http: 404" },
    })
  })

  it("says the CV works without Chrome, only without one-click PDF", () => {
    expect(step(fresh({ cvCount: 1, chrome: false }), "cv")).toMatchObject({
      state: "done",
      note: "noChrome",
    })
  })
})

describe("isReady", () => {
  const ready = fresh({
    user: { signedIn: true, guest: false, email: "a@b.pl" },
    profile: true,
  })

  it("needs the database, the worker, an account and a profile", () => {
    expect(isReady(ready)).toBe(true)
    expect(isReady({ ...ready, db: { ok: false, pendingMigrations: 0 } })).toBe(false)
    expect(isReady({ ...ready, db: { ok: true, pendingMigrations: 1 } })).toBe(false)
    expect(isReady({ ...ready, worker: { lastSeenAt: null } })).toBe(false)
    expect(isReady({ ...ready, user: { signedIn: false, guest: true, email: null } })).toBe(false)
    expect(isReady({ ...ready, profile: false })).toBe(false)
  })

  it("agrees with the required steps", () => {
    const required = (facts: SetupFacts) =>
      buildSteps(facts)
        .filter((item) => item.importance === "required")
        .every((item) => item.state === "done")
    for (const facts of [ready, fresh(), { ...ready, profile: false }]) {
      expect(isReady(facts)).toBe(required(facts))
    }
  })
})

describe("nextStep", () => {
  it("starts with signing in on a fresh install", () => {
    expect(nextStep(buildSteps(fresh()))?.id).toBe("account")
  })

  it("puts a broken required step before everything else", () => {
    const facts = fresh({ db: { ok: false, pendingMigrations: 0 } })
    expect(nextStep(buildSteps(facts))?.id).toBe("db")
  })

  it("does not point at a step that only needs time", () => {
    const facts = fresh({
      user: { signedIn: true, guest: false, email: "a@b.pl" },
      profile: true,
      details: { firstName: true, email: true, phone: true },
      cvCount: 1,
      extension: { ...fresh().extension, tokens: 1, lastUsedAt: now },
      mcp: { lastSeenAt: now, command: null },
    })
    expect(nextStep(buildSteps(facts))?.id).toBe("sheet")
    const all = {
      ...facts,
      sheet: { connected: true, lastSyncedAt: now, lastError: null },
    }
    expect(nextStep(buildSteps(all))).toBeNull()
    expect(progress(buildSteps(all))).toEqual({ done: 10, total: 11 })
  })
})
