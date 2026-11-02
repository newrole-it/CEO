import { Prisma } from "@prisma/client"
import db from "db"
import type { BoardList } from "src/server/adapters/types"
import { excerpt } from "src/server/crawler/hygiene"
import { safeCanonicalUrl, sha256 } from "src/server/jobs/dedupe"
import { normalizeCompanyName, normalizeWhitespace } from "src/server/jobs/normalize"
import { isUniqueViolation } from "src/server/jobs/prisma-errors"
import type { ListedJob, SourceType } from "src/shared/schemas"
import { extractAtsKey } from "../../../matching/dedupe"
import { classificationFields, rememberCompanyTech } from "src/server/classify/persist"
import { keepExternalPay } from "src/server/discovery/offer-search"
import { APP_TO_SOURCE } from "src/server/matching/sources"
import { nextStatus } from "./schedule"

export type IndexBoard = {
  provider: SourceType
  boardId: string
  companyName: string
  careersUrl: string
}

export function identityFor(job: ListedJob): string {
  const canonical = safeCanonicalUrl(job.originalUrl)
  const source = APP_TO_SOURCE[job.sourceType] ?? "company_site"
  const key = extractAtsKey(canonical, source, job.externalId, job.sourceBoardId)
  const company = (job.companyName || "").trim().toLowerCase()
  const board = (job.sourceBoardId || "").toLowerCase()
  const named = [`${source}:${company}`, `${source}:${board}:${company}`]
  if (key && company && named.includes(key.toLowerCase())) return `url:${canonical}`
  return key ?? `url:${canonical}`
}

/**
 * The key a job had before company_site ids were scoped by board ("company_site:106", now
 * "company_site:tutlo:106"). Null when the job's key is not a scoped company_site key.
 */
export function unscopedIdentity(
  identityKey: string,
  sourceBoardId?: string | null
): string | null {
  const board = (sourceBoardId || "").toLowerCase()
  const prefix = `company_site:${board}:`
  if (!board || !identityKey.startsWith(prefix)) return null
  return `company_site:${identityKey.slice(prefix.length)}`
}

/** A row stored under the unscoped key, if it is this board's own row and not another employer's. */
async function unscopedRow(identityKey: string, sourceBoardId?: string | null) {
  const legacy = unscopedIdentity(identityKey, sourceBoardId)
  if (!legacy) return null
  const row = await db.job.findUnique({ where: { identityKey: legacy } })
  if (!row || (row.sourceBoardId || "").toLowerCase() !== (sourceBoardId || "").toLowerCase()) {
    return null
  }
  return row
}

async function companyFor(name: string) {
  const companyName = normalizeWhitespace(name) || "Unknown company"
  const normalizedName = normalizeCompanyName(companyName) || companyName.toLowerCase()
  const existing = await db.company.findUnique({ where: { normalizedName } })
  if (existing) return existing
  try {
    return await db.company.create({ data: { name: companyName, normalizedName } })
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const again = await db.company.findUnique({ where: { normalizedName } })
    if (!again) throw error
    return again
  }
}

/** Written while a board is being read, then replaced by the fetch note. */
export const INDEXING_NOTE = "Indexing"

export async function noteIndexStart(board: IndexBoard, now: Date) {
  const page = await ensureCareerPage(board, board.companyName, now)
  await db.careerPage.update({
    where: { id: page.id },
    data: { lastCheckedAt: now, fetchNote: INDEXING_NOTE },
  })
  return page
}

export async function ensureCareerPage(board: IndexBoard, companyName: string, now: Date) {
  const company = await companyFor(companyName)
  return db.careerPage.upsert({
    where: {
      provider_providerBoardId: { provider: board.provider, providerBoardId: board.boardId },
    },
    update: { companyId: company.id },
    create: {
      companyId: company.id,
      url: board.careersUrl,
      normalizedUrl: safeCanonicalUrl(board.careersUrl),
      provider: board.provider,
      providerBoardId: board.boardId,
      resolutionStatus: "RESOLVED_ATS",
      confidence: 1,
      lastCheckedAt: now,
    },
  })
}

export async function knownCanonicals(careerPageId: string): Promise<Set<string>> {
  const rows = await db.job.findMany({
    where: { careerPageId, status: { in: ["ACTIVE", "POSSIBLY_CLOSED"] } },
    select: { canonicalUrl: true, originalUrl: true },
  })
  const urls = new Set<string>()
  for (const row of rows) {
    urls.add(row.canonicalUrl)
    urls.add(safeCanonicalUrl(row.originalUrl))
  }
  return urls
}

