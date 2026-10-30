import type { ApplicationSource, ApplicationStatus, Channel } from "src/shared/applications"

export type { ApplicationSource, ApplicationStatus, Channel }

export type ApplicationEventType = "created" | "status" | "note" | "next-step" | "answers" | "edit"

/** One application as every surface sees it: tracker, sheet, MCP and the Chrome extension. */
export type ApplicationView = {
  id: string
  jobId: string | null
  company: string
  title: string
  url: string | null
  location: string | null
  salaryText: string | null
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
  /** Answers from the answer bank given in this application */
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
