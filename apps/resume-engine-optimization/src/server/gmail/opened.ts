import { createHash } from "crypto"
import { z } from "zod"
import db from "db"
import {
  ApplicationError,
  toApplicationView,
  updateApplication,
} from "src/server/applications/service"
import type { ApplicationView } from "src/server/applications/types"
import { createLlmClient, type LlmClient } from "src/server/llm/client"
import {
  ACTIVE_STATUSES,
  APPLICATION_STATUSES,
  PICKABLE_STATUSES,
  statusLabel,
  type ApplicationStatus,
} from "src/shared/applications"
import { MAIL_SIGNALS, type MailSignal } from "src/shared/gmail"
import { systemTier, toScopedApp } from "./allowlist"
import { classifyByModel, classifyByRules, type Reading } from "./classify"
import { parseFrom } from "./gate"
import { matchApplication } from "./match"
import { targetStatus } from "./policy"
import { addMailToTimeline, MAIL_RETENTION_MS } from "./service"
import { redact, stripQuoted } from "./text"
import type { Sender } from "./types"

/**
 * One message the person has open in Gmail and sends from the extension. Nothing here searches or
 * opens a mailbox: the person picked the message, and nothing changes until they confirm the
 * application and the status in the popup. See docs/product/plan-gmail.md.
 */

const MAX_TEXT = 20_000
/** Applications offered in the popup, newest first after the likely ones */
const MAX_CHOICES = 200
/** Outcomes that already put this message on a timeline */
const USED = ["APPLIED", "NOTED", "CREATED"]

export const OpenedMailSchema = z.object({
  /** Gmail's id of the message, when the page shows it */
  messageId: z.string().trim().max(200).nullish(),
  from: z.object({
    address: z.string().trim().max(320),
    name: z.string().max(400).nullish(),
  }),
  subject: z.string().max(4000),
  /** Read from the page in the person's own time zone; missing when the date could not be read */
  receivedAt: z.string().datetime({ offset: true }).nullish(),
  text: z.string().max(MAX_TEXT * 5),
})

export type OpenedMail = z.infer<typeof OpenedMailSchema>

export const ApplyMailSchema = z.object({
  mail: OpenedMailSchema.omit({ text: true }),
  applicationId: z.string().trim().min(1).max(100),
  /** null: only a timeline entry, the status stays */
  status: z.enum(APPLICATION_STATUSES).nullable(),
  signal: z.enum(MAIL_SIGNALS),
  reader: z.enum(["rules", "model"]),
  evidence: z.string().max(400).nullish(),
})

export type ApplyMailInput = z.infer<typeof ApplyMailSchema>

type Clean = {
  messageId: string
  sender: Sender
  subject: string
  receivedAt: Date
}

function cleanSubject(subject: string): string {
  return redact(subject.slice(0, 1000)).replace(/\s+/g, " ").trim().slice(0, 300)
}

/** The page's date unless it is missing or in the future; then now. */
function receivedAt(value: string | null | undefined, now: Date): Date {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) && date <= now ? date : now
}

