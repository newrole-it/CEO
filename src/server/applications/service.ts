import { Prisma } from "@prisma/client"
import db from "db"
import {
  isApplicationStatus,
  type ApplicationSource,
  type ApplicationStatus,
  type Channel,
} from "src/shared/applications"
import {
  ApplicationError,
  applicationAnswers,
  asStatus,
  cleanMultiline,
  cleanText,
  coalesceEdit,
  compareApplications,
  computeStats,
  formatSalary,
  groupStatuses,
  isSource,
  isUntouched,
  LIMITS,
  matchesQuery,
  mergeFormAnswers,
  parseFormAnswers,
  planUpdate,
  statedSalaryFrom,
  urlKey,
} from "./logic"
import { parseAspects } from "src/shared/feedback-aspects"
import {
  computeInsights,
  type Insights,
  type InsightsInput,
  type InsightsOptions,
} from "./insights"
import { scheduleSheetSync } from "./sheet"
import type {
  ApplicationDetail,
  ApplicationEventType,
  ApplicationEventView,
  ApplicationGroup,
  ApplicationStats,
  ApplicationView,
  FormAnswer,
} from "./types"

export { ApplicationError, urlKey }
export type { ApplicationDetail, ApplicationStats, ApplicationView, Insights, InsightsInput }

type Row = Prisma.ApplicationGetPayload<{}>

