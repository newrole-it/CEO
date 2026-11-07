"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useId, useState } from "react"
import { Check, Circle, CircleAlert, FileText, LoaderCircle, Minus, Sparkles } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { useToast } from "@newrole/ui/interactive"
import { CompanyInitial, Field } from "@newrole/ui/primitives"
import {
  LETTER_STEPS,
  TAILOR_STEPS,
  type StepState,
  type StepUpdate,
  type TailorStep,
} from "@newrole/cv-core/progress"
import type { OfferTextOrigin } from "@newrole/cv-core/tailor"
import { CvEditorBackendProvider, useCvBackend, type CvEditorBackend } from "./backend"
import { ConsentCompany, consentCompany, type ConsentChoice } from "./ConsentCompany"
import { useCvCopy } from "./locale"
import { STATE_KEY, STEP_KEYS, stepLine } from "./steps"
import { tailorErrorKey } from "./tailor-errors"

export type StartJob = {
  id: string
  company: string
  title: string
  language: "pl" | "en"
  withheld: boolean
}

/** `hasLetter`: the CV has its general letter, which the letter for the offer is made from */
export type StartCv = { id: string; title: string; isDefault: boolean; hasLetter?: boolean }

type Phase = "idle" | "cv" | "letter"

/** How often the page asks for the run's steps while it waits. */
const POLL_MS = 1000

function StepIcon({ state }: { state: StepState | "waiting" }) {
  if (state === "running") return <LoaderCircle className="spin" aria-hidden />
  if (state === "done") return <Check aria-hidden />
  if (state === "failed") return <CircleAlert aria-hidden />
  if (state === "skipped") return <Minus aria-hidden />
  return <Circle aria-hidden />
}

/** A run's id, unique enough to follow one run of one person. */
function newRunId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

type StartProps = {
  job: StartJob
  cvs: StartCv[]
  hasLetter: boolean
}

/**
 * Before anything is written for an offer: what to start from, then the model's two steps. It
 * opens the CV when done. `backend` as for CvEditor; its offerText says how much of the offer the
 * model will read.
 */
export function TailorStart({ backend, ...props }: StartProps & { backend: CvEditorBackend }) {
  return (
    <CvEditorBackendProvider backend={backend}>
      <Start {...props} />
    </CvEditorBackendProvider>
  )
}

