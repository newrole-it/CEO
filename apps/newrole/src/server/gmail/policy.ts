import { ACTIVE_STATUSES, type ApplicationStatus } from "src/shared/applications"
import type { MailSignal } from "src/shared/gmail"

/**
 * Where a message may move an application: forward only. The person confirms every change, so
 * this only proposes. Pure, no I/O.
 */

/** The step after this one when a message only says "next stage". */
const NEXT_STAGE: Partial<Record<ApplicationStatus, ApplicationStatus>> = {
  APPLIED: "SCREENING",
  SCREENING: "INTERVIEW",
  // A reply after silence: the process is alive again.
  GHOSTED: "SCREENING",
}

function funnelRank(status: string): number {
  return (ACTIVE_STATUSES as readonly string[]).indexOf(status)
}

/** The status a signal leads to from `current`, or null when it would not move anything forward. */
export function targetStatus(signal: MailSignal, current: string): ApplicationStatus | null {
  switch (signal) {
    case "REJECTED":
      return current === "REJECTED" ? null : "REJECTED"
    case "NEXT_STAGE":
      return NEXT_STAGE[current as ApplicationStatus] ?? null
    case "SCREENING":
    case "INTERVIEW":
    case "TASK":
    case "FINAL":
    case "OFFER":
      return funnelRank(signal) > funnelRank(current) ? signal : null
    default:
      return null
  }
}
