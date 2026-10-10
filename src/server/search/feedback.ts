import { diceTokens, fold, tokens } from "../../../matching/text"

const MAX_PENALTY = 8

export type FeedbackOffer = {
  title: string
  company: string
}

/** A small negative adjustment. Similar rejected offers sink a little. The floor is -8. */
export function rejectionPenalty(offer: FeedbackOffer, rejected: FeedbackOffer[]): number {
  if (!rejected.length) return 0
  const offerTokens = tokens(offer.title)
  const company = fold(offer.company)
  let penalty = 0
  for (const item of rejected) {
    const overlap = diceTokens(offerTokens, tokens(item.title))
    let next = 0
    if (overlap >= 0.75) next = 7
    else if (overlap >= 0.5) next = 5
    if (company && company === fold(item.company) && overlap >= 0.25) next += 2
    if (next > penalty) penalty = next
  }
  if (!penalty) return 0
  return -Math.min(MAX_PENALTY, penalty)
}
