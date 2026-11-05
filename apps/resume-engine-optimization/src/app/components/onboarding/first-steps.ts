import { cookies } from "next/headers"
import type { OfferRow } from "src/server/offers/service"
import {
  FIRST_STEPS_HIDDEN_COOKIE,
  nextFirstStep,
  type FirstStep,
} from "src/server/onboarding/first-steps"
import { loadFirstSteps } from "src/server/onboarding/status"

/** The steps for the card, or null once they are all done or this browser hid the card. */
export async function visibleFirstSteps(
  userId: number,
  offers: OfferRow[]
): Promise<FirstStep[] | null> {
  const jar = await cookies()
  if (jar.get(FIRST_STEPS_HIDDEN_COOKIE)) return null
  const steps = await loadFirstSteps(userId, offers)
  return nextFirstStep(steps) ? steps : null
}
