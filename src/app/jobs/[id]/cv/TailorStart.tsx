"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { invoke } from "@blitzjs/rpc"
import { useEffect, useId, useState } from "react"
import { Check, FileText, LoaderCircle, Sparkles } from "lucide-react"
import { Button } from "src/app/components/ds/Button"
import { useToast } from "src/app/components/ds/interactive"
import { CompanyInitial, Field } from "src/app/components/ds/primitives"
import { useCopy } from "src/app/i18n/Locale"
import generateCoverLetter from "src/app/cv/mutations/generateCoverLetter"
import tailorCvForJob from "src/app/cv/mutations/tailorCvForJob"
import getOfferTextStatus from "src/app/cv/queries/getOfferTextStatus"
import { tailorErrorKey } from "src/app/cv/tailor-errors"
import type { OfferTextOrigin } from "@newrole/cv-core/tailor"

export type StartJob = {
  id: string
  company: string
  title: string
  language: "pl" | "en"
  withheld: boolean
}

export type StartCv = { id: string; title: string; isDefault: boolean }

type Phase = "idle" | "cv" | "letter"

/** /jobs/[id]/cv before anything exists: what to start from, then the model's two steps. */
export function TailorStart({
  job,
  cvs,
  hasLetter,
}: {
  job: StartJob
  cvs: StartCv[]
  hasLetter: boolean
}) {
  const { t, locale } = useCopy()
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
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [offerText, setOfferText] = useState<{ origin: OfferTextOrigin; chars: number } | null>(
    job.withheld ? { origin: "withheld", chars: 0 } : null
  )

  // the first read can take seconds (1 s per host), so the page does not wait for it
  useEffect(() => {
    if (job.withheld) return
    let live = true
    invoke(getOfferTextStatus, { jobId: job.id })
      .then((status) => live && setOfferText(status))
      .catch(() => live && setOfferText({ origin: "none", chars: 0 }))
    return () => {
      live = false
    }
  }, [job.id, job.withheld])

  async function start() {
    setError(null)
    setPhase("cv")
    const trimmed = note.trim() || undefined
    try {
      const cv = await invoke(tailorCvForJob, {
        jobId: job.id,
        baseCvId: base || undefined,
        language,
        note: trimmed,
        locale,
      })
      if (!cv) throw new Error("no result")
      if (withLetter) {
        setPhase("letter")
        try {
          await invoke(generateCoverLetter, { jobId: job.id, language, note: trimmed })
        } catch {
          toast.show({ message: t("tl.err.letter"), tone: "danger", duration: 8000 })
        }
      }
      router.replace(`/cv/${cv.id}`)
    } catch (failure) {
      setError(t(tailorErrorKey(failure)))
      setPhase("idle")
    }
  }

  const busy = phase !== "idle"
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

      {busy ? (
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
          <p className="t-sm muted">{t("tl.progress.hint")}</p>
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

          {hasLetter ? null : (
            <label className="cvt-check">
              <input
                type="checkbox"
                checked={withLetter}
                onChange={(event) => setWithLetter(event.target.checked)}
              />
              <span>
                {t("tl.start.letter")}
                <small>{t("tl.start.letterHint")}</small>
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
      <p className="t-sm">
        <Link className="link link--quiet" href={`/jobs/${job.id}`}>
          {t("tl.start.back")}
        </Link>
      </p>
    </div>
  )
}
