/** Application pipeline shared by the tracker, the sheet, MCP and the Chrome extension. */

export const APPLICATION_STATUSES = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "TASK",
  "FINAL",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "GHOSTED",
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

/** Still in play, in funnel order. */
export const ACTIVE_STATUSES = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "TASK",
  "FINAL",
  "OFFER",
] as const satisfies readonly ApplicationStatus[]

export const CLOSED_STATUSES = [
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "GHOSTED",
] as const satisfies readonly ApplicationStatus[]

/** Closing statuses that record the stage they happened at (closedAtStage). */
export const STAGE_RECORDING_STATUSES = ["REJECTED", "WITHDRAWN"] as const

/** "nowarola" means the web app. Stored rows carry it, so it keeps the name from before newrole.it. */
export const APPLICATION_SOURCES = ["nowarola", "extension", "manual", "mcp", "gmail"] as const
export type ApplicationSource = (typeof APPLICATION_SOURCES)[number]

export const CHANNELS = ["web", "mcp", "extension", "gmail"] as const
export type Channel = (typeof CHANNELS)[number]

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === "string" && (APPLICATION_STATUSES as readonly string[]).includes(value)
}

export function isActiveStatus(status: string): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status)
}

/** A reply came back: anything past APPLIED except silence. */
export function gotResponse(status: string): boolean {
  return status !== "APPLIED" && status !== "GHOSTED"
}

const LABELS: Record<"pl" | "en", Record<ApplicationStatus, string>> = {
  pl: {
    APPLIED: "Aplikowano",
    SCREENING: "Rozmowa z rekruterem",
    INTERVIEW: "Rozmowy",
    TASK: "Zadanie",
    FINAL: "Rozmowa finałowa",
    OFFER: "Oferta",
    ACCEPTED: "Przyjęta",
    REJECTED: "Odrzucono",
    WITHDRAWN: "Wycofałem się",
    GHOSTED: "Brak odpowiedzi",
  },
  en: {
    APPLIED: "Applied",
    SCREENING: "Recruiter screen",
    INTERVIEW: "Interviews",
    TASK: "Take-home task",
    FINAL: "Final interview",
    OFFER: "Offer",
    ACCEPTED: "Accepted",
    REJECTED: "Rejected",
    WITHDRAWN: "Withdrew",
    GHOSTED: "No response",
  },
}

export function statusLabel(status: string, locale: "pl" | "en" = "pl"): string {
  return isApplicationStatus(status) ? LABELS[locale][status] : status
}

/** Tone for badges: maps to the design tokens in docs/product/plan-aplikacje.md §4. */
export function statusTone(
  status: string
): "neutral" | "progress" | "late" | "success" | "danger" | "muted" {
  switch (status) {
    case "SCREENING":
    case "INTERVIEW":
      return "progress"
    case "TASK":
    case "FINAL":
      return "late"
    case "OFFER":
    case "ACCEPTED":
      return "success"
    case "REJECTED":
      return "danger"
    case "WITHDRAWN":
    case "GHOSTED":
      return "muted"
    default:
      return "neutral"
  }
}
