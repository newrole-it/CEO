import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { readdir } from "node:fs/promises"
import path from "node:path"
import db from "db"
import { findClaudeBinary } from "@newrole/llm/claude-cli"
import { llmProvider } from "src/server/llm/client"
import { findChrome } from "@newrole/cv-engine/render"
import { getApplicant } from "src/server/profile/applicant"
import { isLocalInstall } from "src/server/local-install"
import { appDir, extensionBuildPath, repoRoot } from "src/server/repo"
import { mcpUserCommand } from "./mcp-command"
import {
  buildSteps,
  isReady,
  nextStep,
  progress,
  setupDone,
  type SetupFacts,
  type SetupStep,
  type StepId,
} from "./steps"

export type SetupStatus = {
  /** scripts/go.mjs looks for this to tell the app from another program on the port. */
  app: "newrole"
  steps: SetupStep[]
  next: StepId | null
  progress: { done: number; total: number }
  ready: boolean
  signedIn: boolean
}

const CLAUDE_CACHE_MS = 20_000

async function dbFacts(app: string): Promise<SetupFacts["db"]> {
  try {
    await db.$queryRaw`SELECT 1`
  } catch {
    return { ok: false, pendingMigrations: 0 }
  }
  const folders = await readdir(path.join(app, "db", "migrations"), { withFileTypes: true })
    .then((items) => items.filter((item) => item.isDirectory()).length)
    .catch(() => 0)
  const applied = await db.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
  `
    .then((rows) => Number(rows[0]?.count ?? 0))
    .catch(() => 0)
  return { ok: true, pendingMigrations: Math.max(0, folders - applied) }
}

async function heartbeat(service: "mcp"): Promise<Date | null> {
  const row = await db.serviceHeartbeat.findUnique({ where: { service } }).catch(() => null)
  return row?.lastSeenAt ?? null
}

let claudeCache: { at: number; value: SetupFacts["claude"] } | null = null

function claudeLoggedIn(binary: string): Promise<boolean | null> {
  return new Promise((resolve) => {
    // Logged out exits non-zero and still prints JSON. An old CLI without the command: unknown.
    execFile(binary, ["auth", "status"], { timeout: 5000 }, (_error, stdout) => {
      try {
        const parsed = JSON.parse(stdout) as { loggedIn?: unknown }
        resolve(typeof parsed.loggedIn === "boolean" ? parsed.loggedIn : null)
      } catch {
        resolve(null)
      }
    })
  })
}

export async function claudeFacts(now: number): Promise<SetupFacts["claude"]> {
  if (claudeCache && now - claudeCache.at < CLAUDE_CACHE_MS) return claudeCache.value
  // A copy of the environment skips the binary cache, so a fresh install shows up on the next poll.
  const env = { ...process.env }
  const binary = findClaudeBinary(env)
  const value: SetupFacts["claude"] = {
    provider: llmProvider(env),
    installed: Boolean(binary),
    loggedIn: binary ? await claudeLoggedIn(binary) : null,
  }
  claudeCache = { at: now, value }
  return value
}

const NO_USER = { signedIn: false, guest: false, email: null } as const

async function userFacts(userId: number | null): Promise<SetupFacts["user"]> {
  if (!userId) return NO_USER
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, email: true },
  })
  if (!user) return NO_USER
  return user.role === "GUEST"
    ? { signedIn: false, guest: true, email: null }
    : { signedIn: true, guest: false, email: user.email }
}

async function hasProfile(userId: number | null): Promise<boolean> {
  if (!userId) return false
  return Boolean(await db.candidateProfile.findUnique({ where: { userId }, select: { id: true } }))
}

/** Just what / needs to decide whether to send someone to /setup. */
export async function setupReady(userId: number | null): Promise<boolean> {
  const database = await dbFacts(appDir())
  if (!database.ok) return false
  const [user, profile] = await Promise.all([userFacts(userId), hasProfile(userId)])
  return isReady({ db: database, user, profile })
}

export async function collectFacts(userId: number | null): Promise<SetupFacts> {
  const buildPath = extensionBuildPath()
  const [database, claude, command] = await Promise.all([
    dbFacts(appDir()),
    claudeFacts(Date.now()),
    mcpUserCommand(repoRoot()),
  ])
  const base = {
    claude,
    chrome: Boolean(findChrome()),
    extension: {
      built: existsSync(path.join(buildPath, "manifest.json")),
      path: buildPath,
      tokens: 0,
      lastUsedAt: null as Date | null,
    },
  }
  if (!database.ok) {
    return {
      ...base,
      db: database,
      user: NO_USER,
      profile: false,
      details: { firstName: false, email: false, phone: false },
      cvCount: 0,
      mcp: { lastSeenAt: null, command },
      sheet: { connected: false, lastSyncedAt: null, lastError: null },
    }
  }
  const [mcpSeen, user, profile] = await Promise.all([
    heartbeat("mcp"),
    userFacts(userId),
    hasProfile(userId),
  ])
  const [applicant, cvCount, tokens, sheet] = userId
    ? await Promise.all([
        getApplicant(userId),
        db.cvDocument.count({ where: { userId, docType: "CV" } }),
        db.apiToken.findMany({
          where: { userId, revokedAt: null },
          select: { lastUsedAt: true },
          orderBy: { lastUsedAt: { sort: "desc", nulls: "last" } },
        }),
        db.sheetLink.findUnique({ where: { userId } }),
      ])
    : [null, 0, [], null]
  return {
    ...base,
    db: database,
    user,
    profile,
    details: {
      firstName: Boolean(applicant?.effective.firstName),
      email: Boolean(applicant?.effective.email),
      phone: Boolean(applicant?.effective.phone),
    },
    cvCount,
    extension: {
      ...base.extension,
      tokens: tokens.length,
      lastUsedAt: tokens[0]?.lastUsedAt ?? null,
    },
    mcp: { lastSeenAt: mcpSeen, command },
    sheet: {
      connected: Boolean(sheet?.webhookUrl),
      lastSyncedAt: sheet?.lastSyncedAt ?? null,
      lastError: sheet?.webhookUrl ? (sheet.lastError ?? null) : null,
    },
  }
}

export async function setupStatus(userId: number | null): Promise<SetupStatus> {
  const facts = await collectFacts(userId)
  const steps = buildSteps(facts)
  return {
    app: "newrole",
    steps,
    next: nextStep(steps)?.id ?? null,
    progress: progress(steps),
    ready: isReady(facts),
    signedIn: facts.user.signedIn,
  }
}

/** A local install with checklist steps still to do. Each step then ends back on /setup. */
export async function setupUnfinished(userId: number | null): Promise<boolean> {
  if (!isLocalInstall()) return false
  return !setupDone(buildSteps(await collectFacts(userId)))
}
