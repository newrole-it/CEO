import { z } from "zod"
import db from "db"
import { isAggregatorHost } from "@newrole/offers/hosts"
import { stripPersonalData } from "@newrole/offers/hygiene"
import { isPolishBoardHost } from "@newrole/offers/polish-boards"
import { OFFER_TEXT_LIMIT } from "@newrole/cv-core/tailor"
import { readOffer, type ReadOfferDeps } from "src/server/applications/read-offer"
import { formatSalary, urlKey } from "src/server/applications/logic"
import { findJobByUrl } from "src/server/applications/service"
import type { OfferFacts, OfferOutcome } from "src/server/applications/types"
import { postingUrlCandidates } from "src/server/autofill/job-extract"
import { ingestOfferPayload } from "./ingest"
import { offerSourceSelect, readOfferText, toOfferSource } from "./text"

/**
 * The offers one person works on. They add an offer by its link: the posting is read whole
 * (src/server/applications/read-offer.ts: the ATS's API, the page's JobPosting, or the page's text
 * for them to check) and kept as their UserOffer, next to the CVs and letters written for it and
 * the application they track. An offer they tailored a CV for, or applied to, is theirs too.
 */

export type OfferTextOrigin = "full" | "pasted"

export type OfferRow = {
  jobId: string
  title: string
  company: string
  location: string | null
  url: string
  /** The posting is no longer on the company's site (as far as anyone read it) */
  closed: boolean
  addedAt: Date
  /** Characters of the person's own copy of the text; 0 without one */
  textChars: number
  cvId: string | null
  letterId: string | null
  application: { id: string; status: string } | null
}

export type OfferDetail = OfferRow & {
  text: string | null
  textOrigin: OfferTextOrigin | null
  textReadAt: Date | null
  note: string | null
  /** The site opts out of AI use: the model gets none of its text */
  withheld: boolean
  salary: string | null
  workplace: string
  /** Job's excerpt, when there is no copy of the text */
  excerpt: string
}

/** A link pasted without https:// ("www.acme.pl/kariera/1") is still a link. */
export function offerLink(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  const url = value.includes("://") ? value : `https://${value}`
  return urlKey(url) ? url : null
}

function cleanText(text: string | null | undefined): string | null {
  const value = stripPersonalData(text ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, OFFER_TEXT_LIMIT)
  return value || null
}

/**
 * A job board's or LinkedIn's page is read for the person when they tailor (a person's read in
 * @newrole/offers), kept in memory for 15 minutes and never stored: their terms forbid copying the
 * listings. Only a text the person pastes is kept for such an offer.
 */
export function readOnlyWhenTailoring(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return isPolishBoardHost(host) || isAggregatorHost(host)
  } catch {
    return false
  }
}

/** Keeps the offer in the person's list; a text, when there is one, replaces the copy they had. */
export async function keepOffer(
  userId: number,
  jobId: string,
  copy?: { text: string | null | undefined; origin: OfferTextOrigin }
): Promise<void> {
  const text = copy ? cleanText(copy.text) : null
  const textFields = text
    ? { text, textOrigin: copy!.origin, textReadAt: new Date() }
    : ({} as Record<string, never>)
  await db.userOffer.upsert({
    where: { userId_jobId: { userId, jobId } },
    create: { userId, jobId, ...textFields },
    update: textFields,
  })
}

/** The person's copy, read from the source when they have none yet. Never throws. */
async function ensureText(userId: number, jobId: string): Promise<void> {
  const saved = await db.userOffer.findUnique({
    where: { userId_jobId: { userId, jobId } },
    select: { text: true },
  })
  if (saved?.text) return
  try {
    const job = await db.job.findUnique({ where: { id: jobId }, select: offerSourceSelect })
    if (!job || readOnlyWhenTailoring(job.originalUrl)) return
    const read = await readOfferText(toOfferSource(job))
    if (read.origin === "full") await keepOffer(userId, jobId, { text: read.text, origin: "full" })
  } catch (error) {
    console.warn(
      "[offers] could not read the text of",
      jobId,
      error instanceof Error ? error.message : error
    )
  }
}

export type NewOfferCheck =
  | { kind: "invalid" }
  /** Kept for the person: known before (`added` false), or read and stored just now. */
  | {
      kind: "added"
      jobId: string
      company: string
      title: string
      added: boolean
      textChars: number
      /** A job board's or LinkedIn's offer: its text is read when they tailor, not kept */
      board: boolean
    }
  /** Not stored yet: what the page or the link said, and the page's text, for the person to check. */
  | {
      kind: "draft"
      url: string
      outcome: OfferOutcome
      facts: OfferFacts | null
      text: string
      withheld: boolean
    }

