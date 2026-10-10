import { Prisma } from "@prisma/client"
import db from "db"
import type { BoardList } from "src/server/adapters/types"
import { excerpt } from "src/server/crawler/hygiene"
import { canonicalUrl, sha256 } from "src/server/jobs/dedupe"
import { normalizeCompanyName, normalizeWhitespace } from "src/server/jobs/normalize"
import type { ListedJob, SourceType } from "src/shared/schemas"
import { extractAtsKey } from "../../../matching/dedupe"
import type { Source } from "../../../matching/types"
import { nextStatus } from "./schedule"

const APP_TO_SOURCE: Partial<Record<SourceType, Source>> = {
  GREENHOUSE: "greenhouse",
  LEVER: "lever",
  ASHBY: "ashby",
  WORKABLE: "workable",
  SMARTRECRUITERS: "smartrecruiters",
  TEAMTAILOR: "teamtailor",
  TRAFFIT: "company_site",
  RECRUITEE: "company_site",
  PERSONIO: "company_site",
  PINPOINT: "company_site",
  BREEZY: "company_site",
  BAMBOOHR: "company_site",
  GENERIC_HTML: "company_site",
  CAREER_SITE: "company_site",
  SUCCESSFACTORS: "company_site",
  WORKDAY: "company_site",
  ICIMS: "company_site",
  PHENOM: "company_site",
  AVATURE: "company_site",
  ERECRUITER: "company_site",
  JOBVITE: "company_site",
}

export type IndexBoard = {
  provider: SourceType
  boardId: string
  companyName: string
  careersUrl: string
}

function safeCanonical(raw: string): string {
  try {
    return canonicalUrl(raw)
  } catch {
    return raw
  }
}

export function identityFor(job: ListedJob): string {
  const canonical = safeCanonical(job.originalUrl)
  const source = APP_TO_SOURCE[job.sourceType] ?? "company_site"
  return extractAtsKey(canonical, source, job.externalId, job.sourceBoardId) ?? `url:${canonical}`
}

function isUnique(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

async function companyFor(name: string) {
  const companyName = normalizeWhitespace(name) || "Unknown company"
  const normalizedName = normalizeCompanyName(companyName) || companyName.toLowerCase()
  const existing = await db.company.findUnique({ where: { normalizedName } })
  if (existing) return existing
  try {
    return await db.company.create({ data: { name: companyName, normalizedName } })
  } catch (error) {
    if (!isUnique(error)) throw error
    const again = await db.company.findUnique({ where: { normalizedName } })
    if (!again) throw error
    return again
  }
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
      normalizedUrl: safeCanonical(board.careersUrl),
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
    urls.add(safeCanonical(row.originalUrl))
  }
  return urls
}

async function writeJob(job: ListedJob, careerPageId: string, companyId: string, now: Date) {
  const canonical = safeCanonical(job.originalUrl)
  const identityKey = identityFor(job)
  const description = excerpt(job.descriptionText || "")
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
    ...(job.variants ? { variants: job.variants as unknown as Prisma.InputJsonValue } : {}),
  }
  const existing = await db.job.findUnique({ where: { identityKey } })
  if (existing) {
    return db.job.update({ where: { id: existing.id }, data })
  }
  try {
    return await db.job.create({ data: { ...data, identityKey, firstSeenAt: now } })
  } catch (error) {
    if (!isUnique(error)) throw error
    return db.job.update({ where: { identityKey }, data })
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
  const seenUrls = new Set<string>(args.listed.coveredUrls ?? [])
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
    seenUrls.add(saved.canonicalUrl)
    stored += 1
  }

  const complete = args.listed.complete === true
  let closed = 0
  if (complete) {
    const existing = await db.job.findMany({
      where: { careerPageId: page.id, status: { in: ["ACTIVE", "POSSIBLY_CLOSED"] } },
      select: { id: true, status: true, identityKey: true, canonicalUrl: true },
    })
    for (const row of existing) {
      const seen = seenKeys.has(row.identityKey) || seenUrls.has(row.canonicalUrl)
      const status = nextStatus(row.status, seen)
      if (!status) continue
      await db.job.update({
        where: { id: row.id },
        data: {
          status,
          closedAt: status === "CLOSED" ? args.now : null,
          lastVerifiedAt: args.now,
        },
      })
      if (status === "CLOSED" || status === "POSSIBLY_CLOSED") closed += 1
    }
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
