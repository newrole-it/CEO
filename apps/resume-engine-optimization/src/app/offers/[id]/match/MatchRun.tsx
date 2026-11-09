"use client"

import { useEffect, useId, useState } from "react"
import { useRouter } from "next/navigation"
import { invoke } from "@blitzjs/rpc"
import { Check, Circle, CircleAlert, Gauge, LoaderCircle, Minus, Sparkles } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { Modal } from "@newrole/ui/interactive"
import { TAILOR_STEPS, type StepState, type StepUpdate } from "@newrole/cv-core/progress"
import { STATE_KEY, STEP_KEYS, stepLine } from "@newrole/cv-editor/steps"
import { tailorErrorKey } from "@newrole/cv-editor/tailor-errors"
import { useCopy } from "src/app/i18n/Locale"
import getTailorProgress from "src/app/cv/queries/getTailorProgress"
import runMatchRound from "src/app/offers/mutations/runMatchRound"

/**
 * A run of the next round of an offer's match (runMatchRound, src/server/cv/tailor.ts), with the
 * dialog that shows its steps while it runs. When it ends, the dashboard opens on the new round.
 */

/** How often the dialog asks for the run's steps while it waits. */
const POLL_MS = 1000

/** A run's id, unique enough to follow one run of one person. */
function newRunId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * What a round does with the CV: "rewrite" rewrites it as it is, "check" only checks it, "fresh"
 * writes it anew from the general CV it was tailored from.
 */
export type RunMode = "rewrite" | "check" | "fresh"

/** Starts a round of the offer's match. */
export function useMatchRun(jobId: string) {
  const { t, locale } = useCopy()
  const router = useRouter()
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

  async function start(mode: RunMode) {
    const run = newRunId()
    setError(null)
    setSteps([])
    setRunId(run)
    try {
      await invoke(runMatchRound, {
        jobId,
        rewrite: mode !== "check",
        fresh: mode === "fresh",
        locale,
        runId: run,
      })
      router.replace(`/offers/${jobId}/match`)
      router.refresh()
    } catch (failure) {
      setError(t(tailorErrorKey(failure)))
      setRunId(null)
    }
  }

  return { start, running: Boolean(runId), steps, error }
}

function StepIcon({ state }: { state: StepState | "waiting" }) {
  if (state === "running") return <LoaderCircle className="spin" aria-hidden />
  if (state === "done") return <Check aria-hidden />
  if (state === "failed") return <CircleAlert aria-hidden />
  if (state === "skipped") return <Minus aria-hidden />
  return <Circle aria-hidden />
}

/** The steps of round `number` while it runs. */
export function RunDialog({
  open,
  number,
  steps,
}: {
  open: boolean
  number: number
  steps: StepUpdate[]
}) {
  const { t } = useCopy()
  const titleId = useId()
  return (
    <Modal open={open} onClose={() => undefined} labelledBy={titleId}>
      <div className="modal__head">
        <h2 className="t-h3" id={titleId}>
          {t("mt.next.running", { n: number })}
        </h2>
      </div>
      <div className="modal__body stack-sm">
        <ol className="cvt-run" aria-live="polite">
          {TAILOR_STEPS.map((step) => {
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
        </ol>
        <p className="t-sm muted">{t("mt.next.wait")}</p>
      </div>
    </Modal>
  )
}

/**
 * The first round of a CV tailored before matches were scored: check it as it is, or rewrite it
 * for the offer and check that.
 */
export function FirstRound({ jobId }: { jobId: string }) {
  const { t } = useCopy()
  const run = useMatchRun(jobId)
  return (
    <>
      <Button
        variant="primary"
        icon={<Gauge />}
        disabled={run.running}
        onClick={() => void run.start("check")}
      >
        {t("mt.none.check")}
      </Button>
      <Button
        variant="outline"
        icon={<Sparkles />}
        disabled={run.running}
        onClick={() => void run.start("rewrite")}
      >
        {t("mt.none.rewrite")}
      </Button>
      {run.error ? (
        <p className="field__error mt-first__error" role="alert">
          {run.error}
        </p>
      ) : null}
      <RunDialog open={run.running} number={1} steps={run.steps} />
    </>
  )
}
