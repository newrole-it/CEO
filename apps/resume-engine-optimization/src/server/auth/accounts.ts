import db from "db"
import type { Role } from "types"

export function guestEmail(): string {
  return `guest_${crypto.randomUUID()}@guest.jobscanner.local`
}

export function isGuestRole(role: string | null | undefined): boolean {
  return role === "GUEST"
}

export async function createGuestUser() {
  return db.user.create({
    data: { email: guestEmail(), role: "GUEST", name: "Guest" },
  })
}

/**
 * Move a guest's data onto a real account, then remove the guest. One transaction: when a step
 * fails, the guest keeps everything and the account is as it was.
 */
export async function claimGuest(guestId: number, userId: number) {
  if (guestId === userId) return
  await db.$transaction(async (tx) => {
    const guest = await tx.user.findUnique({ where: { id: guestId }, select: { role: true } })
    if (!guest || guest.role !== "GUEST") return
    const targetProfile = await tx.candidateProfile.findUnique({ where: { userId } })
    if (!targetProfile) {
      await tx.candidateProfile.updateMany({ where: { userId: guestId }, data: { userId } })
      await tx.profileAuditRun.updateMany({ where: { userId: guestId }, data: { userId } })
      await tx.llmCache.updateMany({ where: { userId: guestId }, data: { userId } })
    }
    await tx.savedSearch.updateMany({ where: { userId: guestId }, data: { userId } })
    await tx.auditEvent.updateMany({ where: { userId: guestId }, data: { userId } })
    // The account's own verdict wins. Guest rows for the same offer or company go with the guest.
    const judged = await tx.offerFeedback.findMany({ where: { userId }, select: { jobId: true } })
    const watched = await tx.watchedCompany.findMany({
      where: { userId },
      select: { companyId: true },
    })
    await tx.offerFeedback.updateMany({
      where: { userId: guestId, jobId: { notIn: judged.map((row) => row.jobId) } },
      data: { userId },
    })
    await tx.watchedCompany.updateMany({
      where: { userId: guestId, companyId: { notIn: watched.map((row) => row.companyId) } },
      data: { userId },
    })
    // The same for an offer both kept: the account's text and notes stay.
    const kept = await tx.userOffer.findMany({ where: { userId }, select: { jobId: true } })
    await tx.userOffer.updateMany({
      where: { userId: guestId, jobId: { notIn: kept.map((row) => row.jobId) } },
      data: { userId },
    })
    // Applications for an offer the account already tracks stay with the guest; the rest move.
    const tracked = await tx.application.findMany({
      where: { userId, jobId: { not: null } },
      select: { jobId: true },
    })
    await tx.application.updateMany({
      where: {
        userId: guestId,
        OR: [{ jobId: null }, { jobId: { notIn: tracked.map((row) => row.jobId!) } }],
      },
      data: { userId },
    })
    // One tailored CV and one letter per offer: where the account has its own, the guest's stays.
    const tailored = await tx.cvDocument.findMany({
      where: { userId, jobId: { not: null } },
      select: { jobId: true, docType: true },
    })
    const taken = new Set(tailored.map((doc) => `${doc.docType}:${doc.jobId}`))
    const guestTailored = await tx.cvDocument.findMany({
      where: { userId: guestId, jobId: { not: null } },
      select: { id: true, jobId: true, docType: true },
    })
    const clashing = guestTailored
      .filter((doc) => taken.has(`${doc.docType}:${doc.jobId}`))
      .map((doc) => doc.id)
    const hasDefaultCv = await tx.cvDocument.count({ where: { userId, isDefault: true } })
    if (hasDefaultCv) {
      await tx.cvDocument.updateMany({ where: { userId: guestId }, data: { isDefault: false } })
    }
    await tx.cvDocument.updateMany({
      where: { userId: guestId, id: { notIn: clashing } },
      data: { userId },
    })
    await tx.answer.updateMany({ where: { userId: guestId }, data: { userId } })
    await tx.user.delete({ where: { id: guestId } })
  })
}

/**
 * The account for a LinkedIn identity, or null when LinkedIn has not verified the email and it
 * belongs to an existing account: linking then would hand that account to whoever typed the email.
 */
export async function upsertLinkedInUser(identity: {
  sub: string
  email: string
  emailVerified: boolean
  name: string | null
  picture: string | null
}) {
  const bySub = await db.user.findUnique({ where: { linkedinSub: identity.sub } })
  if (bySub) {
    // Email is unique: someone else may already hold the address the person moved to on LinkedIn.
    const canMoveEmail =
      identity.emailVerified &&
      identity.email !== bySub.email &&
      !(await db.user.findUnique({ where: { email: identity.email }, select: { id: true } }))
    return db.user.update({
      where: { id: bySub.id },
      data: {
        email: canMoveEmail ? identity.email : bySub.email,
        name: identity.name || bySub.name,
        imageUrl: identity.picture,
        emailVerifiedAt: bySub.emailVerifiedAt ?? new Date(),
        role: bySub.role === "GUEST" ? "USER" : bySub.role,
      },
    })
  }
  const byEmail = await db.user.findUnique({ where: { email: identity.email } })
  if (byEmail) {
    if (!identity.emailVerified) return null
    return db.user.update({
      where: { id: byEmail.id },
      data: {
        linkedinSub: identity.sub,
        name: identity.name || byEmail.name,
        imageUrl: identity.picture,
        emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
        role: byEmail.role === "GUEST" ? "USER" : byEmail.role,
      },
    })
  }
  return db.user.create({
    data: {
      email: identity.email,
      name: identity.name,
      imageUrl: identity.picture,
      linkedinSub: identity.sub,
      role: "USER",
      emailVerifiedAt: identity.emailVerified ? new Date() : null,
    },
  })
}

/**
 * After a password is set or changed, whoever knew the old one keeps nothing: every other session
 * ends and every extension token stops working, so the extension has to be connected again.
 */
export async function revokeOtherAccess(userId: number, keepSessionHandle: string | null) {
  const now = new Date()
  const [sessions, tokens] = await Promise.all([
    db.session.deleteMany({
      where: { userId, ...(keepSessionHandle ? { handle: { not: keepSessionHandle } } : {}) },
    }),
    db.apiToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
  ])
  return { sessions: sessions.count, tokens: tokens.count }
}

export function sessionRole(role: string): Role {
  if (role === "ADMIN" || role === "GUEST" || role === "USER") return role
  return "USER"
}
