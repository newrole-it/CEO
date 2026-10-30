"use client"

import { invoke } from "@blitzjs/rpc"
import { useCallback } from "react"
import saveFeedback from "src/app/feedback/mutations/saveFeedback"
import clearFeedback from "src/app/feedback/mutations/clearFeedback"
import getFeedbackPrompt from "src/app/feedback/queries/getFeedbackPrompt"
import listSimilar from "src/app/feedback/queries/listSimilar"
import type { FeedbackAspect } from "src/shared/feedback-aspects"
import type { FeedbackPrompt, RankedOffer } from "src/server/preferences/types"
import { useLocale } from "src/app/i18n/Locale"
import type { Verdict } from "./types"

/**
 * Feedback calls. saveFeedback creates a guest session when there is none, so a Like
 * always saves; errors throw so the caller can roll back and show "Nie zapisano".
 */
export function useFeedback() {
  const locale = useLocale()

  const save = useCallback(
    async (input: {
      jobId: string
      verdict: Verdict
      aspects?: FeedbackAspect[]
      tags?: string[]
      note?: string | null
    }) => {
      await invoke(saveFeedback, input)
    },
    []
  )

  const clear = useCallback(async (jobId: string) => {
    await invoke(clearFeedback, { jobId })
  }, [])

  const prompt = useCallback(
    async (jobId: string): Promise<FeedbackPrompt | null> => {
      try {
        return await invoke(getFeedbackPrompt, { jobId, locale })
      } catch {
        return null
      }
    },
    [locale]
  )

  const similar = useCallback(
    async (
      jobId: string,
      aspects?: FeedbackAspect[]
    ): Promise<{ offers: RankedOffer[]; basis: string } | null> => {
      try {
        return await invoke(listSimilar, {
          jobId,
          limit: 6,
          aspects: aspects?.length ? aspects : undefined,
          locale,
        })
      } catch {
        return null
      }
    },
    [locale]
  )

  return { save, clear, prompt, similar }
}
