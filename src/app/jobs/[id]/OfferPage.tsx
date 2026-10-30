"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { useCopy } from "src/app/i18n/Locale"
import { useToast } from "src/app/components/ds/interactive"
import type { OfferDetail } from "src/server/preferences/detail"
import type { FeedbackPrompt } from "src/server/preferences/types"
import { LikePanel } from "../components/Feedback"
import { OfferDetailView } from "../components/OfferDetail"
import type { Verdict } from "../types"
import { useFeedback } from "../useFeedback"

/** /jobs/[id]: the drawer's content as a standalone, shareable page. */
export function OfferPage({ detail }: { detail: OfferDetail }) {
  const { t } = useCopy()
  const router = useRouter()
  const toast = useToast()
  const feedback = useFeedback()
  const [verdict, setVerdict] = useState<Verdict | null>((detail.feedback?.verdict as Verdict) ?? null)
  const [liking, setLiking] = useState(false)
  const [prompt, setPrompt] = useState<FeedbackPrompt | null | undefined>(undefined)
  const jobId = detail.offer.id

  async function decide(next: Verdict) {
    const prev = verdict
    const value = prev === next ? null : next
    setVerdict(value)
    setLiking(value === "LIKE")
    if (value === "LIKE" && prompt === undefined) void feedback.prompt(jobId).then(setPrompt)
    try {
      if (value) await feedback.save({ jobId, verdict: value })
      else await feedback.clear(jobId)
      if (value === "DISLIKE") toast.show({ message: t("toast.passed") })
      if (value === "APPLIED") toast.show({ message: t("toast.applied") })
    } catch {
      setVerdict(prev)
      toast.show({ message: t("err.save"), tone: "danger" })
    }
  }

  return (
    <div className="card od-page">
      <OfferDetailView
        mode="page"
        titleId="od-title"
        detail={detail}
        loading={false}
        verdict={verdict}
        onVerdict={(next) => void decide(next)}
        onOpenOther={(id) => router.push(`/jobs/${id}`)}
        panel={
          liking ? (
            <LikePanel
              idPrefix="page"
              prompt={prompt ?? null}
              loading={prompt === undefined}
              onSkip={() => {
                setLiking(false)
                toast.show({ message: t("toast.liked") })
              }}
              onSave={(answer) => {
                setLiking(false)
                void feedback
                  .save({ jobId, verdict: "LIKE", ...answer })
                  .then(() => toast.show({ message: t("toast.liked") }))
                  .catch(() => toast.show({ message: t("err.save"), tone: "danger" }))
              }}
            />
          ) : null
        }
      />
    </div>
  )
}