export function toApplicationView(row: Row): ApplicationView {
  return {
    id: row.id,
    jobId: row.jobId,
    company: row.company,
    title: row.title,
    url: row.url,
    location: row.location,
    salaryText: row.salaryText,
    statedSalary: row.statedSalary ?? null,
    status: isApplicationStatus(row.status) ? row.status : "APPLIED",
    stageNote: row.stageNote,
    closedAtStage: asStatus(row.closedAtStage),
    appliedAt: row.appliedAt,
    statusChangedAt: row.statusChangedAt,
    nextStep: row.nextStep,
    nextStepAt: row.nextStepAt,
    contact: row.contact,
    notes: row.notes,
    source: isSource(row.source) ? row.source : "manual",
    cvDocumentId: row.cvDocumentId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const EVENT_TYPES: ApplicationEventType[] = [
  "created",
  "status",
  "note",
  "next-step",
  "answers",
  "edit",
  "mail",
]

function toEventView(row: Prisma.ApplicationEventGetPayload<{}>): ApplicationEventView {
  return {
    id: row.id,
    type: (EVENT_TYPES as string[]).includes(row.type)
      ? (row.type as ApplicationEventType)
      : "edit",
    fromStatus: asStatus(row.fromStatus),
    toStatus: asStatus(row.toStatus),
    note: row.note,
    channel:
      row.channel === "mcp" || row.channel === "extension" || row.channel === "gmail"
        ? row.channel
        : "web",
    at: row.at,
  }
}

const jobSelect = {
  id: true,
  title: true,
  originalUrl: true,
  canonicalUrl: true,
  locationText: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  company: { select: { name: true } },
} satisfies Prisma.JobSelect

export type IndexedJob = Prisma.JobGetPayload<{ select: typeof jobSelect }>

function jobUrl(job: IndexedJob): string {
  return job.originalUrl || job.canonicalUrl
}

export function findJobById(id: string): Promise<IndexedJob | null> {
  return db.job.findUnique({ where: { id }, select: jobSelect })
}

/** The indexed offer behind a URL: exact canonical/original URL first, then the same urlKey. */
export async function findJobByUrl(url: string): Promise<IndexedJob | null> {
  const key = urlKey(url)
  if (!key) return null
  const raw = url.trim()
  const variants = [...new Set([raw, raw.replace(/\/+$/, ""), `${raw.replace(/\/+$/, "")}/`])]
  const exact = await db.job.findFirst({
    where: { OR: [{ canonicalUrl: { in: variants } }, { originalUrl: { in: variants } }] },
    orderBy: { lastSeenAt: "desc" },
    select: jobSelect,
  })
  if (exact) return exact
  const host = key.split("/")[0]
  const rest = key.slice(host.length)
  if (!rest) return null
  const candidates = await db.job.findMany({
    where: {
      OR: [
        { canonicalUrl: { contains: key, mode: "insensitive" } },
        { originalUrl: { contains: key, mode: "insensitive" } },
      ],
    },
    orderBy: { lastSeenAt: "desc" },
    take: 20,
    select: jobSelect,
  })
  return (
    candidates.find((job) => urlKey(job.canonicalUrl) === key || urlKey(job.originalUrl) === key) ??
    null
  )
}

/** Marks the offer as applied in the feed too (OfferFeedback), keeping what was liked about it. */
async function markJobApplied(
  tx: Prisma.TransactionClient,
  userId: number,
  jobId: string,
  channel: Channel
) {
  const previous = await tx.offerFeedback.findUnique({
    where: { userId_jobId: { userId, jobId } },
    select: { verdict: true },
  })
  if (previous?.verdict === "APPLIED") return
  const feedbackChannel = channel === "mcp" ? "mcp" : "web"
  await tx.offerFeedback.upsert({
    where: { userId_jobId: { userId, jobId } },
    create: { userId, jobId, verdict: "APPLIED", channel: feedbackChannel },
    update: { verdict: "APPLIED", channel: feedbackChannel },
  })
  await tx.jobMatch.updateMany({
    where: { jobId, savedSearch: { userId } },
    data: { interestedAt: new Date(), dismissedAt: null },
  })
}

/** Serialises creates per person so the extension and an "Aplikowano" click cannot race. */
const LOCK_NAMESPACE = 7303

export async function createApplication(input: {
  userId: number
  jobId?: string | null
  url?: string | null
  company?: string
  title?: string
  location?: string | null
  salaryText?: string | null
  status?: ApplicationStatus
  appliedAt?: Date
  notes?: string | null
  source: ApplicationSource
  channel: Channel
  cvDocumentId?: string | null
}): Promise<{ application: ApplicationView; created: boolean }> {
  const { userId } = input
  if (input.status !== undefined && !isApplicationStatus(input.status)) {
    throw new ApplicationError("invalid-status", `Unknown status: ${String(input.status)}`)
  }
  const givenUrl = cleanText(input.url, LIMITS.url)
  if (givenUrl && !urlKey(givenUrl)) {
    throw new ApplicationError("invalid-url", "The link must be an http(s) URL.")
  }
  let job: IndexedJob | null = null
  if (input.jobId) {
    job = await findJobById(input.jobId)
    if (!job) throw new ApplicationError("job-not-found", "This offer is not in the index.")
  } else if (givenUrl) {
    job = await findJobByUrl(givenUrl)
  }
  if (input.cvDocumentId) await assertCv(userId, input.cvDocumentId)
  // applying with no CV named: the one written for this offer, when there is one
  const tailored =
    job && !input.cvDocumentId
      ? await db.cvDocument.findFirst({
          where: { userId, jobId: job.id, docType: "CV" },
          select: { id: true },
        })
      : null
  const cvDocumentId = input.cvDocumentId ?? tailored?.id ?? null

  const url = givenUrl ?? (job ? jobUrl(job) : null)
  const key = url ? urlKey(url) : null
  const fromJob = job
    ? {
        company: job.company.name,
        title: job.title,
        location: job.locationText,
        salaryText: formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency),
      }
    : null
  const company = cleanText(input.company, LIMITS.company) ?? fromJob?.company ?? null
  const title = cleanText(input.title, LIMITS.title) ?? fromJob?.title ?? null
  const location = cleanText(input.location, LIMITS.location) ?? fromJob?.location ?? null
  const salaryText = cleanText(input.salaryText, LIMITS.salaryText) ?? fromJob?.salaryText ?? null
  const notes = cleanMultiline(input.notes, LIMITS.notes)

  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::int, ${userId}::int)`
    const existing =
      (job
        ? await tx.application.findFirst({
            where: { userId, jobId: job.id },
            orderBy: { createdAt: "asc" },
          })
        : null) ??
      (key
        ? await tx.application.findFirst({
            where: { userId, urlKey: key },
            orderBy: { createdAt: "asc" },
          })
        : null)

    if (existing) {
      const fill: Prisma.ApplicationUncheckedUpdateInput = {}
      if (job && !existing.jobId) fill.jobId = job.id
      if (url && !existing.url) {
        fill.url = url
        fill.urlKey = key
      }
      if (location && !existing.location) fill.location = location
      if (salaryText && !existing.salaryText) fill.salaryText = salaryText
      if (notes && !existing.notes) fill.notes = notes
      if (cvDocumentId && !existing.cvDocumentId) fill.cvDocumentId = cvDocumentId
      const row = Object.keys(fill).length
        ? await tx.application.update({ where: { id: existing.id }, data: fill })
        : existing
      if (job) await markJobApplied(tx, userId, job.id, input.channel)
      return { row, created: false, changed: Object.keys(fill).length > 0 }
    }

    if (!company || !title) {
      throw new ApplicationError(
        "missing-fields",
        "Company and role are required when the offer is not in the index."
      )
    }
    const status = input.status ?? "APPLIED"
    const now = new Date()
    const row = await tx.application.create({
      data: {
        userId,
        jobId: job?.id ?? null,
        company,
        title,
        url,
        urlKey: key,
        location,
        salaryText,
        status,
        appliedAt: input.appliedAt ?? now,
        statusChangedAt: now,
        notes,
        source: input.source,
        cvDocumentId,
        events: {
          create: [{ type: "created", toStatus: status, channel: input.channel, at: now }],
        },
      },
    })
    if (job) await markJobApplied(tx, userId, job.id, input.channel)
    return { row, created: true, changed: true }
  })

  if (result.changed) await scheduleSheetSync(userId)
  return { application: toApplicationView(result.row), created: result.created }
}

/** "Aplikowano" on an offer: the application for it, created when missing. */
export async function ensureApplicationForJob(
  userId: number,
  jobId: string,
  channel: Channel
): Promise<ApplicationView> {
  const source: ApplicationSource = channel === "web" ? "nowarola" : channel
  const { application } = await createApplication({ userId, jobId, source, channel })
  return application
}

/** Undo of "Aplikowano": deletes the application only when nothing was added to it since. */
export async function removeUntouchedApplicationForJob(
  userId: number,
  jobId: string
): Promise<boolean> {
  const rows = await db.application.findMany({
    where: { userId, jobId },
    include: { events: { select: { type: true } }, _count: { select: { answers: true } } },
  })
  const doomed = rows.filter((row) => isUntouched(row, row.events, row._count.answers))
  if (!doomed.length) return false
  await db.application.deleteMany({ where: { userId, id: { in: doomed.map((row) => row.id) } } })
  await scheduleSheetSync(userId)
  return true
}

async function assertCv(userId: number, cvDocumentId: string) {
  const cv = await db.cvDocument.findFirst({
    where: { id: cvDocumentId, userId },
    select: { id: true },
  })
  if (!cv) throw new ApplicationError("cv-not-found", "This CV does not exist.")
}

async function ownApplication(userId: number, id: string): Promise<Row> {
  const row = await db.application.findFirst({ where: { id, userId } })
  if (!row) throw new ApplicationError("not-found", "Application not found.")
  return row
}

export async function updateApplication(input: {
  userId: number
  id: string
  channel: Channel
  status?: ApplicationStatus
  stageNote?: string | null
  nextStep?: string | null
  nextStepAt?: Date | null
  contact?: string | null
  notes?: string | null
  company?: string
  title?: string
  url?: string | null
  location?: string | null
  salaryText?: string | null
  statedSalary?: string | null
  appliedAt?: Date
  cvDocumentId?: string | null
}): Promise<ApplicationView> {
  const { userId, id, channel, ...patch } = input
  const current = await ownApplication(userId, id)
  if (patch.cvDocumentId) await assertCv(userId, patch.cvDocumentId)
  const now = new Date()
  const plan = planUpdate(current, patch, now)
  if (!plan.events.length && !Object.keys(plan.data).length) return toApplicationView(current)

  const row = await db.$transaction(async (tx) => {
    const updated = await tx.application.update({ where: { id }, data: plan.data })
    for (const event of plan.events) {
      if (event.type === "edit") {
        const last = await tx.applicationEvent.findFirst({
          where: { applicationId: id },
          orderBy: { at: "desc" },
        })
        const merged = coalesceEdit(last, channel, plan.edited, now)
        if (last && merged) {
          await tx.applicationEvent.update({
            where: { id: last.id },
            data: { note: merged, at: now },
          })
          continue
        }
      }
      await tx.applicationEvent.create({
        data: {
          applicationId: id,
          type: event.type,
          fromStatus: event.fromStatus ?? null,
          toStatus: event.toStatus ?? null,
          note: event.note ?? null,
          channel,
          at: now,
        },
      })
    }
    return updated
  })
  await scheduleSheetSync(userId)
  return toApplicationView(row)
}

/**
 * Keeps what was sent in a form on its application, with the salary stated in it. Unlike the
 * answer bank, this holds every answer for every application, even one given word for word before.
 */
export async function saveFormAnswers(
  userId: number,
  id: string,
  answers: FormAnswer[],
  channel: Channel
): Promise<void> {
  if (!answers.length) return
  const current = await ownApplication(userId, id)
  const stated = statedSalaryFrom(answers)
  await db.$transaction([
    db.application.update({
      where: { id },
      data: {
        formAnswers: mergeFormAnswers(parseFormAnswers(current.formAnswers), answers),
        ...(stated ? { statedSalary: stated } : {}),
      },
    }),
    db.applicationEvent.create({ data: { applicationId: id, type: "answers", channel } }),
  ])
  await scheduleSheetSync(userId)
}

/** Appends a note (blank line between notes) and puts it on the timeline. */
export async function addApplicationNote(
  userId: number,
  id: string,
  note: string,
  channel: Channel
): Promise<ApplicationView> {
  const text = cleanMultiline(note, LIMITS.note)
  const current = await ownApplication(userId, id)
  if (!text) return toApplicationView(current)
  const notes = cleanMultiline(current.notes ? `${current.notes}\n\n${text}` : text, LIMITS.notes)
  const [row] = await db.$transaction([
    db.application.update({ where: { id }, data: { notes } }),
    db.applicationEvent.create({ data: { applicationId: id, type: "note", note: text, channel } }),
  ])
  await scheduleSheetSync(userId)
  return toApplicationView(row)
}

export async function deleteApplication(userId: number, id: string): Promise<void> {
  const { count } = await db.application.deleteMany({ where: { id, userId } })
  if (!count) throw new ApplicationError("not-found", "Application not found.")
  await scheduleSheetSync(userId)
}

export async function listApplications(
  userId: number,
  opts: { group?: ApplicationGroup; q?: string; limit?: number } = {}
): Promise<ApplicationView[]> {
  const statuses = groupStatuses(opts.group)
  const take = Math.max(1, Math.min(2000, Math.round(opts.limit ?? 1000)))
  const rows = await db.application.findMany({
    where: { userId, ...(statuses ? { status: { in: [...statuses] } } : {}) },
    orderBy: { appliedAt: "desc" },
  })
  return rows
    .filter((row) => matchesQuery(row, opts.q))
    .sort(compareApplications)
    .slice(0, take)
    .map(toApplicationView)
}

export async function getApplication(
  userId: number,
  id: string
): Promise<ApplicationDetail | null> {
  const row = await db.application.findFirst({
    where: { id, userId },
    include: {
      events: { orderBy: { at: "asc" } },
      answers: {
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, question: true, answer: true },
      },
      cvDocument: { select: { id: true, title: true } },
    },
  })
  if (!row) return null
  const { events, answers, cvDocument, ...rest } = row
  return {
    ...toApplicationView(rest),
    events: events.map(toEventView),
    answers: applicationAnswers(parseFormAnswers(rest.formAnswers), answers),
    cv: cvDocument ? { id: cvDocument.id, title: cvDocument.title } : null,
  }
}

/** The application for a posting URL: same urlKey, or the indexed offer behind the URL. */
export async function findApplicationByUrl(
  userId: number,
  url: string
): Promise<ApplicationView | null> {
  const key = urlKey(url)
  if (!key) return null
  const byKey = await db.application.findFirst({
    where: { userId, urlKey: key },
    orderBy: { createdAt: "asc" },
  })
  if (byKey) return toApplicationView(byKey)
  const job = await findJobByUrl(url)
  if (!job) return null
  const byJob = await db.application.findFirst({
    where: { userId, jobId: job.id },
    orderBy: { createdAt: "asc" },
  })
  return byJob ? toApplicationView(byJob) : null
}

export async function applicationStats(userId: number): Promise<ApplicationStats> {
  const rows = await db.application.findMany({
    where: { userId },
    select: { status: true, closedAtStage: true, nextStepAt: true },
  })
  return computeStats(rows, new Date())
}

/** Picked tags, not the "-key" mute markers that dropSignal stores in the same list. */
function hasPickedTags(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some((item) => typeof item === "string" && item.trim() && !item.startsWith("-"))
  )
}

/**
 * Everything the statistics page and `applications_stats` compute from: applications with their
 * timelines, offer decisions and the answer bank. Plain rows with ISO dates, so the page can
 * recompute on the client when the range changes.
 */
export async function loadInsightsInput(userId: number): Promise<InsightsInput> {
  const [applications, feedback, answers] = await Promise.all([
    db.application.findMany({
      where: { userId },
      orderBy: { appliedAt: "desc" },
      select: {
        id: true,
        company: true,
        title: true,
        status: true,
        closedAtStage: true,
        appliedAt: true,
        statusChangedAt: true,
        nextStep: true,
        nextStepAt: true,
        source: true,
        jobId: true,
        events: {
          orderBy: { at: "asc" },
          select: { type: true, toStatus: true, at: true, channel: true },
        },
      },
    }),
    db.offerFeedback.findMany({
      where: { userId },
      select: { verdict: true, createdAt: true, aspects: true, tags: true },
    }),
    db.answer.findMany({ where: { userId }, select: { origin: true, useCount: true } }),
  ])
  return {
    applications: applications.map((row) => ({
      id: row.id,
      company: row.company,
      title: row.title,
      status: row.status,
      closedAtStage: row.closedAtStage,
      appliedAt: row.appliedAt.toISOString(),
      statusChangedAt: row.statusChangedAt.toISOString(),
      nextStep: row.nextStep,
      nextStepAt: row.nextStepAt?.toISOString() ?? null,
      source: row.source,
      jobId: row.jobId,
      events: row.events.map((event) => ({
        type: event.type,
        toStatus: event.toStatus,
        at: event.at.toISOString(),
        channel: event.channel,
      })),
    })),
    decisions: feedback.map((row) => ({
      verdict: row.verdict,
      createdAt: row.createdAt.toISOString(),
      withReason: parseAspects(row.aspects).length > 0 || hasPickedTags(row.tags),
    })),
    answers: answers.map((row) => ({ origin: row.origin, useCount: row.useCount })),
  }
}

export async function applicationInsights(
  userId: number,
  opts: InsightsOptions = {}
): Promise<Insights> {
  return computeInsights(await loadInsightsInput(userId), opts)
}
