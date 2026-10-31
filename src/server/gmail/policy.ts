import { ACTIVE_STATUSES, isActiveStatus, type ApplicationStatus } from "src/shared/applications"
import type { MailOutcome, MailSignal } from "src/shared/gmail"
import type { MatchResult } from "./match"

/**
 * What a message may do. Anyone can send an e-mail, so a status changes on its own only when all
 * of this holds: Gmail vouches for the sender, the sender proves one application, the text is
 * clear, and the change goes forward. Everything else waits for the person. Pure, no I/O.
 */

/** The step after this one when a message only says "next stage". */
const NEXT_STAGE: Partial<Record<ApplicationStatus, ApplicationStatus>> = {
  APPLIED: "SCREENING",
  SCREENING: "INTERVIEW",
  // A reply after silence: the process is alive again. decide() leaves this one to the person.
  GHOSTED: "SCREENING",
}

/** Only ever suggested. An offer is too important to take from a mail alone. */
const NEVER_AUTOMATIC: readonly ApplicationStatus[] = ["OFFER"]

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

export type Decision = {
  outcome: MailOutcome
  applicationId: string | null
  fromStatus: ApplicationStatus | null
  toStatus: ApplicationStatus | null
}

/** The status to propose when no application could be picked yet. */
function statusForSignal(signal: MailSignal): ApplicationStatus | null {
  if (signal === "REJECTED") return "REJECTED"
  if (signal === "CONFIRMATION" || signal === "NEXT_STAGE" || signal === "OTHER") return null
  return signal
}

export function decide(input: {
  signal: MailSignal
  sure: boolean
  authenticated: boolean
  autoApply: boolean
  match: MatchResult
  receivedAt: Date
  facts: { company: string | null; title: string | null }
}): Decision {
  const { signal, match, authenticated } = input
  const none: Omit<Decision, "outcome"> = {
    applicationId: null,
    fromStatus: null,
    toStatus: null,
  }
  if (signal === "OTHER") return { ...none, outcome: "IGNORED" }

  const app = match.application

  if (signal === "CONFIRMATION") {
    // The subject goes on the timeline, so only from a sender Gmail vouches for.
    if (app && match.certain && authenticated) {
      return { ...none, outcome: "NOTED", applicationId: app.id }
    }
    if (app || match.candidates.length) return { ...none, outcome: "IGNORED" }
    if (!input.facts.company || !input.facts.title) return { ...none, outcome: "IGNORED" }
    // Never added alone. Each application widens what gets searched and read, and a stranger's
    // mail must not be able to do that: "Thank you for applying to mBank" would open up mbank.pl.
    return { ...none, outcome: "PENDING" }
  }

  if (!app) return { ...none, outcome: "PENDING", toStatus: statusForSignal(signal) }

  const from = app.status as ApplicationStatus
  const to = targetStatus(signal, from)
  if (!to) {
    return match.certain && authenticated
      ? { ...none, outcome: "NOTED", applicationId: app.id }
      : { ...none, outcome: "IGNORED" }
  }
  const automatic =
    input.autoApply &&
    authenticated &&
    input.sure &&
    match.certain &&
    isActiveStatus(from) &&
    // Someone at the offer stage hears it from a person. A closed process stays closed.
    from !== "OFFER" &&
    !NEVER_AUTOMATIC.includes(to) &&
    // The person changed it after this mail arrived: they know something newer.
    input.receivedAt.getTime() >= app.statusChangedAt.getTime()
  return {
    outcome: automatic ? "APPLIED" : "PENDING",
    applicationId: app.id,
    fromStatus: from,
    toStatus: to,
  }
}