async function writeJob(job: ListedJob, careerPageId: string, companyId: string, now: Date) {
  const canonical = safeCanonicalUrl(job.originalUrl)
  const identityKey = identityFor(job)
  const existing =
    (await db.job.findUnique({ where: { identityKey } })) ??
    (await unscopedRow(identityKey, job.sourceBoardId))
  // Some lists carry no text by design (Greenhouse omits content; the offer page is read
  // later). An empty listing keeps the stored text and what is derived from it.
  const description = excerpt(job.descriptionText || "") || existing?.descriptionText || ""
  await rememberCompanyTech(companyId, { sourceType: job.sourceType })
  const classified = await classificationFields(job.title, description)
  const data = {
    title: job.title,
    normalizedTitle: normalizeWhitespace(job.title),
    summary: excerpt(description || job.title).slice(0, 280),
    descriptionText: description,
    locationText: job.locationText,
    workplaceType: job.workplaceType,
    employmentType: job.employmentType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    originalUrl: job.originalUrl,
    canonicalUrl: canonical,
    publishedAt: job.publishedAt,
    lastSeenAt: now,
    lastVerifiedAt: now,
    status: "ACTIVE" as const,
    closedAt: null,
    contentHash: sha256(`${job.title}\n${description.slice(0, 500)}`),
    fingerprint: sha256(`${job.title}|${job.companyName ?? ""}|${canonical}`),
    sourceType: job.sourceType,
    sourceBoardId: job.sourceBoardId ?? null,
    externalId: job.externalId,
    careerPageId,
    companyId,
    llmOptOut: job.llmOptOut ?? false,
    ...classified,
    ...(job.variants ? { variants: job.variants as unknown as Prisma.InputJsonValue } : {}),
  }
  const written = keepExternalPay(existing, data)
  if (existing) {
    // A row found under its pre-scoping key moves to the new key, keeping its feedback,
    // applications and CVs instead of leaving them on a row that would close.
    return db.job.update({
      where: { id: existing.id },
      data: existing.identityKey === identityKey ? written : { ...written, identityKey },
    })
  }
  try {
    return await db.job.create({ data: { ...written, identityKey, firstSeenAt: now } })
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const again = await db.job.findUnique({ where: { identityKey } })
    const text = description || again?.descriptionText || ""
    const kept =
      text === description
        ? data
        : {
            ...data,
            descriptionText: text,
            summary: again?.summary ?? data.summary,
            contentHash: again?.contentHash ?? data.contentHash,
          }
    return db.job.update({ where: { identityKey }, data: keepExternalPay(again, kept) })
  }
}

/** One discovered offer. Does not close the rest of a board. */
export async function saveDiscoveredJob(job: ListedJob, now: Date) {
  const companyName = job.companyName || "Unknown company"
  const boardId = (
    job.sourceBoardId || `search:${normalizeCompanyName(companyName) || "company"}`
  ).slice(0, 180)
  const page = await ensureCareerPage(
    {
      provider: job.sourceType,
      boardId,
      companyName,
      careersUrl: job.originalUrl,
    },
    companyName,
    now
  )
  return writeJob({ ...job, sourceBoardId: boardId, companyName }, page.id, page.companyId, now)
}

/** One updateMany per 1,000 ids instead of one query per row. */
async function updateJobs(ids: string[], data: Prisma.JobUpdateManyMutationInput) {
  for (let start = 0; start < ids.length; start += 1000) {
    await db.job.updateMany({ where: { id: { in: ids.slice(start, start + 1000) } }, data })
  }
}

