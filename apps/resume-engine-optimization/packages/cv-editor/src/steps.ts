import type { StepState, StepUpdate, TailorStep } from "@newrole/cv-core/progress"
import type { CvCopyKey, CvT } from "./copy"

/**
 * The steps of writing for an offer in words (@newrole/cv-core/progress): their names, what each
 * does while it runs, and what it found. TailorStart shows them live; an app's match dashboard
 * shows them afterwards.
 */

export const STEP_KEYS: Record<TailorStep, { label: CvCopyKey; hint: CvCopyKey; done: CvCopyKey }> =
  {
    offer: { label: "tl.step.offer", hint: "tl.step.offer.hint", done: "tl.step.offer.done" },
    cv: { label: "tl.step.cv", hint: "tl.step.cv.hint", done: "tl.step.cv.done" },
    match: { label: "tl.step.match", hint: "tl.step.match.hint", done: "tl.step.match.done" },
    tailor: { label: "tl.step.tailor", hint: "tl.step.tailor.hint", done: "tl.step.tailor.done" },
    bullets: {
      label: "tl.step.bullets",
      hint: "tl.step.bullets.hint",
      done: "tl.step.bullets.done",
    },
    ats: { label: "tl.step.ats", hint: "tl.step.ats.hint", done: "tl.step.ats.done" },
    facts: { label: "tl.step.facts", hint: "tl.step.facts.hint", done: "tl.step.facts.done" },
    letter: { label: "tl.step.letter", hint: "tl.step.letter.hint", done: "tl.step.letter.done" },
    letterFacts: {
      label: "tl.step.letterFacts",
      hint: "tl.step.letterFacts.hint",
      done: "tl.step.letterFacts.done",
    },
  }

export const STATE_KEY: Record<StepState | "waiting", CvCopyKey> = {
  running: "tl.step.state.running",
  done: "tl.step.state.done",
  skipped: "tl.step.state.skipped",
  failed: "tl.step.state.failed",
  waiting: "tl.step.state.waiting",
}

/** What a step found, in words: the line under its name once it is done. */
export function stepLine(t: CvT, update: StepUpdate | undefined, step: TailorStep): string {
  const keys = STEP_KEYS[step]
  if (!update) return t(keys.hint)
  if (update.state === "running") return t(keys.hint)
  if (update.state === "failed") return t("tl.step.failed")
  if (update.state === "skipped")
    return t(
      step === "offer"
        ? "tl.step.offer.skipped"
        : step === "match"
        ? "tl.step.match.skipped"
        : "tl.step.state.skipped"
    )
  const detail = update.detail ?? {}
  if (step === "match" && detail.score == null) return t("tl.step.match.doneNoScore")
  if (step === "ats" && detail.after == null) return t("tl.step.ats.doneNoScore")
  return t(keys.done, detail)
}
