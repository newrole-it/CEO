"use client"

import { useEffect, useId, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Circle, CircleAlert, Gauge, LoaderCircle, Minus, RefreshCw } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { Modal } from "@newrole/ui/interactive"
import type { StepState, StepUpdate } from "@newrole/cv-core/progress"
import { STATE_KEY, STEP_KEYS, stepLine } from "@newrole/cv-editor/steps"
import getTailorProgress from "src/app/cv/queries/getTailorProgress"
import { useCopy } from "src/app/i18n/Locale"
import { invoke } from "src/app/rpc"
import runEvaluation from "./mutations/runEvaluation"

/**
 * "Oceń ofertę": starts an evaluation of the offer (runEvaluation) and shows its steps while it
 * runs, as the match page does for a round (../match/MatchRun.tsx). The two steps a model takes
 * are tailoring's first two; the third is code. When it ends, the page shows the new evaluation.
 */

/** How often the dialog asks for the run's steps while it waits. */
const POLL_MS = 1000

/** The steps of @newrole/cv-core/progress an evaluation reports. */
const MODEL_STEPS = ["offer", "match"] as const

/** A run's id, unique enough to follow one run of one person. */
function newRunId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function StepIcon({ state }: { state: StepState | "waiting" }) {
  if (state === "running") return <LoaderCircle className="spin" aria-hidden />
  if (state === "done") return <Check aria-hidden />
  if (state === "failed") return <CircleAlert aria-hidden />
  if (state === "skipped") return <Minus aria-hidden />
  return <Circle aria-hidden />
}

export function RunEvaluation({ jobId, again }: { jobId: string; again: boolean }) {
  const { t, locale } = useCopy()
  const router = useRouter()
  const titleId = useId()
  const [runId, setRunId] = useState<string | null>(null)
  const [steps, setSteps] = useState<StepUpdate[]>([])
  const [error, setError] = useState<string | null>(null)

  // the run's steps, read while its request runs; a failed read waits for the next one
  useEffect(() => {
    if (!runId) return
    let live = true
    const read = () =>
      invoke(getTailorProgress, { runId })
        .then((found) => live && found && setSteps(found.steps))
        .catch(() => undefined)
    void read()
    const timer = window.setInterval(read, POLL_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [runId])

  async function start() {
    const run = newRunId()
    setError(null)
    setSteps([])
    setRunId(run)
    try {
      await invoke(runEvaluation, { jobId, locale, runId: run })
      router.refresh()
    } catch (failure) {
      const missing = failure instanceof Error && failure.name === "NotFoundError"
      setError(t(missing ? "ev.err.noJob" : "ev.err.failed"))
    } finally {
      setRunId(null)
    }
  }

  const running = Boolean(runId)
  // code scores once the model's steps have ended, whichever way
  const modelDone = MODEL_STEPS.every((step) => {
    const state = steps.find((entry) => entry.step === step)?.state
    return state != null && state !== "running"
  })
  const scoring: StepState | "waiting" = modelDone ? "running" : "waiting"
  return (
    <>
      <Button
        variant={again ? "outline" : "primary"}
        icon={again ? <RefreshCw /> : <Gauge />}
        disabled={running}
        onClick={() => void start()}
      >
        {t(again ? "ev.rerun" : "ev.run")}
      </Button>
      {error ? (
        <p className="field__error ev-run__error" role="alert">
          {error}
        </p>
      ) : null}
      <Modal open={running} onClose={() => undefined} labelledBy={titleId}>
        <div className="modal__head">
          <h2 className="t-h3" id={titleId}>
            {t("ev.run.title")}
          </h2>
        </div>
        <div className="modal__body stack-sm">
          <ol className="cvt-run" aria-live="polite">
            {MODEL_STEPS.map((step) => {
              const update = steps.find((entry) => entry.step === step)
              const state = update?.state ?? "waiting"
              return (
                <li
                  key={step}
                  className="cvt-run__step"
                  data-state={state}
                  aria-current={state === "running" ? "step" : undefined}
                >
                  <StepIcon state={state} />
                  <div>
                    <strong>
                      {t(STEP_KEYS[step].label)}
                      <span className="sr-only">: {t(STATE_KEY[state])}</span>
                    </strong>
                    <span className="t-sm muted">{stepLine(t, update, step)}</span>
                  </div>
                </li>
              )
            })}
            <li
              className="cvt-run__step"
              data-state={scoring}
              aria-current={scoring === "running" ? "step" : undefined}
            >
              <StepIcon state={scoring} />
              <div>
                <strong>
                  {t("ev.step.score")}
                  <span className="sr-only">: {t(STATE_KEY[scoring])}</span>
                </strong>
                <span className="t-sm muted">{t("ev.step.score.hint")}</span>
              </div>
            </li>
          </ol>
          <p className="t-sm muted">{t("ev.run.wait")}</p>
        </div>
      </Modal>
    </>
  )
}
