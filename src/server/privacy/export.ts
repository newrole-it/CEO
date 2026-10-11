import db from "db"

/** JSON snapshot of one account. Session secrets, password hashes, and magic-link tokens are omitted. */
export async function exportAccount(userId: number) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      candidateProfile: true,
      profileAudits: { orderBy: { createdAt: "desc" } },
      searches: {
        orderBy: { createdAt: "desc" },
        include: {
          runs: {
            orderBy: { startedAt: "desc" },
            include: {
              matches: {
                include: {
                  job: {
                    select: {
                      id: true,
                      title: true,
                      originalUrl: true,
                      company: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      audits: { orderBy: { createdAt: "desc" } },
      sessions: { select: { id: true, createdAt: true, expiresAt: true } },
    },
  })
  if (!user) return null

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      locale: user.locale,
      timezone: user.timezone,
      linkedinConnected: Boolean(user.linkedinSub),
      linkedinSub: user.linkedinSub,
      imageUrl: user.imageUrl,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    },
    profile: user.candidateProfile,
    profileAudits: user.profileAudits,
    searches: user.searches.map((search) => ({
      id: search.id,
      phrase: search.phrase,
      locationHint: search.locationHint,
      workMode: search.workMode,
      targetTitles: search.targetTitles,
      includedKeywords: search.includedKeywords,
      excludedKeywords: search.excludedKeywords,
      seniority: search.seniority,
      createdAt: search.createdAt,
      runs: search.runs.map((run) => ({
        id: run.id,
        status: run.status,
        message: run.message,
        expansion: run.expansion,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        matches: run.matches.map((match) => ({
          id: match.id,
          score: match.score,
          reason: match.reason,
          interestedAt: match.interestedAt,
          dismissedAt: match.dismissedAt,
          job: {
            id: match.job.id,
            title: match.job.title,
            company: match.job.company.name,
            url: match.job.originalUrl,
          },
        })),
      })),
    })),
    auditEvents: user.audits.map((event) => ({
      id: event.id,
      action: event.action,
      metadata: event.metadata,
      createdAt: event.createdAt,
    })),
    sessions: user.sessions,
  }
}
