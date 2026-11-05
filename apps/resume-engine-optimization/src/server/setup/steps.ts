/**
 * The first-run checklist on /setup, as pure rules: facts from the machine go in, steps come out.
 * Order is the order a person does them. Text lives in src/app/i18n/copy-setup.ts, under
 * setup.<id>.title, setup.<id>.why and setup.<id>.<note>.
 */

export type StepId =
  | "db"
  | "claude"
  | "account"
  | "profile"
  | "details"
  | "cv"
  | "extension"
  | "mcp"
  | "sheet"

export type StepGroup = "run" | "you" | "connect"
export type StepState = "done" | "todo" | "wait" | "error"
export type StepImportance = "required" | "recommended" | "optional"

export type SetupStep = {
  id: StepId
  group: StepGroup
  importance: StepImportance
  state: StepState
  /** Which sentence to show: setup.<id>.<note> */
  note: string
  vars?: Record<string, string | number>
  /** A command to copy */
  command?: string
  /** A folder to copy */
  path?: string
  /** Where the action happens in the app */
  href?: string
}

export type SetupFacts = {
  db: { ok: boolean; pendingMigrations: number }
  claude: {
    provider: "openai" | "claude-cli" | "none"
    installed: boolean
    loggedIn: boolean | null
  }
  chrome: boolean
  user: { signedIn: boolean; guest: boolean; email: string | null }
  profile: boolean
  details: { firstName: boolean; email: boolean; phone: boolean }
  cvCount: number
  extension: { built: boolean; path: string; tokens: number; lastUsedAt: Date | null }
  mcp: { lastSeenAt: Date | null; command: string | null }
  sheet: { connected: boolean; lastSyncedAt: Date | null; lastError: string | null }
}

/** Enough to use the app: / stops sending people to /setup. Everything else is a bonus. */
export function isReady(facts: {
  db: SetupFacts["db"]
  user: SetupFacts["user"]
  profile: boolean
}): boolean {
  return facts.db.ok && facts.db.pendingMigrations === 0 && facts.user.signedIn && facts.profile
}

function dbStep(db: SetupFacts["db"]): SetupStep {
  const base = { id: "db", group: "run", importance: "required" } as const
  if (!db.ok) return { ...base, state: "error", note: "down", command: "docker compose up -d db" }
  // Not `npm run db:deploy`: it only migrates, and the running app keeps the old database client.
  // A stop and `npm run go` migrates, regenerates the client and starts the app again.
  if (db.pendingMigrations > 0) {
    return {
      ...base,
      state: "error",
      note: "pending",
      vars: { n: db.pendingMigrations },
      command: "npm run go",
    }
  }
  return { ...base, state: "done", note: "ok" }
}

function claudeStep({ claude }: SetupFacts): SetupStep {
  const base = { id: "claude", group: "run", importance: "recommended" } as const
  if (claude.provider === "openai") return { ...base, state: "done", note: "api" }
  if (!claude.installed) {
    return {
      ...base,
      state: "todo",
      note: "missing",
      command: "npm i -g @anthropic-ai/claude-code",
    }
  }
  if (claude.loggedIn === false) {
    return { ...base, state: "todo", note: "login", command: "claude auth login" }
  }
  return { ...base, state: "done", note: "ok" }
}

function accountStep({ user }: SetupFacts): SetupStep {
  const base = { id: "account", group: "you", importance: "required" } as const
  if (user.signedIn)
    return { ...base, state: "done", note: "ok", vars: { email: user.email ?? "" } }
  return {
    ...base,
    state: "todo",
    note: user.guest ? "guest" : "none",
    href: "/login?returnTo=/setup",
  }
}

function profileStep(facts: SetupFacts): SetupStep {
  const base = { id: "profile", group: "you", importance: "required" } as const
  if (facts.profile) return { ...base, state: "done", note: "ok", href: "/profile" }
  return { ...base, state: "todo", note: "none", href: "/start?returnTo=/setup" }
}

function detailsStep({ details }: SetupFacts): SetupStep {
  const base = {
    id: "details",
    group: "you",
    importance: "recommended",
    href: "/profile/details",
  } as const
  const done = details.firstName && details.email && details.phone
  return { ...base, state: done ? "done" : "todo", note: done ? "ok" : "none" }
}

function cvStep(facts: SetupFacts): SetupStep {
  const base = { id: "cv", group: "you", importance: "recommended", href: "/cv" } as const
  if (facts.cvCount === 0) return { ...base, state: "todo", note: "none" }
  return {
    ...base,
    state: "done",
    note: facts.chrome ? "ok" : "noChrome",
    vars: { n: facts.cvCount },
  }
}

function extensionStep({ extension }: SetupFacts): SetupStep {
  const base = { id: "extension", group: "connect", importance: "recommended" } as const
  if (extension.tokens > 0 && extension.lastUsedAt) return { ...base, state: "done", note: "ok" }
  if (!extension.built)
    return { ...base, state: "todo", note: "build", command: "npm run ext:build" }
  return { ...base, state: "todo", note: "install", path: extension.path }
}

function mcpStep({ mcp }: SetupFacts): SetupStep {
  const base = { id: "mcp", group: "connect", importance: "recommended", href: "/connect" } as const
  if (mcp.lastSeenAt) return { ...base, state: "done", note: "ok" }
  return { ...base, state: "todo", note: "add", command: mcp.command ?? undefined }
}

function sheetStep({ sheet }: SetupFacts): SetupStep {
  const base = {
    id: "sheet",
    group: "connect",
    importance: "optional",
    href: "/settings#st-sheet",
  } as const
  if (sheet.lastError) {
    return {
      ...base,
      state: "error",
      note: "failing",
      vars: { error: sheet.lastError.slice(0, 160) },
    }
  }
  if (sheet.connected && sheet.lastSyncedAt) return { ...base, state: "done", note: "ok" }
  return { ...base, state: "todo", note: "none" }
}

export function buildSteps(facts: SetupFacts): SetupStep[] {
  return [
    dbStep(facts.db),
    claudeStep(facts),
    accountStep(facts),
    profileStep(facts),
    detailsStep(facts),
    cvStep(facts),
    extensionStep(facts),
    mcpStep(facts),
    sheetStep(facts),
  ]
}

/** What to do now: anything broken first, then the list in order, optional steps last. */
export function nextStep(steps: SetupStep[]): SetupStep | null {
  return (
    steps.find((step) => step.state === "error" && step.importance !== "optional") ??
    steps.find((step) => step.state === "todo" && step.importance !== "optional") ??
    steps.find((step) => step.state !== "done" && step.state !== "wait") ??
    null
  )
}

/** Nothing left but optional steps: setup steps stop sending people back to /setup. */
export function setupDone(steps: SetupStep[]): boolean {
  return steps.every(
    (step) => step.importance === "optional" || step.state === "done" || step.state === "wait"
  )
}

export function progress(steps: SetupStep[]): { done: number; total: number } {
  return { done: steps.filter((step) => step.state === "done").length, total: steps.length }
}
