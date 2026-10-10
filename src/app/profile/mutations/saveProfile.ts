import { resolver } from "@blitzjs/rpc"
import db from "db"
import { createGuestUser } from "src/server/auth/accounts"
import { profileDraftSchema } from "src/server/profile/schema"

export default resolver.pipe(resolver.zod(profileDraftSchema), async (input, ctx) => {
  let userId = ctx.session.userId
  if (!userId) {
    const guest = await createGuestUser()
    await ctx.session.$create({ userId: guest.id, role: "GUEST" })
    userId = guest.id
  }
  const data = {
    headline: input.headline,
    currentTitle: input.currentTitle,
    pastTitles: input.pastTitles,
    seniority: input.seniority,
    yearsExperience: input.yearsExperience,
    skills: input.skills,
    industries: input.industries,
    locations: input.locations,
    languages: input.languages,
    salaryFloor: input.salaryFloor,
    salaryTarget: input.salaryTarget,
    salaryCurrency: input.salaryCurrency,
    salaryPeriod: input.salaryPeriod,
    salaryContract: input.salaryContract,
    industryMode: input.industryMode,
    contracts: input.contracts,
    remotePreference: input.remotePreference,
    homeCity: input.homeCity,
    relocation: input.relocation,
  }
  await db.candidateProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  })
  return { ok: true }
})
