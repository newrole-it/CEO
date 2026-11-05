import { Prisma } from "@prisma/client"
import db from "db"
import { safeCanonicalUrl, sha256 } from "@newrole/ats/dedupe"
import { countryFields, identityFor, placeOf } from "@newrole/ats/identity"
import { normalizeCompanyName, normalizeWhitespace } from "@newrole/ats/normalize"
import type { ListedJob } from "@newrole/ats/schemas"
import { excerpt, wellFormed } from "@newrole/offers/hygiene"

/**
 * One offer a person added, kept as a Job row: the same identity key as an index of crawled offers
 * would give it (@newrole/ats/identity), so a link added twice, or by two people, is one offer.
 * The row keeps the facts and at most 300 characters of the text; the person's whole copy of the
 * posting is their UserOffer (service.ts). No career page, no classification: nothing ranks it.
 */

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

async function companyFor(name: string | undefined) {
  const companyName = normalizeWhitespace(name || "") || "Unknown company"
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

export async function storeOffer(
  job: ListedJob,
  now: Date = new Date()
): Promise<{ id: string; created: boolean }> {
  const identityKey = identityFor(job)
  const existing = await db.job.findUnique({ where: { identityKey }, select: { id: true } })
  if (existing) return { id: existing.id, created: false }
  const company = await companyFor(job.companyName)
  const canonical = safeCanonicalUrl(job.originalUrl)
  const description = excerpt(job.descriptionText || "")
  const title = wellFormed(job.title)
  try {
    const row = await db.job.create({
      data: {
        companyId: company.id,
        title,
        normalizedTitle: normalizeWhitespace(title),
        summary: wellFormed(excerpt(description || title).slice(0, 280)),
        descriptionText: description,
        locationText: job.locationText == null ? null : wellFormed(job.locationText),
        ...countryFields(placeOf(job)),
        workplaceType: job.workplaceType,
        employmentType: job.employmentType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        originalUrl: job.originalUrl,
        canonicalUrl: canonical,
        publishedAt: job.publishedAt,
        firstSeenAt: now,
        lastSeenAt: now,
        lastVerifiedAt: now,
        status: "ACTIVE",
        contentHash: sha256(`${job.title}\n${description.slice(0, 500)}`),
        fingerprint: sha256(`${job.title}|${job.companyName ?? ""}|${canonical}`),
        identityKey,
        sourceType: job.sourceType,
        sourceBoardId: job.sourceBoardId ?? null,
        externalId: job.externalId,
        llmOptOut: job.llmOptOut ?? false,
      },
      select: { id: true },
    })
    return { id: row.id, created: true }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const again = await db.job.findUnique({ where: { identityKey }, select: { id: true } })
    if (!again) throw error
    return { id: again.id, created: false }
  }
}
