import db from "db"
import { createLlmClient } from "src/server/llm/client"
import { buildProfileAudit, builtAuditSchema, type BuiltAudit } from "./audit"
import { demandFromOffers } from "./demand"
import { parseStoredDocument, profileText, type LinkedInDocument } from "./linkedin"

export async function demandForUser(userId: number, text: string) {
  const searches = await db.savedSearch.findMany({
    where: { userId },
    select: {
      phrase: true,
      runs: {
        where: { status: "SUCCEEDED" },
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  })
  const roles = []
  for (const search of searches) {
    const runId = search.runs[0]?.id
    if (!runId) continue
    const matches = await db.jobMatch.findMany({
      where: { searchRunId: runId },
      select: { job: { select: { title: true, descriptionText: true, summary: true } } },
    })
    roles.push({
      phrase: search.phrase,
      offers: matches.map((match) => ({
        title: match.job.title,
        descriptionText: `${match.job.summary}\n${match.job.descriptionText}`,
      })),
    })
  }
  return demandFromOffers({ roles, profileText: text })
}

export async function runProfileAuditForUser(userId: number): Promise<BuiltAudit | null> {
  const profile = await db.candidateProfile.findUnique({ where: { userId } })
  const document = parseStoredDocument(profile?.linkedinDocument)
  if (!document) return null
  const previous = await db.profileAuditRun.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { score: true },
  })
  const audit = await buildProfileAudit({
    document,
    facts: await demandForUser(userId, profileText(document)),
    llm: createLlmClient(),
    previousScore: previous?.score ?? null,
  })
  await db.profileAuditRun.create({
    data: {
      userId,
      score: audit.score,
      previousScore: audit.previousScore,
      summary: audit.summary,
      topChanges: audit.topChanges,
      annotations: audit.annotations,
      demand: audit.demand,
      documentHash: audit.documentHash,
    },
  })
  return audit
}

export async function loadProfileAudit(userId: number): Promise<{
  document: LinkedInDocument | null
  importedAt: Date | null
  audit: BuiltAudit | null
  auditedAt: Date | null
}> {
  const profile = await db.candidateProfile.findUnique({ where: { userId } })
  const document = parseStoredDocument(profile?.linkedinDocument ?? null)
  const row = await db.profileAuditRun.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })
  const parsed = row
    ? builtAuditSchema.safeParse({
        score: row.score,
        previousScore: row.previousScore,
        summary: row.summary,
        topChanges: row.topChanges,
        annotations: row.annotations,
        demand: row.demand,
        documentHash: row.documentHash,
      })
    : null
  return {
    document,
    importedAt: profile?.linkedinImportedAt ?? null,
    audit: parsed?.success ? parsed.data : null,
    auditedAt: row?.createdAt ?? null,
  }
}