/** Gmail's id when the page has one, else a stable one from what the message says about itself. */
function messageKey(mail: Omit<OpenedMail, "text">, address: string, subject: string): string {
  const id = mail.messageId?.replace(/^#/, "").trim()
  if (id && /^[\w:.-]{1,200}$/.test(id)) return id
  const hash = createHash("sha256")
    .update([address, subject, mail.receivedAt ?? ""].join("\n"))
    .digest("hex")
  return `ext:${hash.slice(0, 32)}`
}

function cleanMail(mail: Omit<OpenedMail, "text">, now: Date): Clean {
  const parsed = parseFrom(mail.from.address)
  if (!parsed) throw new ApplicationError("missing-fields", "The sender's address is missing.")
  const name = (mail.from.name ?? "").replace(/\s+/g, " ").trim().slice(0, 200)
  const sender: Sender = { ...parsed, name: /[@<>]/.test(name) ? "" : name }
  const subject = cleanSubject(mail.subject)
  return {
    messageId: messageKey(mail, sender.address, subject),
    sender,
    subject,
    receivedAt: receivedAt(mail.receivedAt, now),
  }
}

async function readMail(
  input: { sender: Sender; subject: string; text: string },
  llm: LlmClient | null
): Promise<Reading> {
  const rules = classifyByRules(input.subject, input.text)
  if (rules.sure || !llm) return rules
  const model = await classifyByModel(
    { senderDomain: input.sender.domain, subject: input.subject, text: input.text },
    llm
  )
  return model ?? rules
}

export type MailChoice = {
  id: string
  company: string
  title: string
  status: string
  statusLabel: string
  /** The sender or the text points at it */
  likely: boolean
}

export type MailPreview = {
  mail: { messageId: string; from: string; subject: string; receivedAt: string }
  reading: {
    signal: MailSignal
    sure: boolean
    reader: "rules" | "model"
    evidence: string | null
  }
  /** What the popup selects first; the person can pick anything else */
  suggestion: { applicationId: string | null; status: ApplicationStatus | null }
  choices: MailChoice[]
  statuses: { value: ApplicationStatus; label: string }[]
  /** This message is already on the timeline of this application */
  used: { applicationId: string | null; company: string | null; title: string | null } | null
}

/**
 * What the message says and which application it is likely about. Writes nothing. The body is
 * redacted first and is gone when this returns; the model sees it only when the rules cannot call it.
 */
export async function previewOpenedMail(
  userId: number,
  mail: OpenedMail,
  deps: { llm?: LlmClient | null; now?: Date } = {}
): Promise<MailPreview> {
  const now = deps.now ?? new Date()
  const clean = cleanMail(mail, now)
  const text = redact(stripQuoted(mail.text.slice(0, MAX_TEXT * 5))).slice(0, MAX_TEXT)
  const llm = deps.llm !== undefined ? deps.llm : createLlmClient()

  const [reading, rows, used] = await Promise.all([
    readMail({ sender: clean.sender, subject: clean.subject, text }, llm),
    db.application.findMany({
      where: { userId },
      orderBy: { appliedAt: "desc" },
      take: MAX_CHOICES,
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
    }),
    db.mailEvent.findFirst({
      where: { userId, messageId: clean.messageId, outcome: { in: USED } },
      select: { application: { select: { id: true, company: true, title: true } } },
    }),
  ])

  // Only processes still in play are guessed at; a closed one can still be picked by hand.
  const open = rows.filter((row) =>
    [...ACTIVE_STATUSES, "GHOSTED"].includes(row.status as ApplicationStatus)
  )
  const tier = systemTier(clean.sender.address, clean.sender.domain) ?? "company"
  const match = matchApplication(
    { sender: clean.sender, tier, subject: clean.subject, text, receivedAt: clean.receivedAt },
    open.map(toScopedApp)
  )
  const likely = new Set(match.candidates.map((app) => app.id))
  const picked = match.application ?? match.candidates[0] ?? null
  const ordered = [
    ...match.candidates.flatMap((app) => rows.filter((row) => row.id === app.id)),
    ...rows.filter((row) => !likely.has(row.id)),
  ]

  return {
    mail: {
      messageId: clean.messageId,
      from: clean.sender.address,
      subject: clean.subject,
      receivedAt: clean.receivedAt.toISOString(),
    },
    reading: {
      signal: reading.signal,
      sure: reading.sure,
      reader: reading.reader,
      evidence: reading.evidence,
    },
    suggestion: {
      applicationId: picked?.id ?? null,
      status: picked ? targetStatus(reading.signal, picked.status) : null,
    },
    choices: ordered.map((row) => ({
      id: row.id,
      company: row.company,
      title: row.title,
      status: row.status,
      statusLabel: statusLabel(row.status),
      likely: likely.has(row.id),
    })),
    statuses: PICKABLE_STATUSES.map((value) => ({ value, label: statusLabel(value) })),
    used: used
      ? {
          applicationId: used.application?.id ?? null,
          company: used.application?.company ?? null,
          title: used.application?.title ?? null,
        }
      : null,
  }
}

export type ApplyMailResult =
  { status: "saved"; application: ApplicationView; changed: boolean } | { status: "used" }

/**
 * The person's choice from the popup: the message goes on the timeline of the application they
 * picked, and the status changes to the one they picked. Theirs to decide, so any status goes.
 */
export async function applyOpenedMail(
  userId: number,
  input: ApplyMailInput,
  now = new Date()
): Promise<ApplyMailResult> {
  const clean = cleanMail(input.mail, now)
  const row = await db.application.findFirst({ where: { id: input.applicationId, userId } })
  if (!row) throw new ApplicationError("not-found", "Application not found.")
  const used = await db.mailEvent.findFirst({
    where: { userId, messageId: clean.messageId, outcome: { in: USED } },
    select: { id: true },
  })
  if (used) return { status: "used" }

  const changed = Boolean(input.status && input.status !== row.status)
  const application =
    changed && input.status
      ? await updateApplication({ userId, id: row.id, channel: "gmail", status: input.status })
      : toApplicationView(row)
  await addMailToTimeline(row.id, clean.subject, clean.receivedAt)

  const evidence = input.evidence ? redact(input.evidence).slice(0, 160) : null
  const record = {
    applicationId: row.id,
    fromAddress: clean.sender.address,
    subject: clean.subject,
    receivedAt: clean.receivedAt,
    signal: input.signal,
    reader: input.reader,
    evidence: input.signal === "OTHER" ? null : evidence,
    // APPLIED is what the tracker can undo for a few days.
    outcome: changed ? "APPLIED" : "NOTED",
    fromStatus: changed ? row.status : null,
    toStatus: changed ? input.status : null,
    company: null,
    title: null,
    // The person read it and chose; Gmail's verdict on the sender is not known here.
    authenticated: false,
  }
  // A message an earlier inbox check left waiting is the same message: this decides it.
  await db.mailEvent.upsert({
    where: { userId_messageId: { userId, messageId: clean.messageId } },
    create: { userId, messageId: clean.messageId, ...record },
    update: record,
  })
  await db.mailEvent.deleteMany({
    where: { userId, createdAt: { lt: new Date(now.getTime() - MAIL_RETENTION_MS) } },
  })
  return { status: "saved", application, changed }
}
