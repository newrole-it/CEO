import db from "db"
import { ApplicationError, updateApplication } from "src/server/applications/service"
import { createLlmClient, type LlmClient } from "src/server/llm/client"
import { enqueueGmailSync } from "src/server/queue/enqueue"
import { ACTIVE_STATUSES } from "src/shared/applications"
import { buildQueries, toScopedApp } from "./allowlist"
import { classifyByModel, classifyByRules, factsFromMail, type Reading } from "./classify"
import { gateMessage, type GateResult } from "./gate"
import { matchApplication } from "./match"
import { gmailCredentials, refreshAccessToken, type FetchLike } from "./oauth"
import { decide, type Decision } from "./policy"
import { createGmailReader } from "./reader"
import {
  addMailToTimeline,
  GMAIL_SYNC_INTERVAL_MS,
  MAIL_RETENTION_MS,
  type GmailStats,
} from "./service"
import { messageText, redact } from "./text"
import { openToken } from "./token-crypto"
import {
  GmailError,
  type GmailErrorCode,
  type MailHeaders,
  type MailPart,
  type ScopedApp,
  type Sender,
} from "./types"

/**
 * One pass over the mailbox: search with the allow lists → read headers → gate → read the body →
 * rules, then the model → match → policy. The body lives only inside handleMessage and is never
 * stored or logged. See docs/product/plan-gmail.md.
 */

/** Mail older than this is not looked at when a mailbox is first connected. */
const FIRST_LOOKBACK_MS = 30 * 86_400_000
/** Gmail can index a message a little after its date, so each search starts slightly earlier. */
const OVERLAP_MS = 10 * 60_000
const STALE_SYNC_MS = 15 * 60_000
const MAX_BODIES = 40
const MAX_MODEL_CALLS = 10
/** How long a message that needs the model may wait for it, before the rules have the last word. */
const MODEL_RETRY_MS = 3 * 86_400_000
const WORKER_BUDGET_MS = 5 * 60_000
/** A pass cut short by a limit continues soon, not in 15 minutes. */
const CONTINUE_MS = 60_000

export type SyncResult =
  | { status: "synced"; stats: GmailStats }
  | { status: "not-connected" | "not-configured" | "busy" }
  | { status: "failed"; code: GmailErrorCode }

export type SyncDeps = {
  fetchImpl?: FetchLike
  /** null: no model, whatever the settings say */
  llm?: LlmClient | null
  budgetMs?: number
  now?: () => Date
}

async function claim(userId: number, now: Date): Promise<boolean> {
  const { count } = await db.gmailLink.updateMany({
    where: {
      userId,
      OR: [{ syncingAt: null }, { syncingAt: { lt: new Date(now.getTime() - STALE_SYNC_MS) } }],
    },
    data: { syncingAt: now },
  })
  return count === 1
}

/** Open applications, and GHOSTED: a reply after silence is news. Closed processes are left alone. */
async function loadApps(userId: number): Promise<ScopedApp[]> {
  const rows = await db.application.findMany({
    where: { userId, status: { in: [...ACTIVE_STATUSES, "GHOSTED"] } },
    select: {
      id: true,
      company: true,
      title: true,
      status: true,
      url: true,
      appliedAt: true,
      statusChangedAt: true,
      job: { select: { sourceType: true, company: { select: { canonicalDomain: true } } } },
    },
  })
  return rows.map(toScopedApp)
}

type Context = {
  userId: number
  autoApply: boolean
  apps: ScopedApp[]
  llm: LlmClient | null
  modelCalls: number
  modelDown: boolean
  now: Date
}

/**
 * Rules, then the model. Null means this one needs the model and cannot have it right now (the
 * limit for this pass, or the model failed), so nothing is decided and it comes back next pass.
 */
async function readMessage(
  context: Context,
  input: { sender: Sender; subject: string; text: string; receivedAt: Date }
): Promise<Reading | null> {
  const rules = classifyByRules(input.subject, input.text)
  if (rules.sure || !context.llm) return rules
  const tooOld = context.now.getTime() - input.receivedAt.getTime() > MODEL_RETRY_MS
  if (context.modelDown || context.modelCalls >= MAX_MODEL_CALLS) return tooOld ? rules : null
  context.modelCalls += 1
  const model = await classifyByModel(
    { senderDomain: input.sender.domain, subject: input.subject, text: input.text },
    context.llm
  )
  if (model) return model
  context.modelDown = true
  return tooOld ? rules : null
}

