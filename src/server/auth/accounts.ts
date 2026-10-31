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

/** Move a guest's searches onto a real account, then remove the guest. */
export async function claimGuest(guestId: number, userId: number) {
  if (guestId === userId) return
  const guest = await db.user.findUnique({ where: { id: guestId }, select: { role: true } })
  if (!guest || guest.role !== "GUEST") return
  const targetProfile = await db.candidateProfile.findUnique({ where: { userId } })
  if (!targetProfile) {
    await db.candidateProfile.updateMany({ where: { userId: guestId }, data: { userId } })
    await db.profileAuditRun.updateMany({ where: { userId: guestId }, data: { userId } })
    await db.llmCache.updateMany({ where: { userId: guestId }, data: { userId } })
  }
  await db.savedSearch.updateMany({ where: { userId: guestId }, data: { userId } })
  await db.auditEvent.updateMany({ where: { userId: guestId }, data: { userId } })
  // The account's own verdict wins. Guest rows for the same offer or company go with the guest.
  const [judged, watched] = await Promise.all([
    db.offerFeedback.findMany({ where: { userId }, select: { jobId: true } }),
    db.watchedCompany.findMany({ where: { userId }, select: { companyId: true } }),
  ])
  await db.offerFeedback.updateMany({
    where: { userId: guestId, jobId: { notIn: judged.map((row) => row.jobId) } },
    data: { userId },
  })
  await db.watchedCompany.updateMany({
    where: { userId: guestId, companyId: { notIn: watched.map((row) => row.companyId) } },
    data: { userId },
  })
  // Applications for an offer the account already tracks stay with the guest; the rest move.
  const tracked = await db.application.findMany({
    where: { userId, jobId: { not: null } },
    select: { jobId: true },
  })
  await db.application.updateMany({
    where: {
      userId: guestId,
      OR: [{ jobId: null }, { jobId: { notIn: tracked.map((row) => row.jobId!) } }],
    },
    data: { userId },
  })
  const hasDefaultCv = await db.cvDocument.count({ where: { userId, isDefault: true } })
  if (hasDefaultCv) {
    await db.cvDocument.updateMany({ where: { userId: guestId }, data: { isDefault: false } })
  }
  await db.cvDocument.updateMany({ where: { userId: guestId }, data: { userId } })
  await db.answer.updateMany({ where: { userId: guestId }, data: { userId } })
  await db.user.delete({ where: { id: guestId } })
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

export function sessionRole(role: string): Role {
  if (role === "ADMIN" || role === "GUEST" || role === "USER") return role
  return "USER"
}
