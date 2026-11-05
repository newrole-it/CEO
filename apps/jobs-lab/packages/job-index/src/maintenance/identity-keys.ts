/**
 * One-off repair after two identity fixes (2026-11):
 *
 * 1. company_site ids are scoped by board. Traffit "106" at tutlo and "106" at zen were both
 *    stored as "company_site:106", so one employer's crawl overwrote the other's row. Old keys
 *    move to "company_site:<board>:<id>", the form the indexer and the search pipeline now write.
 * 2. Canonical URLs keep gh_jid. Employer-hosted Greenhouse boards (stripe.com/jobs/search?gh_jid=)
 *    had every job on one canonical URL. Those canonicals are recomputed, and a "url:" identity
 *    built from such a stripped URL gets the job's own key.
 *
 * Dry run by default (apps/jobs-lab/scripts/migrate-identity-keys.ts runs it on a named database).
 *
 * Idempotent: a second run finds nothing to change. A row is left alone, and counted, when its new
 * key already belongs to another row, or when another employer's board has touched it.
 */
import type { Prisma } from "@newrole/jobs-lab-db"
import { safeCanonicalUrl } from "@newrole/ats/dedupe"
import { identityFor } from "@newrole/ats/identity"
import type { ListedJob } from "@newrole/ats/schemas"
import db from "../db"
import { unscopedIdentity } from "../index/store"
import { isUniqueViolation } from "../jobs/prisma-errors"

export type IdentityRepairReport = {
  scanned: number
  rekeyed: number
  canonicalFixed: number
  /** New key already held by another row (the same job stored twice). Left as is. */
  taken: number
  /** Of those, rows a person gave feedback on. */
  takenWithUserData: number
  /** Rows another employer's board has written or observed. Left as is. */
  collided: number
  examples: string[]
}

type Row = {
  id: string
  identityKey: string
  sourceType: string
  sourceBoardId: string | null
  externalId: string | null
  originalUrl: string
  canonicalUrl: string
  title: string
  careerPage: { providerBoardId: string | null } | null
  company: { name: string }
  observations: Array<{ careerPage: { providerBoardId: string | null } | null }>
  _count: { feedback: number }
}

const GH_PARAM = /[?&]gh_(?!src=)[a-z_]+=/i

export async function repairIdentityKeys(opts: {
  apply: boolean
  /** Narrows the scan, e.g. to one board or to test fixtures. */
  where?: Prisma.JobWhereInput
}): Promise<IdentityRepairReport> {
  const report: IdentityRepairReport = {
    scanned: 0,
    rekeyed: 0,
    canonicalFixed: 0,
    taken: 0,
    takenWithUserData: 0,
    collided: 0,
    examples: [],
  }
  const note = (line: string) => {
    if (report.examples.length < 15) report.examples.push(line)
  }

  let cursor: string | undefined
  for (;;) {
    const rows: Row[] = await db.job.findMany({
      where: {
        AND: [
          opts.where ?? {},
          {
            OR: [
              { identityKey: { startsWith: "company_site:" } },
              { originalUrl: { contains: "gh_" } },
            ],
          },
        ],
      },
      select: {
        id: true,
        identityKey: true,
        sourceType: true,
        sourceBoardId: true,
        externalId: true,
        originalUrl: true,
        canonicalUrl: true,
        title: true,
        careerPage: { select: { providerBoardId: true } },
        company: { select: { name: true } },
        observations: { select: { careerPage: { select: { providerBoardId: true } } } },
        _count: { select: { feedback: true } },
      },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })
    if (!rows.length) break
    cursor = rows[rows.length - 1].id
    for (const row of rows) {
      report.scanned += 1
      const data: { identityKey?: string; canonicalUrl?: string } = {}

      const ghUrl = GH_PARAM.test(row.originalUrl)
      const canonical = safeCanonicalUrl(row.originalUrl)
      if (ghUrl && canonical !== row.canonicalUrl) data.canonicalUrl = canonical

      const next = identityFor({
        title: row.title,
        companyName: row.company.name,
        originalUrl: row.originalUrl,
        sourceType: row.sourceType as ListedJob["sourceType"],
        externalId: row.externalId ?? undefined,
        sourceBoardId: row.sourceBoardId ?? undefined,
        workplaceType: "UNKNOWN",
        needsHydration: false,
      })
      const legacyScope = unscopedIdentity(next, row.sourceBoardId) === row.identityKey
      const legacyUrl = ghUrl && row.identityKey.startsWith("url:") && next !== row.identityKey
      if (next !== row.identityKey && (legacyScope || legacyUrl)) {
        const board = (row.sourceBoardId || "").toLowerCase()
        const boards = [
          row.careerPage?.providerBoardId,
          ...row.observations.map((seen) => seen.careerPage?.providerBoardId),
        ].filter((value): value is string => Boolean(value))
        const otherBoard = boards.find((value) => value.toLowerCase() !== board)
        const holder = await db.job.findUnique({
          where: { identityKey: next },
          select: { id: true },
        })
        if (otherBoard) {
          report.collided += 1
          note(`collided ${row.identityKey} (board ${row.sourceBoardId}, also ${otherBoard})`)
        } else if (holder && holder.id !== row.id) {
          report.taken += 1
          if (row._count.feedback > 0) report.takenWithUserData += 1
          note(`taken ${row.identityKey} -> ${next} (held by ${holder.id})`)
        } else {
          data.identityKey = next
          note(`rekey ${row.identityKey} -> ${next}`)
        }
      }

      if (!data.identityKey && !data.canonicalUrl) continue
      if (data.identityKey) report.rekeyed += 1
      if (data.canonicalUrl) report.canonicalFixed += 1
      if (!opts.apply) continue
      try {
        await db.job.update({ where: { id: row.id }, data })
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
        // Another writer took the key since the check above; keep the old key.
        report.rekeyed -= 1
        report.taken += 1
        if (data.canonicalUrl) {
          await db.job.update({ where: { id: row.id }, data: { canonicalUrl: data.canonicalUrl } })
        }
      }
    }
  }
  return report
}
