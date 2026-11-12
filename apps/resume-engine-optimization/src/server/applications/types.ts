import type { ApplicationSource, ApplicationStatus, Channel } from "src/shared/applications"

export type { ApplicationSource, ApplicationStatus, Channel }

export type ApplicationEventType =
  "created" | "status" | "note" | "next-step" | "answers" | "edit" | "mail"

/** One application as every surface sees it: tracker, sheet, MCP and the Chrome extension. */
export type ApplicationView = {
  id: string
  jobId: string | null
  company: string
  title: string
  url: string | null
  location: string | null
  /** Pay in the posting */
  salaryText: string | null
  /** Pay the person gave in the application form */
  statedSalary: string | null
  status: ApplicationStatus
  /** Free label for the step, e.g. "2. rozmowa techniczna" */
  stageNote: string | null
  /** The last active stage before the application closed (shown for REJECTED / WITHDRAWN) */
  closedAtStage: ApplicationStatus | null
  appliedAt: Date
  statusChangedAt: Date
  nextStep: string | null
  nextStepAt: Date | null
  contact: string | null
  notes: string | null
  source: ApplicationSource
  cvDocumentId: string | null
  createdAt: Date
  updatedAt: Date
}

export type ApplicationEventView = {
  id: string
  type: ApplicationEventType
  fromStatus: ApplicationStatus | null
  toStatus: ApplicationStatus | null
  note: string | null
  channel: Channel
  at: Date
}

export type ApplicationDetail = ApplicationView & {
  /** Oldest first */
  events: ApplicationEventView[]
  /** The form as sent, then answers from the answer bank linked to this application */
  answers: { id: string; question: string; answer: string }[]
  cv: { id: string; title: string } | null
}

export type ApplicationStats = {
  total: number
  active: number
  /** SCREENING, INTERVIEW, TASK, FINAL */
  interviewing: number
  /** OFFER and ACCEPTED */
  offers: number
  rejected: number
  /** Share of applications that got any reply (0–1); null with no applications */
  responseRate: number | null
  /** Active applications whose next step date has passed */
  overdue: number
  byStatus: Record<ApplicationStatus, number>
  /** Where rejections and withdrawals happened: closedAtStage → count */
  closedAt: Partial<Record<ApplicationStatus, number>>
}

export type ApplicationGroup = "active" | "closed" | "rejected" | "all"

/** One field of a sent application form. kind is a FieldKind from src/server/autofill/fields.ts. */
export type FormAnswer = { question: string; answer: string; kind: string | null }

/** What a posting link told us. jobId is set when the offer is in the index. */
export type OfferFacts = {
  jobId: string | null
  company: string | null
  title: string | null
  location: string | null
  salaryText: string | null
}

/**
 * read: company and role are known, safe to save as they are. partial: a part of them, or a guess
 * from a page without structured data, to check first. link-only: the site is never fetched, only
 * what the link spells out is known. unreadable: fetching failed or found nothing.
 */
export type OfferOutcome = "read" | "partial" | "link-only" | "unreadable"
