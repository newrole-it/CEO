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
  await db.user.delete({ where: { id: guestId } })
}

export async function upsertLinkedInUser(identity: {
  sub: string
  email: string
  name: string | null
  picture: string | null
}) {
  const bySub = await db.user.findUnique({ where: { linkedinSub: identity.sub } })
  if (bySub) {
    return db.user.update({
      where: { id: bySub.id },
      data: {
        email: identity.email,
        name: identity.name || bySub.name,
        imageUrl: identity.picture,
        emailVerifiedAt: bySub.emailVerifiedAt ?? new Date(),
        role: bySub.role === "GUEST" ? "USER" : bySub.role,
      },
    })
  }
  const byEmail = await db.user.findUnique({ where: { email: identity.email } })
  if (byEmail) {
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
      emailVerifiedAt: new Date(),
    },
  })
}

export function sessionRole(role: string): Role {
  if (role === "ADMIN" || role === "GUEST" || role === "USER") return role
  return "USER"
}