function Start({ job, cvs, hasLetter }: StartProps) {
  const { t, locale } = useCvCopy()
  const backend = useCvBackend()
  const toast = useToast()
  const router = useRouter()
  const baseId = useId()
  const languageId = useId()
  const noteId = useId()
  const initialBase = cvs.find((cv) => cv.isDefault)?.id ?? cvs[0]?.id ?? ""
  const [base, setBase] = useState(initialBase)
  const [language, setLanguage] = useState<"pl" | "en">(job.language)
  const [withLetter, setWithLetter] = useState(!hasLetter)
  const [note, setNote] = useState("")
  // the offer's company, ready to go into the consent clause
  const [consent, setConsent] = useState<ConsentChoice>({
    on: Boolean(job.company.trim()),
    company: job.company,
  })
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [steps, setSteps] = useState<StepUpdate[]>([])
  const [offerText, setOfferText] = useState<{ origin: OfferTextOrigin; chars: number } | null>(
    job.withheld ? { origin: "withheld", chars: 0 } : null
  )

  // the first read can take seconds (1 s per host), so the page does not wait for it
  useEffect(() => {
    if (job.withheld) return
    let live = true
    const status = backend.offerText
      ? backend.offerText(job.id)
      : Promise.resolve({ origin: "none" as const, chars: 0 })
    status
      .then((status) => live && setOfferText(status))
      .catch(() => live && setOfferText({ origin: "none", chars: 0 }))
    return () => {
      live = false
    }
  }, [job.id, job.withheld, backend])

  // the run's steps, read while its request runs; a failed read waits for the next one
  useEffect(() => {
    const progress = backend.tailor.progress
    if (!runId || !progress) return
    let live = true
    const read = () =>
      progress(runId)
        .then((found) => live && found && setSteps(found.steps))
        .catch(() => undefined)
    void read()
    const timer = window.setInterval(read, POLL_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [runId, backend])

  async function start() {
    setError(null)
    setSteps([])
    setPhase("cv")
    const run = newRunId()
    setRunId(run)
    const trimmed = note.trim() || undefined
    try {
      const cv = await backend.tailor.cv({
        jobId: job.id,
        baseCvId: base || undefined,
        language,
        note: trimmed,
        locale,
        consentCompany: consentCompany(consent),
        runId: run,
      })
      if (!cv) throw new Error("no result")
      if (withLetter) {
        setPhase("letter")
        try {
          await backend.tailor.letter({ jobId: job.id, language, note: trimmed, runId: run })
        } catch {
          toast.show({ message: t("tl.err.letter"), tone: "danger", duration: 8000 })
        }
      }
      router.replace(backend.routes.match?.(job.id) ?? backend.routes.document(cv.id))
    } catch (failure) {
      setError(t(tailorErrorKey(failure)))
      setPhase("idle")
      setRunId(null)
    }
  }

  const shownSteps: TailorStep[] = [...TAILOR_STEPS, ...(withLetter ? LETTER_STEPS : [])]

  const busy = phase !== "idle"
  const jobPage = backend.routes.job(job.id)
  return (
    <div className="card card--pad cvt-start">
      <div className="cvt-start__job">
        <CompanyInitial name={job.company} size="lg" />
        <div>
          <strong>{job.title}</strong>
          <span className="t-sm muted">{job.company}</span>
        </div>
      </div>
      <p>{t("tl.start.lead")}</p>

      {busy && backend.tailor.progress ? (
        <div className="stack-sm">
          <p className="cvt-run__now" aria-live="polite">
            <LoaderCircle className="spin" aria-hidden />
            {t(phase === "letter" ? "tl.progress.letter" : "tl.progress.cv")}
          </p>
          <ol className="cvt-run" aria-label={t("tl.progress.label")}>
            {shownSteps.map((step) => {
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
          <p className="t-sm muted">{t("tl.progress.hint")}</p>
        </div>
      ) : busy ? (
        <div aria-live="polite" className="stack-sm">
          <ol className="cvt-steps">
            <li aria-current={phase === "cv" ? "step" : undefined}>
              {phase === "cv" ? (
                <LoaderCircle className="spin" aria-hidden />
              ) : (
                <Check aria-hidden />
              )}
              {t("tl.progress.cv")}
            </li>
            {withLetter ? (
              <li aria-current={phase === "letter" ? "step" : undefined}>
                {phase === "letter" ? (
                  <LoaderCircle className="spin" aria-hidden />
                ) : (
                  <FileText aria-hidden />
                )}
                {t("tl.progress.letter")}
              </li>
            ) : null}
          </ol>
          <p className="t-sm muted">{t("tl.progress.wait")}</p>
        </div>
      ) : (
        <form
          className="cvt-start"
          onSubmit={(event) => {
            event.preventDefault()
            void start()
          }}
        >
          <div className="cvt-start__row">
            <Field label={t("tl.start.base")} htmlFor={baseId}>
              <select
                id={baseId}
                className="select"
                value={base}
                onChange={(event) => setBase(event.target.value)}
              >
                {cvs.length ? null : <option value="">{t("tl.start.baseProfile")}</option>}
                {cvs.map((cv) => (
                  <option key={cv.id} value={cv.id}>
                    {cv.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={t("tl.start.language")}
              htmlFor={languageId}
              hint={t("tl.start.languageHint")}
            >
              <select
                id={languageId}
                className="select"
                value={language}
                onChange={(event) => setLanguage(event.target.value === "en" ? "en" : "pl")}
              >
                <option value="pl">{t("cv.lang.pl")}</option>
                <option value="en">{t("cv.lang.en")}</option>
              </select>
            </Field>
          </div>

          {!offerText ? (
            <p className="t-sm muted" role="status">
              {t("tl.start.reading")}
            </p>
          ) : offerText.origin === "full" ? (
            <p className="t-sm muted" role="status">
              {t("tl.start.full", { n: offerText.chars })}
            </p>
          ) : (
            <p className="cvt-notice" role="status">
              {offerText.origin === "excerpt"
                ? t("tl.start.excerpt", { n: offerText.chars })
                : t(offerText.origin === "withheld" ? "tl.start.withheld" : "tl.start.noText")}
            </p>
          )}

          <Field label={t("tl.start.note")} htmlFor={noteId} hint={t("tl.start.noteOffer")}>
            <textarea
              id={noteId}
              className="textarea"
              rows={3}
              maxLength={4000}
              value={note}
              placeholder={t("tl.start.notePh")}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>

          <ConsentCompany value={consent} onChange={setConsent} language={language} />

          {hasLetter ? null : (
            <label className="cvt-check">
              <input
                type="checkbox"
                checked={withLetter}
                onChange={(event) => setWithLetter(event.target.checked)}
              />
              <span>
                {t("tl.start.letter")}
                <small>
                  {t(
                    cvs.find((cv) => cv.id === base)?.hasLetter
                      ? "tl.start.letterHintGeneral"
                      : "tl.start.letterHint"
                  )}
                </small>
              </span>
            </label>
          )}

          {error ? (
            <p className="field__error" role="alert">
              {error}
            </p>
          ) : null}

          <div>
            <Button type="submit" variant="primary" icon={<Sparkles />}>
              {t("tl.start.go")}
            </Button>
          </div>
        </form>
      )}
      {jobPage ? (
        <p className="t-sm">
          <Link className="link link--quiet" href={jobPage}>
            {t("tl.start.back")}
          </Link>
        </p>
      ) : null}
    </div>
  )
}
