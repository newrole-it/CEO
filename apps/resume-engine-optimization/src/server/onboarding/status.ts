import db from "db"
import type { OfferRow } from "src/server/offers/service"
import { firstSteps, type FirstStep } from "./first-steps"

/** The first steps of a person whose offers the page has already listed (listOffers). */
export async function loadFirstSteps(userId: number, offers: OfferRow[]): Promise<FirstStep[]> {
  const [profile, cvs, applications] = await Promise.all([
    db.candidateProfile.findUnique({ where: { userId }, select: { id: true } }),
    // a general CV, as on /cv: not one written for an offer
    db.cvDocument.count({ where: { userId, docType: "CV", targetCompany: null } }),
    db.application.count({ where: { userId } }),
  ])
  return firstSteps({ profile: Boolean(profile), cv: cvs > 0, offers, applications })
}