async function added(userId: number, jobId: string, isNew: boolean): Promise<NewOfferCheck> {
  const [job, copy] = await Promise.all([
    db.job.findUnique({
      where: { id: jobId },
      select: { title: true, originalUrl: true, company: { select: { name: true } } },
    }),
    db.userOffer.findUnique({ where: { userId_jobId: { userId, jobId } }, select: { text: true } }),
  ])
  return {
    kind: "added",
    jobId,
    company: job?.company.name ?? "",
    title: job?.title ?? "",
    added: isNew,
    textChars: copy?.text?.length ?? 0,
    board: job ? readOnlyWhenTailoring(job.originalUrl) : false,
  }
}

/** "Dodaj ofertę": the link read and the offer kept for the person, or a draft for them to check. */
export async function addOfferByLink(
  userId: number,
  raw: string,
  deps: ReadOfferDeps = {}
): Promise<NewOfferCheck> {
  const url = offerLink(raw)
  if (!url) return { kind: "invalid" }
  const find = deps.findByUrl ?? findJobByUrl
  for (const candidate of postingUrlCandidates(url)) {
    const job = await find(candidate)
    if (job) {
      await keepOffer(userId, job.id)
      await ensureText(userId, job.id)
      return added(userId, job.id, false)
    }
  }
  // the offers known were asked just above
  const reading = await readOffer(url, { ...deps, findByUrl: async () => null })
  const jobId = reading.facts?.jobId
  if (jobId && reading.facts?.company && reading.facts.title) {
    await keepOffer(
      userId,
      jobId,
      reading.text ? { text: reading.text, origin: "full" } : undefined
    )
    if (!reading.text && !reading.withheld) await ensureText(userId, jobId)
    return added(userId, jobId, true)
  }
  // a job board's JobPosting, read for the person: kept as its link, company and role
  const facts = reading.facts
  if (
    reading.outcome === "read" &&
    readOnlyWhenTailoring(reading.url) &&
    facts?.company &&
    facts.title
  ) {
    const saved = await confirmOffer(userId, {
      url: reading.url,
      company: facts.company,
      title: facts.title,
      location: facts.location ?? undefined,
    })
    if ("jobId" in saved) return added(userId, saved.jobId, saved.created)
  }
  return {
    kind: "draft",
    url: reading.url,
    outcome: reading.outcome,
    facts: reading.facts,
    text: reading.text ?? "",
    withheld: Boolean(reading.withheld),
  }
}

export const confirmOfferInput = z.object({
  url: z.string().max(2000),
  company: z.string().max(120),
  title: z.string().max(200),
  location: z.string().max(200).optional(),
  workplace: z.enum(["REMOTE", "HYBRID", "ONSITE"]).optional(),
  salaryText: z.string().max(120).optional(),
  /** The posting's text as the person checked it: the page's, edited or pasted */
  text: z.string().max(60_000).optional(),
  /** full: the page's text as it was read. pasted: the person wrote or changed it */
  textOrigin: z.enum(["full", "pasted"]).optional(),
})

export type ConfirmOfferInput = z.infer<typeof confirmOfferInput>

/** A draft the person checked, stored as a WEB_SEARCH offer with a `web:` board id. */
export async function confirmOffer(
  userId: number,
  input: ConfirmOfferInput,
  ingest: typeof ingestOfferPayload = ingestOfferPayload
): Promise<{ jobId: string; created: boolean } | { error: string }> {
  const url = offerLink(input.url)
  if (!url) return { error: "Not a link" }
  const result = await ingest({
    url,
    company: input.company,
    title: input.title,
    location: input.location?.trim() || undefined,
    workplace: input.workplace,
    salaryText: input.salaryText?.trim() || undefined,
    description: input.text?.trim() || undefined,
    channel: "web",
  })
  if (!result.jobId) return { error: result.message }
  await keepOffer(
    userId,
    result.jobId,
    input.text?.trim() ? { text: input.text, origin: input.textOrigin ?? "pasted" } : undefined
  )
  return { jobId: result.jobId, created: result.status === "created" }
}

const rowSelect = {
  id: true,
  title: true,
  locationText: true,
  originalUrl: true,
  canonicalUrl: true,
  status: true,
  company: { select: { name: true } },
} as const

