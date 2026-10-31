import { Prisma } from "@prisma/client"
import db from "db"
import {
  ApplicationError,
  createApplication,
  toApplicationView,
  updateApplication,
} from "src/server/applications/service"
import type { ApplicationView } from "src/server/applications/types"
import { ACTIVE_STATUSES, isApplicationStatus } from "src/shared/applications"
import { isMailOutcome, isMailSignal, type MailOutcome, type MailSignal } from "src/shared/gmail"
import { revokeGoogleToken, type FetchLike } from "./oauth"
import { targetStatus } from "./policy"
import { openToken, sealToken } from "./token-crypto"
import { GmailError, isGmailErrorCode, type GmailErrorCode } from "./types"

/** The Gmail link and the log of read messages: everything the screens and MCP call. */

export const GMAIL_SYNC_INTERVAL_MS = 15 * 60_000
/** How long suggestions and the log of read messages are kept. */
export const MAIL_RETENTION_MS = 90 * 86_400_000
const RECENT_MS = 7 * 86_400_000

export type GmailStats = {
  listed: number
  skipped: number
  read: number
  applied: number
  pending: number
}

/** What the screens may know. The token is not here, on purpose. */
export type GmailStatus = {
  connected: boolean
  email: string | null
  autoApply: boolean
  useModel: boolean
  lastSyncedAt: Date | null
  lastErrorCode: GmailErrorCode | null
  lastStats: GmailStats | null
  nextSyncAt: Date | null
}

const STAT_KEYS = ["listed", "skipped", "read", "applied", "pending"] as const

/** The stored JSON column as GmailStats; anything else (older shapes, nulls) reads as no stats. */
function parseGmailStats(value: unknown): GmailStats | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (!STAT_KEYS.every((key) => typeof record[key] === "number")) return null
  return Object.fromEntries(STAT_KEYS.map((key) => [key, record[key]])) as GmailStats
}

export async function gmailStatus(userId: number): Promise<GmailStatus> {
  const link = await db.gmailLink.findUnique({ where: { userId } })
  return {
    connected: Boolean(link),
    email: link?.email ?? null,
    autoApply: link?.autoApply ?? true,
    useModel: link?.useModel ?? true,
    lastSyncedAt: link?.lastSyncedAt ?? null,
    lastErrorCode: isGmailErrorCode(link?.lastErrorCode) ? link.lastErrorCode : null,
    lastStats: parseGmailStats(link?.lastStats),
    nextSyncAt: link?.nextSyncAt ?? null,
  }
}

/** Saves the grant, sealed. Replacing another mailbox's grant revokes it, so no token is left live. */
export async function saveGmailGrant(
  input: { userId: number; email: string; refreshToken: string },
  fetchImpl: FetchLike = fetch
): Promise<void> {
  const sealed = sealToken(input.refreshToken, input.userId)
  if (!sealed) throw new GmailError("key", "SESSION_SECRET_KEY is missing or too short.")
  const previous = await db.gmailLink.findUnique({ where: { userId: input.userId } })
  const sameMailbox = previous?.email === input.email
  if (previous && !sameMailbox) await revokeStoredToken(previous, fetchImpl)
  await db.gmailLink.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      email: input.email,
      refreshToken: sealed,
      nextSyncAt: new Date(),
    },
    update: {
      email: input.email,
      refreshToken: sealed,
      lastErrorCode: null,
      nextSyncAt: new Date(),
      syncingAt: null,
      ...(sameMailbox ? {} : { cursorAt: null, lastSyncedAt: null, lastStats: Prisma.DbNull }),
    },
  })
}

export async function saveGmailSettings(
  userId: number,
  patch: { autoApply?: boolean; useModel?: boolean }
): Promise<GmailStatus> {
  const data: { autoApply?: boolean; useModel?: boolean } = {}
  if (patch.autoApply !== undefined) data.autoApply = patch.autoApply
  if (patch.useModel !== undefined) data.useModel = patch.useModel
  if (Object.keys(data).length) await db.gmailLink.updateMany({ where: { userId }, data })
  return gmailStatus(userId)
}

