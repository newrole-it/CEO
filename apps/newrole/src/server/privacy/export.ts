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
      offerFeedback: {
        orderBy: { updatedAt: "desc" },
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
      watchedCompanies: {
        orderBy: { createdAt: "desc" },
        include: { company: { select: { id: true, name: true, canonicalDomain: true } } },
      },
      applications: {
        orderBy: { appliedAt: "desc" },
        include: { events: { orderBy: { at: "asc" } } },
      },
      cvDocuments: {
        orderBy: { updatedAt: "desc" },
        include: { versions: { orderBy: { number: "asc" } } },
      },
      answers: { orderBy: { updatedAt: "desc" } },
      apiTokens: { orderBy: { createdAt: "desc" } },
      sheetLink: true,
      gmailLink: true,
      mailEvents: { orderBy: { receivedAt: "desc" } },
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
    offerFeedback: user.offerFeedback.map((row) => ({
      id: row.id,
      verdict: row.verdict,
      aspects: row.aspects,
      tags: row.tags,
      note: row.note,
      channel: row.channel,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      job: {
        id: row.job.id,
        title: row.job.title,
        company: row.job.company.name,
        url: row.job.originalUrl,
      },
    })),
    watchedCompanies: user.watchedCompanies.map((row) => ({
      id: row.id,
      source: row.source,
      reason: row.reason,
      createdAt: row.createdAt,
      company: {
        id: row.company.id,
        name: row.company.name,
        domain: row.company.canonicalDomain,
      },
    })),
    applicant: user.applicant,
    applications: user.applications.map(({ userId: _userId, ...row }) => row),
    cvDocuments: user.cvDocuments.map(({ pdf, userId: _userId, ...row }) => ({
      ...row,
      pdfBytes: pdf ? pdf.length : 0,
    })),
    answers: user.answers.map(({ userId: _userId, ...row }) => row),
    apiTokens: user.apiTokens.map((token) => ({
      id: token.id,
      name: token.name,
      prefix: token.prefix,
      createdAt: token.createdAt,
      lastUsedAt: token.lastUsedAt,
      revokedAt: token.revokedAt,
    })),
    sheetLink: user.sheetLink
      ? {
          webhookUrl: user.sheetLink.webhookUrl,
          spreadsheetUrl: user.sheetLink.spreadsheetUrl,
          autoSync: user.sheetLink.autoSync,
          includeNotes: user.sheetLink.includeNotes,
          lastSyncedAt: user.sheetLink.lastSyncedAt,
        }
      : null,
    // Without the token: it opens a whole mailbox, and a file gets passed around.
    gmailLink: user.gmailLink
      ? {
          email: user.gmailLink.email,
          autoApply: user.gmailLink.autoApply,
          useModel: user.gmailLink.useModel,
          lastSyncedAt: user.gmailLink.lastSyncedAt,
          createdAt: user.gmailLink.createdAt,
        }
      : null,
    mailEvents: user.mailEvents.map(({ userId: _userId, ...row }) => row),
    auditEvents: user.audits.map((event) => ({
      id: event.id,
      action: event.action,
      metadata: event.metadata,
      createdAt: event.createdAt,
    })),
    sessions: user.sessions,
  }
}
