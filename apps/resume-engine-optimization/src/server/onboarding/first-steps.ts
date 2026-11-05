/**
 * "First steps" on /offers and /cv: the loop newrole.it is for, as pure rules. Facts from the
 * database go in, four steps come out, in the order a person does them: a profile, an offer added
 * by its link, a CV tailored to it, an application. Text lives in src/app/i18n/copy-guide.ts under
 * fs.<id>.title, fs.<id>.body and fs.<id>.cta.
 */

export type FirstStepId = "profile" | "offer" | "tailor" | "apply"

export type FirstStep = {
  id: FirstStepId
  done: boolean
  /** Where the step happens, or where its result is once it is done */
  href: string
}

export type FirstStepFacts = {
  profile: boolean
  /** The person's offers, newest first (listOffers) */
  offers: { jobId: string; cvId: string | null; application: { id: string } | null }[]
  /** Applications of any kind: from an offer, the extension, a CSV or added by hand */
  applications: number
}

/** Set by "Hide" on the card: the pages stop showing it in this browser. */
export const FIRST_STEPS_HIDDEN_COOKIE = "nr-first-steps-hidden"

export function firstSteps(facts: FirstStepFacts): FirstStep[] {
  const tailored = facts.offers.find((offer) => offer.cvId)
  // The newest offer without a CV is the one to tailor next.
  const untailored = facts.offers.find((offer) => !offer.cvId)
  const toApply = facts.offers.find((offer) => offer.cvId && !offer.application) ?? tailored
  return [
    {
      id: "profile",
      done: facts.profile,
      href: facts.profile ? "/profile" : "/start",
    },
    {
      id: "offer",
      done: facts.offers.length > 0,
      href: "/offers",
    },
    {
      id: "tailor",
      done: Boolean(tailored),
      href: tailored
        ? `/cv/${tailored.cvId}`
        : untailored
        ? `/offers/${untailored.jobId}/cv`
        : "/offers",
    },
    {
      id: "apply",
      done: facts.applications > 0,
      href:
        facts.applications > 0 ? "/applications" : toApply ? `/offers/${toApply.jobId}` : "/offers",
    },
  ]
}

/** The first step not done yet, or null when the loop is complete. */
export function nextFirstStep(steps: FirstStep[]): FirstStep | null {
  return steps.find((step) => !step.done) ?? null
}