/** Every offer the person added, tailored a document for, or applied to; newest first. */
export async function listOffers(userId: number): Promise<OfferRow[]> {
  const [kept, documents, applications] = await Promise.all([
    db.userOffer.findMany({
      where: { userId },
      select: { jobId: true, createdAt: true, text: true },
    }),
    db.cvDocument.findMany({
      where: { userId, jobId: { not: null } },
      select: { id: true, jobId: true, docType: true, createdAt: true },
    }),
    db.application.findMany({
      where: { userId, jobId: { not: null } },
      select: { id: true, jobId: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ])
  const since = new Map<string, Date>()
  const note = (jobId: string | null, at: Date) => {
    if (!jobId) return
    const known = since.get(jobId)
    if (!known || at < known) since.set(jobId, at)
  }
  for (const row of kept) note(row.jobId, row.createdAt)
  for (const row of documents) note(row.jobId, row.createdAt)
  for (const row of applications) note(row.jobId, row.createdAt)
  const jobs = await db.job.findMany({
    where: { id: { in: [...since.keys()] } },
    select: rowSelect,
  })
  return jobs
    .map((job) => {
      const copy = kept.find((row) => row.jobId === job.id)
      const application = applications.find((row) => row.jobId === job.id)
      return {
        jobId: job.id,
        title: job.title,
        company: job.company.name,
        location: job.locationText,
        url: job.originalUrl || job.canonicalUrl,
        closed: job.status === "CLOSED",
        addedAt: since.get(job.id)!,
        textChars: copy?.text?.length ?? 0,
        cvId: documents.find((row) => row.jobId === job.id && row.docType === "CV")?.id ?? null,
        letterId:
          documents.find((row) => row.jobId === job.id && row.docType === "LETTER")?.id ?? null,
        application: application ? { id: application.id, status: application.status } : null,
      }
    })
    .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
}

/** One of the person's offers with their copy of its text. Null when the offer is unknown. */
export async function getOffer(userId: number, jobId: string): Promise<OfferDetail | null> {
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: {
      ...rowSelect,
      llmOptOut: true,
      salaryMin: true,
      salaryMax: true,
      salaryCurrency: true,
      workplaceType: true,
      descriptionText: true,
      summary: true,
    },
  })
  if (!job) return null
  const [copy, documents, application] = await Promise.all([
    db.userOffer.findUnique({ where: { userId_jobId: { userId, jobId } } }),
    db.cvDocument.findMany({
      where: { userId, jobId },
      select: { id: true, docType: true, createdAt: true },
    }),
    db.application.findFirst({
      where: { userId, jobId },
      select: { id: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ])
  const firstDocument = documents.map((row) => row.createdAt).sort((a, b) => +a - +b)[0]
  return {
    jobId: job.id,
    title: job.title,
    company: job.company.name,
    location: job.locationText,
    url: job.originalUrl || job.canonicalUrl,
    closed: job.status === "CLOSED",
    addedAt: copy?.createdAt ?? firstDocument ?? application?.createdAt ?? new Date(),
    textChars: copy?.text?.length ?? 0,
    cvId: documents.find((row) => row.docType === "CV")?.id ?? null,
    letterId: documents.find((row) => row.docType === "LETTER")?.id ?? null,
    application: application ? { id: application.id, status: application.status } : null,
    text: copy?.text ?? null,
    textOrigin: (copy?.textOrigin as OfferTextOrigin | null) ?? null,
    textReadAt: copy?.textReadAt ?? null,
    note: copy?.note ?? null,
    withheld: job.llmOptOut,
    salary: formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency),
    workplace: job.workplaceType,
    excerpt: job.descriptionText || (job.summary === job.title ? "" : job.summary),
  }
}

/** The person's own words for the offer's text, or a note on it. */
export async function updateOffer(
  userId: number,
  jobId: string,
  input: { text?: string | null; note?: string | null }
): Promise<void> {
  const known = await db.job.count({ where: { id: jobId } })
  if (!known) throw new Error("job-not-found")
  const data: {
    text?: string | null
    textOrigin?: string | null
    textReadAt?: Date
    note?: string | null
  } = {}
  if (input.text !== undefined) {
    const text = cleanText(input.text)
    data.text = text
    data.textOrigin = text ? "pasted" : null
    data.textReadAt = new Date()
  }
  if (input.note !== undefined) data.note = input.note?.trim().slice(0, 4000) || null
  await db.userOffer.upsert({
    where: { userId_jobId: { userId, jobId } },
    create: { userId, jobId, ...data },
    update: data,
  })
}

/** Read the offer from its source again and keep the text. False when nothing could be read. */
export async function refreshOfferText(
  userId: number,
  jobId: string
): Promise<"kept" | "board" | "failed"> {
  const job = await db.job.findUnique({ where: { id: jobId }, select: offerSourceSelect })
  if (!job) return "failed"
  if (readOnlyWhenTailoring(job.originalUrl)) return "board"
  const read = await readOfferText(toOfferSource(job))
  if (read.origin !== "full") return "failed"
  await keepOffer(userId, jobId, { text: read.text, origin: "full" })
  return "kept"
}

/** Out of the person's list. The documents written for it and the application stay. */
export async function removeOffer(userId: number, jobId: string): Promise<void> {
  await db.userOffer.deleteMany({ where: { userId, jobId } })
}
