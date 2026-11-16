"use client"

import "../../../stories/interview.css"
import Link from "next/link"
import { MessagesSquare } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { inInterviewStage } from "src/server/interview/types"

/**
 * The link to an offer's interview preparation, for the offer page and the application drawer.
 * With `status` (an application's status) it shows only while the application is between the
 * first screen and the final round (SCREENING, INTERVIEW, TASK, FINAL); without it, always.
 * An application with no offer (jobId null) has no preparation: do not render the card for it.
 */
export function InterviewCard({ jobId, status }: { jobId: string; status?: string | null }) {
  const { t } = useCopy()
  if (status !== undefined && !inInterviewStage(status)) return null
  return (
    <Link className="card card--hover iv-card" href={interviewPath(jobId)}>
      <MessagesSquare aria-hidden />
      <span className="iv-card__text">
        <strong>{t("iv.card.title")}</strong>
        <span className="t-sm muted">{t("iv.card.body")}</span>
      </span>
    </Link>
  )
}

/** Where an offer's interview preparation lives. */
export function interviewPath(jobId: string): string {
  return `/offers/${encodeURIComponent(jobId)}/interview`
}