async function revokeStoredToken(
  link: { userId: number; refreshToken: string },
  fetchImpl: FetchLike
): Promise<boolean> {
  const token = openToken(link.refreshToken, link.userId)
  if (!token) return false
  return revokeGoogleToken(token, fetchImpl)
}

/** Best effort at Google, used when the whole account goes. False means nothing was revoked. */
export async function revokeGmailAccess(
  userId: number,
  fetchImpl: FetchLike = fetch
): Promise<boolean> {
  const link = await db.gmailLink.findUnique({ where: { userId } })
  return link ? revokeStoredToken(link, fetchImpl) : true
}

/**
 * Revokes the grant at Google and removes the token and the log. Statuses and timeline entries
 * stay: they are the person's tracker. `revoked: false` means Google could not be reached, so the
 * screen sends them to their Google account to remove it by hand.
 */
export async function disconnectGmail(
  userId: number,
  fetchImpl: FetchLike = fetch
): Promise<{ revoked: boolean }> {
  const revoked = await revokeGmailAccess(userId, fetchImpl)
  await db.$transaction([
    db.backgroundTask.deleteMany({
      where: { type: "GMAIL_SYNC", payload: { path: ["userId"], equals: userId } },
    }),
    db.mailEvent.deleteMany({ where: { userId } }),
    db.gmailLink.deleteMany({ where: { userId } }),
  ])
  return { revoked }
}

type MailEventRow = Prisma.MailEventGetPayload<{
  include: { application: { select: { id: true; company: true; title: true; status: true } } }
}>

export type MailEventView = {
  id: string
  fromAddress: string
  subject: string
  receivedAt: Date
  signal: MailSignal
  reader: string
  evidence: string | null
  outcome: MailOutcome
  fromStatus: string | null
  toStatus: string | null
  company: string | null
  title: string | null
  authenticated: boolean
  application: { id: string; company: string; title: string; status: string } | null
}

function toView(row: MailEventRow): MailEventView {
  return {
    id: row.id,
    fromAddress: row.fromAddress,
    subject: row.subject,
    receivedAt: row.receivedAt,
    signal: isMailSignal(row.signal) ? row.signal : "OTHER",
    reader: row.reader,
    evidence: row.evidence,
    outcome: isMailOutcome(row.outcome) ? row.outcome : "IGNORED",
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    company: row.company,
    title: row.title,
    authenticated: row.authenticated,
    application: row.application,
  }
}

const withApplication = {
  application: { select: { id: true, company: true, title: true, status: true } },
} satisfies Prisma.MailEventInclude

/** Every message whose body was read, newest first. Messages the gate stopped are not in here. */
export async function mailLog(userId: number, limit = 50): Promise<MailEventView[]> {
  const rows = await db.mailEvent.findMany({
    where: { userId },
    orderBy: { receivedAt: "desc" },
    take: limit,
    include: withApplication,
  })
  return rows.map(toView)
}

export type MailInbox = {
  connected: boolean
  /** Waiting for the person */
  pending: MailEventView[]
  /** Changed on its own in the last days, and still undoable */
  recent: MailEventView[]
  /** Open applications a suggestion can be assigned to */
  choices: { id: string; company: string; title: string }[]
}

export async function mailInbox(userId: number, now = new Date()): Promise<MailInbox> {
  const [link, pending, recent, choices] = await Promise.all([
    db.gmailLink.findUnique({ where: { userId }, select: { id: true } }),
    db.mailEvent.findMany({
      where: { userId, outcome: "PENDING" },
      orderBy: { receivedAt: "asc" },
      take: 50,
      include: withApplication,
    }),
    db.mailEvent.findMany({
      where: {
        userId,
        outcome: "APPLIED",
        receivedAt: { gte: new Date(now.getTime() - RECENT_MS) },
      },
      orderBy: { receivedAt: "desc" },
      take: 10,
      include: withApplication,
    }),
    db.application.findMany({
      where: { userId, status: { in: [...ACTIVE_STATUSES, "GHOSTED"] } },
      orderBy: { appliedAt: "desc" },
      take: 200,
      select: { id: true, company: true, title: true },
    }),
  ])
  return {
    connected: Boolean(link),
    pending: pending.map(toView),
    recent: recent.map(toView),
    choices,
  }
}

