import type { Insights } from "src/server/applications/insights"

/**
 * The four numbers that say how the applications are going, for the dashboard and the head of
 * the statistics page: one definition of "answered" for both.
 */
export function replyNumbers(insights: Insights): {
  sent: number
  replied: number
  interviews: number
  offers: number
} {
  const sent = insights.sent
  return {
    sent,
    replied: Math.round((insights.rates.response ?? 0) * sent),
    interviews: insights.funnel.find((row) => row.stage === "INTERVIEW")?.reached ?? 0,
    offers: insights.funnel.find((row) => row.stage === "OFFER")?.reached ?? 0,
  }
}
