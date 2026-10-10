import { latestDecisions, type LocalDecision } from "src/shared/triage"

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

export function rememberDecision(decision: LocalDecision) {
  if (typeof window === "undefined") return
  const next = latestDecisions([...readDecisions(), decision]).slice(-200)
  window.localStorage.setItem(KEY, JSON.stringify(next))
}

export function clearDecisions() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(KEY)
}
