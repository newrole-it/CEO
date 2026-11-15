import type { Decision } from "@newrole/cv-core/evaluation"
import type { CopyKey } from "src/app/i18n/copy"

/** What the page and the card share: how a decision reads, and where the evaluation lives. */

export const DECISION_KEY = {
  apply: "ev.decision.apply",
  consider: "ev.decision.consider",
  skip: "ev.decision.skip",
  unknown: "ev.decision.unknown",
} as const satisfies Record<Decision, CopyKey>

export const DECISION_TONE = {
  apply: "success",
  consider: "warning",
  skip: "plain",
  unknown: "plain",
} as const satisfies Record<Decision, "success" | "warning" | "plain">

export const evaluationPath = (jobId: string) => `/offers/${jobId}/evaluation`