/** Puts one message on the application's timeline. Only the subject: the body is gone by now. */
export async function addMailToTimeline(
  applicationId: string,
  subject: string,
  receivedAt: Date
): Promise<void> {
  await db.applicationEvent.create({
    data: {
      applicationId,
      type: "mail",
      note: subject.slice(0, 200),
      channel: "gmail",
      at: receivedAt,
    },
  })
}

/**
 * The person's answer to a suggestion, or their undo of an automatic change. Applying is theirs
 * to decide, so it may do what the policy would not do alone, like reopening a closed process.
 */
export async function resolveMailEvent(input: {
  userId: number
  id: string
  action: "apply" | "dismiss" | "undo"
  applicationId?: string | null
}): Promise<{ application: ApplicationView | null; created: boolean }> {
  const { userId, id, action } = input
  const event = await db.mailEvent.findFirst({ where: { id, userId } })
  if (!event) throw new ApplicationError("not-found", "This message is not in the log.")
  const finish = (outcome: MailOutcome, data: Prisma.MailEventUncheckedUpdateInput = {}) =>
    db.mailEvent.update({ where: { id }, data: { outcome, ...data } })

  if (action === "dismiss") {
    if (event.outcome === "PENDING") await finish("DISMISSED")
    return { application: null, created: false }
  }

  if (action === "undo") {
    if (
      event.outcome !== "APPLIED" ||
      !event.applicationId ||
      !isApplicationStatus(event.fromStatus)
    ) {
      throw new ApplicationError("not-found", "This change can no longer be undone.")
    }
    const current = await db.application.findFirst({
      where: { id: event.applicationId, userId },
      select: { status: true },
    })
    // Moved on since, by hand or by a newer message: going back now would lose that.
    if (!current || current.status !== event.toStatus) {
      throw new ApplicationError("not-found", "This change can no longer be undone.")
    }
    const application = await updateApplication({
      userId,
      id: event.applicationId,
      channel: "web",
      status: event.fromStatus,
    })
    await finish("UNDONE")
    return { application, created: false }
  }

  if (event.outcome !== "PENDING") return { application: null, created: false }

  const applicationId = input.applicationId ?? event.applicationId
  if (!applicationId) {
    if (event.signal !== "CONFIRMATION" || !event.company || !event.title) {
      throw new ApplicationError("not-found", "Choose the application this message is about.")
    }
    const { application, created } = await createApplication({
      userId,
      company: event.company,
      title: event.title,
      appliedAt: event.receivedAt,
      source: "gmail",
      channel: "gmail",
    })
    await addMailToTimeline(application.id, event.subject, event.receivedAt)
    await finish("CREATED", { applicationId: application.id })
    return { application, created }
  }

  const row = await db.application.findFirst({ where: { id: applicationId, userId } })
  if (!row) throw new ApplicationError("not-found", "Application not found.")
  const toStatus = isMailSignal(event.signal) ? targetStatus(event.signal, row.status) : null
  await addMailToTimeline(row.id, event.subject, event.receivedAt)
  if (!toStatus) {
    await finish("NOTED", { applicationId: row.id })
    return { application: toApplicationView(row), created: false }
  }
  const application = await updateApplication({
    userId,
    id: row.id,
    channel: "web",
    status: toStatus,
  })
  await finish("APPLIED", { applicationId: row.id, fromStatus: row.status, toStatus })
  return { application, created: false }
}
