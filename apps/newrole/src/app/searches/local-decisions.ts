import type { LocalDecision } from "src/shared/triage"

/** Decisions the pre-account triage kept in this browser; MergeDecisions moves them to the account. */
const KEY = "jobscanner.decisions.v1"

export function readDecisions(): LocalDecision[] {
  if (typeof window === "undefined") return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || "[]") as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is LocalDecision =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as LocalDecision).jobId === "string" &&
        typeof (item as LocalDecision).at === "number" &&
        ((item as LocalDecision).action === "undecided" ||
          (item as LocalDecision).action === "interested" ||
          (item as LocalDecision).action === "rejected")
    )
  } catch {
    return []
  }
}

export function clearDecisions() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(KEY)
}