/** Does what the policy decided. Only a missing application can stop it: then it was deleted. */
async function carryOut(
  context: Context,
  decision: Decision,
  message: { subject: string; receivedAt: Date }
): Promise<Decision> {
  const { userId } = context
  try {
    if (decision.outcome === "APPLIED" && decision.applicationId && decision.toStatus) {
      await updateApplication({
        userId,
        id: decision.applicationId,
        channel: "gmail",
        status: decision.toStatus,
      })
      // "In this stage since" counts from the message, and older mail in this pass can still apply.
      await db.application.update({
        where: { id: decision.applicationId },
        data: { statusChangedAt: message.receivedAt },
      })
      await addMailToTimeline(decision.applicationId, message.subject, message.receivedAt)
    } else if (decision.outcome === "NOTED" && decision.applicationId) {
      await addMailToTimeline(decision.applicationId, message.subject, message.receivedAt)
    }
    return decision
  } catch (error) {
    if (error instanceof ApplicationError) {
      return { outcome: "IGNORED", applicationId: null, fromStatus: null, toStatus: null }
    }
    throw error
  }
}

/** False when the message has to wait for the model: nothing was stored or changed. */
async function handleMessage(
  context: Context,
  head: MailHeaders,
  gate: Extract<GateResult, { pass: true }>,
  body: MailPart,
  stats: GmailStats
): Promise<boolean> {
  const { sender, tier, authenticated } = gate
  // Links and addresses are gone before anything else sees the text.
  const text = redact(messageText(body))
  const subject = redact(head.subject.slice(0, 1000)).slice(0, 300)
  const reading = await readMessage(context, {
    sender,
    subject,
    text,
    receivedAt: head.receivedAt,
  })
  if (!reading) return false
  const match = matchApplication(
    { sender, tier, subject, text, receivedAt: head.receivedAt },
    context.apps
  )
  const rule = reading.signal === "CONFIRMATION" ? factsFromMail(subject, sender.name) : null
  const company = reading.company ?? rule?.company ?? null
  const title = reading.title ?? rule?.title ?? null
  const decision = await carryOut(
    context,
    decide({
      signal: reading.signal,
      sure: reading.sure,
      authenticated,
      autoApply: context.autoApply,
      match,
      receivedAt: head.receivedAt,
      facts: { company, title },
    }),
    { subject, receivedAt: head.receivedAt }
  )
  const waiting = decision.outcome === "PENDING"
  await db.mailEvent.create({
    data: {
      userId: context.userId,
      messageId: head.id,
      applicationId: decision.applicationId,
      fromAddress: sender.address,
      subject,
      receivedAt: head.receivedAt,
      signal: reading.signal,
      reader: reading.reader,
      // A quote from mail that turned out to be about something else has no reason to stay.
      evidence: reading.signal === "OTHER" ? null : reading.evidence,
      outcome: decision.outcome,
      fromStatus: decision.fromStatus,
      toStatus: decision.toStatus,
      company: waiting ? company : null,
      title: waiting ? title : null,
      authenticated,
    },
  })
  if (decision.outcome === "APPLIED") stats.applied += 1
  if (waiting) stats.pending += 1
  // The next message in this pass has to see what this one changed.
  if (decision.outcome === "APPLIED") context.apps = await loadApps(context.userId)
  return true
}

