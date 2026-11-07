import { Prisma } from "@prisma/client"
import db from "db"
import { revokeGmailAccess } from "src/server/gmail/service"
import { PERSONAL_LLM_PURPOSES } from "src/server/llm/client"
import { GMAIL_SYNC, SHEET_SYNC } from "src/server/queue/enqueue"

type Writer = Prisma.TransactionClient | typeof db

/**
 * Removes the CV, the parsed profile, the facts the person added on matches, profile audits, and
 * CV-derived model cache rows.
 */
export async function eraseProfile(userId: number, client: Writer = db) {
  await client.profileAuditRun.deleteMany({ where: { userId } })
  await client.candidateProfile.deleteMany({ where: { userId } })
  await client.candidateFact.deleteMany({ where: { userId } })
  await client.llmCache.deleteMany({
    where: { userId, purpose: { in: [...PERSONAL_LLM_PURPOSES] } },
  })
}

/**
 * Removes the account and every personal row tied to it.
 * Audit events stay as action names only: the user id and metadata are cleared.
 */
export async function eraseAccount(userId: number) {
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return { deleted: "missing" as const }

  // Outside the transaction: an unreachable Google must not keep the account from being deleted.
  await revokeGmailAccess(userId).catch(() => false)

  await db.$transaction(async (tx) => {
    const runs = await tx.searchRun.findMany({
      where: { savedSearch: { userId } },
      select: { id: true },
    })
    const runIds = runs.map((run) => run.id)
    if (runIds.length) {
      await tx.discoveryRun.deleteMany({ where: { searchRunId: { in: runIds } } })
      const tasks = await tx.backgroundTask.findMany({
        where: {
          OR: runIds.map((id) => ({
            payload: { path: ["searchRunId"], equals: id },
          })),
        },
        select: { id: true },
      })
      if (tasks.length) {
        await tx.backgroundTask.deleteMany({
          where: { id: { in: tasks.map((task) => task.id) } },
        })
      }
    }

    await tx.backgroundTask.deleteMany({
      where: {
        type: { in: [SHEET_SYNC, GMAIL_SYNC] },
        payload: { path: ["userId"], equals: userId },
      },
    })
    // Applications, CVs, the offers kept with their text, answers, API tokens, the sheet and Gmail
    // links and the mail log cascade with the user row below.
    await tx.savedSearch.deleteMany({ where: { userId } })
    await tx.offerFeedback.deleteMany({ where: { userId } })
    await tx.watchedCompany.deleteMany({ where: { userId } })
    await eraseProfile(userId, tx)
    await tx.llmCache.deleteMany({ where: { userId } })
    await tx.auditEvent.updateMany({
      where: { userId },
      data: { userId: null, metadata: Prisma.DbNull },
    })
    await tx.token.deleteMany({ where: { userId } })
    await tx.session.deleteMany({ where: { userId } })
    await tx.loginLink.deleteMany({ where: { email: user.email } })
    await tx.authRateLimit.deleteMany({
      where: { key: { in: [`email:${user.email}`, `search:${userId}`] } },
    })
    await tx.user.delete({ where: { id: userId } })
  })

  return { deleted: "account" as const }
}
