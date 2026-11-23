/**
 * Where the applications sent with one CV ended up, as My CV shows them: one bucket per outcome,
 * best first, and how many employers answered. Counted from the current status; nothing is stored.
 */

export const OUTCOMES = [
  "offer",
  "progress",
  "waiting",
  "rejected",
  "ghosted",
  "withdrawn",
] as const
export type Outcome = (typeof OUTCOMES)[number]

/** The status-pill tone of each bucket (src/app/styles/applications.css). */
export const OUTCOME_TONE: Record<Outcome, string> = {
  offer: "success",
  progress: "progress",
  waiting: "neutral",
  rejected: "danger",
  ghosted: "muted",
  withdrawn: "muted",
}

export function outcomeOf(status: string): Outcome {
  switch (status) {
    case "OFFER":
    case "ACCEPTED":
      return "offer"
    case "SCREENING":
    case "INTERVIEW":
    case "TASK":
    case "FINAL":
      return "progress"
    case "REJECTED":
      return "rejected"
    case "GHOSTED":
      return "ghosted"
    case "WITHDRAWN":
      return "withdrawn"
    default:
      return "waiting"
  }
}

export type OutcomeSummary = {
  total: number
  /** The employer answered: a stage past APPLIED, a rejection, or a withdrawal after a reply */
  replied: number
  counts: Record<Outcome, number>
}

export function summarize(
  applications: { status: string; closedAtStage: string | null }[]
): OutcomeSummary {
  const counts = Object.fromEntries(OUTCOMES.map((key) => [key, 0])) as Record<Outcome, number>
  let replied = 0
  for (const application of applications) {
    const outcome = outcomeOf(application.status)
    counts[outcome] += 1
    if (outcome === "offer" || outcome === "progress" || outcome === "rejected") replied += 1
    else if (
      outcome === "withdrawn" &&
      application.closedAtStage &&
      application.closedAtStage !== "APPLIED"
    )
      replied += 1
  }
  return { total: applications.length, replied, counts }
}
