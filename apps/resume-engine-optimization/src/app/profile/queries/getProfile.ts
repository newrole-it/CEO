"use server"
import { resolver } from "src/server/rpc"
import db from "db"
import { liveMatchingConfig } from "@newrole/matching/live-config"
import { profileMonthlyPln } from "@newrole/profile/salary"
import { asStringList, emptyProfileDraft, type ProfileDraft } from "@newrole/profile/schema"

export default resolver.pipe(resolver.authorize(), async (_input: unknown, ctx) => {
  const user = await db.user.findFirst({
    where: { id: ctx.session.userId! },
    include: { candidateProfile: true },
  })
  const locale = user?.locale === "pl" ? "pl" : "en"
  const row = user?.candidateProfile
  if (!row) return { draft: null as ProfileDraft | null, monthly: null, locale }
  const draft: ProfileDraft = {
    ...emptyProfileDraft(),
    headline: row.headline,
    currentTitle: row.currentTitle,
    pastTitles: asStringList(row.pastTitles),
    seniority: emptyProfileDraft().seniority,
    yearsExperience: row.yearsExperience,
    skills: asStringList(row.skills),
    industries: asStringList(row.industries),
    locations: asStringList(row.locations),
    languages: asStringList(row.languages),
    salaryFloor: row.salaryFloor,
    salaryTarget: row.salaryTarget,
    salaryCurrency:
      row.salaryCurrency === "EUR" ||
      row.salaryCurrency === "USD" ||
      row.salaryCurrency === "GBP" ||
      row.salaryCurrency === "CHF" ||
      row.salaryCurrency === "PLN"
        ? row.salaryCurrency
        : "PLN",
    salaryPeriod: row.salaryPeriod === "year" ? "year" : "month",
    salaryContract: row.salaryContract === "uop" ? "uop" : "b2b",
    industryMode:
      row.industryMode === "stick" || row.industryMode === "any" ? row.industryMode : "prefer",
    contracts: asStringList(row.contracts),
    remotePreference:
      row.remotePreference === "remote" ||
      row.remotePreference === "hybrid" ||
      row.remotePreference === "onsite" ||
      row.remotePreference === "any"
        ? row.remotePreference
        : null,
    homeCity: row.homeCity,
    relocation: row.relocation,
  }
  if (
    row.seniority === "intern" ||
    row.seniority === "junior" ||
    row.seniority === "mid" ||
    row.seniority === "senior" ||
    row.seniority === "lead" ||
    row.seniority === "principal" ||
    row.seniority === "manager" ||
    row.seniority === "senior_manager" ||
    row.seniority === "head" ||
    row.seniority === "director" ||
    row.seniority === "vp" ||
    row.seniority === "c_level"
  ) {
    draft.seniority = row.seniority
  }
  const monthly = profileMonthlyPln(draft, liveMatchingConfig())
  return { draft, monthly, locale, updatedAt: row.updatedAt }
})