export async function storeBoardInventory(args: {
  board: IndexBoard
  listed: BoardList
  now: Date
  etag?: string | null
  lastModified?: string | null
  nextCheckAt: Date
}): Promise<{ stored: number; closed: number; complete: boolean }> {
  const companyName = args.listed.companyName || args.board.companyName
  const page = await ensureCareerPage(args.board, companyName, args.now)
  const companyId = page.companyId
  const seenKeys = new Set<string>()
  const coveredUrls = new Set<string>(args.listed.coveredUrls ?? [])
  const writtenUrls = new Set<string>()
  let stored = 0
  for (const job of args.listed.jobs) {
    const saved = await writeJob(
      {
        ...job,
        companyName: job.companyName || companyName,
        sourceBoardId: job.sourceBoardId || args.board.boardId,
      },
      page.id,
      companyId,
      args.now
    )
    seenKeys.add(saved.identityKey)
    writtenUrls.add(saved.canonicalUrl)
    stored += 1
  }

  const complete = args.listed.complete === true
  let closed = 0
  if (complete) {
    const existing = await db.job.findMany({
      where: { careerPageId: page.id, status: { in: ["ACTIVE", "POSSIBLY_CLOSED"] } },
      select: { id: true, status: true, identityKey: true, canonicalUrl: true },
    })
    const touched: string[] = []
    const reopened: string[] = []
    const missing: string[] = []
    const gone: string[] = []
    for (const row of existing) {
      // A covered URL (still on the site, not re-read) keeps its row. A URL written this pass
      // does not: the written row is the live one, and others sharing the URL are duplicates
      // or jobs whose id was lost from the URL (gh_jid once put 2,794 jobs on 4 URLs).
      const written = seenKeys.has(row.identityKey)
      const seen =
        written || (coveredUrls.has(row.canonicalUrl) && !writtenUrls.has(row.canonicalUrl))
      const status = nextStatus(row.status, seen)
      if (status === "ACTIVE") reopened.push(row.id)
      else if (status === "POSSIBLY_CLOSED") missing.push(row.id)
      else if (status === "CLOSED") gone.push(row.id)
      // writeJob already stamped written rows. Covered rows still need lastSeenAt, or the
      // feed, which reads the most recently seen rows, never reaches them.
      else if (seen && !written) touched.push(row.id)
    }
    const at = args.now
    await updateJobs(touched, { lastSeenAt: at, lastVerifiedAt: at })
    await updateJobs(reopened, {
      status: "ACTIVE",
      closedAt: null,
      lastSeenAt: at,
      lastVerifiedAt: at,
    })
    await updateJobs(missing, { status: "POSSIBLY_CLOSED", closedAt: null, lastVerifiedAt: at })
    await updateJobs(gone, { status: "CLOSED", closedAt: at, lastVerifiedAt: at })
    closed = missing.length + gone.length
  }

  const active = await db.job.count({ where: { careerPageId: page.id, status: "ACTIVE" } })
  await db.careerPage.update({
    where: { id: page.id },
    data: {
      lastCheckedAt: args.now,
      lastSuccessfulFetchAt: args.now,
      nextCheckAt: args.nextCheckAt,
      lastErrorCode: null,
      fetchNote: args.listed.note?.slice(0, 500) ?? null,
      etag: args.etag ?? undefined,
      lastModified: args.lastModified ?? undefined,
      listedCount: args.listed.listedCount ?? args.listed.jobs.length,
      indexComplete: complete,
    },
  })
  return { stored, closed, complete: complete && active >= 0 }
}

export async function noteUnchanged(args: {
  board: IndexBoard
  now: Date
  nextCheckAt: Date
  etag?: string
  lastModified?: string
}) {
  const page = await db.careerPage.findUnique({
    where: {
      provider_providerBoardId: {
        provider: args.board.provider,
        providerBoardId: args.board.boardId,
      },
    },
  })
  if (!page) return
  await db.job.updateMany({
    where: { careerPageId: page.id, status: { in: ["ACTIVE", "POSSIBLY_CLOSED"] } },
    data: { lastSeenAt: args.now, lastVerifiedAt: args.now },
  })
  await db.careerPage.update({
    where: { id: page.id },
    data: {
      lastCheckedAt: args.now,
      lastSuccessfulFetchAt: args.now,
      nextCheckAt: args.nextCheckAt,
      etag: args.etag ?? page.etag,
      lastModified: args.lastModified ?? page.lastModified,
      lastErrorCode: null,
      fetchNote: page.fetchNote === INDEXING_NOTE ? null : page.fetchNote,
    },
  })
}

export async function noteIndexFailure(
  board: IndexBoard,
  now: Date,
  nextCheckAt: Date,
  message: string
) {
  const page = await db.careerPage.findUnique({
    where: {
      provider_providerBoardId: { provider: board.provider, providerBoardId: board.boardId },
    },
  })
  if (!page) {
    await ensureCareerPage(board, board.companyName, now)
  }
  await db.careerPage.updateMany({
    where: { provider: board.provider, providerBoardId: board.boardId },
    data: {
      lastCheckedAt: now,
      nextCheckAt,
      lastErrorCode: "TEMPORARY_ERROR",
      fetchNote: message.slice(0, 500),
    },
  })
}