export async function syncGmail(userId: number, deps: SyncDeps = {}): Promise<SyncResult> {
  const now = deps.now ?? (() => new Date())
  const started = now()
  const link = await db.gmailLink.findUnique({ where: { userId } })
  if (!link) return { status: "not-connected" }
  const credentials = gmailCredentials()
  if (!credentials) return { status: "not-configured" }
  if (!(await claim(userId, started))) return { status: "busy" }

  try {
    const refreshToken = openToken(link.refreshToken, userId)
    if (!refreshToken) throw new GmailError("key", "The stored Gmail token cannot be opened.")
    const fetchImpl: FetchLike = deps.fetchImpl ?? fetch
    const token = await refreshAccessToken({ refreshToken, ...credentials }, fetchImpl)
    if ("error" in token) throw new GmailError(token.error, "Could not refresh the Gmail token.")
    const reader = createGmailReader(token.accessToken, fetchImpl)

    const llm = !link.useModel ? null : deps.llm !== undefined ? deps.llm : createLlmClient()
    const context: Context = {
      userId,
      autoApply: link.autoApply,
      apps: await loadApps(userId),
      llm,
      modelCalls: 0,
      modelDown: false,
      now: started,
    }
    const after = link.cursorAt
      ? new Date(link.cursorAt.getTime() - OVERLAP_MS)
      : new Date(started.getTime() - FIRST_LOOKBACK_MS)

    const ids = new Set<string>()
    for (const query of buildQueries(context.apps, after)) {
      for (const id of await reader.search(query)) ids.add(id)
    }
    const heads: MailHeaders[] = []
    for (const id of ids) {
      const head = await reader.headers(id)
      if (head) heads.push(head)
    }
    // Oldest first, so a confirmation, then an invitation, then a rejection land in that order.
    heads.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())

    const known = new Set(
      (
        await db.mailEvent.findMany({
          where: { userId, messageId: { in: [...ids] } },
          select: { messageId: true },
        })
      ).map((row) => row.messageId)
    )
    const stats: GmailStats = { listed: ids.size, skipped: 0, read: 0, applied: 0, pending: 0 }
    const budget = deps.budgetMs ?? WORKER_BUDGET_MS
    let cutShortAt: Date | null = null
    let waitingAt: Date | null = null
    for (const head of heads) {
      if (known.has(head.id)) continue
      const gate = gateMessage(head, { mailbox: link.email, apps: context.apps })
      if (!gate.pass) {
        stats.skipped += 1
        continue
      }
      if (stats.read >= MAX_BODIES || now().getTime() - started.getTime() > budget) {
        cutShortAt = head.receivedAt
        break
      }
      const body = await reader.body(head.id)
      if (!body) continue
      stats.read += 1
      try {
        const handled = await handleMessage(context, head, gate, body, stats)
        if (!handled) waitingAt = waitingAt ?? head.receivedAt
      } catch (error) {
        if (error instanceof GmailError) throw error
        // One odd message must not hold up every message after it, pass after pass. A log row
        // keeps it from being read and retried forever. Name only: the error could quote the mail.
        console.error("Gmail message failed", error instanceof Error ? error.name : "unknown")
        await db.mailEvent
          .create({
            data: {
              userId,
              messageId: head.id,
              fromAddress: gate.sender.address,
              subject: redact(head.subject.slice(0, 300)),
              receivedAt: head.receivedAt,
              signal: "OTHER",
              reader: "rules",
              outcome: "IGNORED",
              authenticated: false,
            },
          })
          .catch(() => undefined)
      }
    }

    const finished = now()
    await db.mailEvent.deleteMany({
      where: { userId, createdAt: { lt: new Date(finished.getTime() - MAIL_RETENTION_MS) } },
    })
    const soon = cutShortAt || (waitingAt && !context.modelDown)
    const saved = await db.gmailLink.updateMany({
      where: { userId },
      data: {
        // Everything before the start of this search is done, unless a limit or the model left
        // something behind. Messages after that point are in the log, so they are not read again.
        cursorAt: waitingAt ?? cutShortAt ?? started,
        lastSyncedAt: finished,
        lastErrorCode: null,
        lastStats: stats,
        syncingAt: null,
        nextSyncAt: new Date(finished.getTime() + (soon ? CONTINUE_MS : GMAIL_SYNC_INTERVAL_MS)),
      },
    })
    // Disconnected while this pass ran: what it just logged goes the way of the rest.
    if (!saved.count) await db.mailEvent.deleteMany({ where: { userId } })
    return { status: "synced", stats }
  } catch (error) {
    const code: GmailErrorCode = error instanceof GmailError ? error.code : "http"
    // Name only: a message from a failed write could quote the mail.
    if (!(error instanceof GmailError)) {
      console.error("Gmail sync failed", error instanceof Error ? error.name : "unknown")
    }
    const stopped = code === "reconnect" || code === "key"
    await db.gmailLink.updateMany({
      where: { userId },
      data: {
        lastErrorCode: code,
        syncingAt: null,
        nextSyncAt: stopped ? null : new Date(now().getTime() + GMAIL_SYNC_INTERVAL_MS),
      },
    })
    return { status: "failed", code }
  }
}

let nextCheckAt = 0
const CHECK_EVERY_MS = 60_000

/** Called by the worker loop: queues a sync for each mailbox that is due. */
export async function maybeSyncGmail(): Promise<void> {
  const nowMs = Date.now()
  if (nowMs < nextCheckAt) return
  nextCheckAt = nowMs + CHECK_EVERY_MS
  if (!gmailCredentials()) return
  const due = await db.gmailLink.findMany({
    where: { nextSyncAt: { lte: new Date(nowMs) } },
    select: { userId: true },
    take: 20,
  })
  for (const { userId } of due) await enqueueGmailSync(userId)
}
