"use client"

import { useEffect, useId, useState } from "react"
import { invoke } from "@blitzjs/rpc"
import { FileText } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { Modal, ModalHead } from "@newrole/ui/interactive"
import { Field } from "@newrole/ui/primitives"
import type { OfferOutcome } from "src/server/applications/types"
import addOffer from "../mutations/addOffer"
import readNewOffer from "../mutations/readNewOffer"

type Workplace = "" | "REMOTE" | "HYBRID" | "ONSITE"

const EMPTY = { company: "", title: "", location: "", workplace: "" as Workplace, salaryText: "" }

type Step =
  | { name: "link" }
  | { name: "form"; url: string; outcome: OfferOutcome }
  | { name: "done"; jobId: string; company: string; title: string; known: boolean }

const OUTCOME_HINT: Record<OfferOutcome, CopyKey> = {
  read: "oa.read",
  partial: "oa.partial",
  "link-only": "oa.linkOnly",
  unreadable: "oa.unreadable",
}

/**
 * "Dodaj ofertę": a link to an offer the index lacks, read, checked by the person and stored, so
 * the CV, the cover letter and the rest work on it as on any other offer.
 */
export function AddOfferDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useCopy()
  const id = useId()
  const [step, setStep] = useState<Step>({ name: "link" })
  const [url, setUrl] = useState("")
  const [form, setForm] = useState(EMPTY)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setStep({ name: "link" })
    setUrl("")
    setForm(EMPTY)
    setPending(false)
    setError(null)
  }, [open])

  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) =>
    setForm((value) => ({ ...value, [key]: event.target.value }))

  async function check(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!url.trim()) {
      setError(t("oa.err.badUrl"))
      return
    }
    setPending(true)
    try {
      const result = await invoke(readNewOffer, { url: url.trim() })
      if (result.kind === "invalid") setError(t("oa.err.badUrl"))
      else if (result.kind === "refused") setError(t("oa.err.refused"))
      else if (result.kind === "indexed") {
        setStep({
          name: "done",
          jobId: result.jobId,
          company: result.company,
          title: result.title,
          known: !result.added,
        })
      } else {
        const facts = result.facts
        setForm({
          company: facts?.company ?? "",
          title: facts?.title ?? "",
          location: facts?.location ?? "",
          workplace: "",
          salaryText: facts?.salaryText ?? "",
        })
        setStep({ name: "form", url: result.url, outcome: result.outcome })
      }
    } catch {
      setError(t("oa.err.read"))
    } finally {
      setPending(false)
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (step.name !== "form") return
    setError(null)
    const company = form.company.trim()
    const title = form.title.trim()
    if (company.length < 2 || title.length < 2) {
      setError(t("oa.required"))
      return
    }
    setPending(true)
    try {
      const result = await invoke(addOffer, {
        url: step.url,
        company,
        title,
        location: form.location.trim() || undefined,
        workplace: form.workplace || undefined,
        salaryText: form.salaryText.trim() || undefined,
      })
      if ("error" in result) setError(t("oa.err.save"))
      else setStep({ name: "done", jobId: result.jobId, company, title, known: false })
    } catch {
      setError(t("oa.err.save"))
    } finally {
      setPending(false)
    }
  }

  const errorLine = error ? (
    <p className="field__error" role="alert">
      {error}
    </p>
  ) : null

  return (
    <Modal open={open} onClose={onClose} labelledBy={`${id}-title`} className="modal--wide">
      <ModalHead title={t("oa.title")} id={`${id}-title`} onClose={onClose} />
      {step.name === "link" ? (
        <form className="modal__body app-add" onSubmit={(event) => void check(event)} noValidate>
          <p className="t-sm muted">{t("oa.lead")}</p>
          <Field
            label={t("oa.url")}
            htmlFor={`${id}-url`}
            hint={<span aria-live="polite">{pending ? t("oa.reading") : t("oa.urlHint")}</span>}
          >
            <input
              id={`${id}-url`}
              className="input"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              value={url}
              maxLength={2000}
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>
          {errorLine}
          <div className="modal__foot" style={{ padding: "4px 0 0" }}>
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {t("oa.check")}
            </Button>
          </div>
        </form>
      ) : step.name === "form" ? (
        <form className="modal__body app-add" onSubmit={(event) => void save(event)} noValidate>
          <p className="t-sm" role="status">
            {t(OUTCOME_HINT[step.outcome])}
          </p>
          <p className="t-sm muted" style={{ overflowWrap: "anywhere" }}>
            <a
              className="link link--quiet"
              href={step.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              {step.url}
            </a>
          </p>
          <div className="app-add__pair">
            <Field label={t("oa.company")} htmlFor={`${id}-company`}>
              <input
                id={`${id}-company`}
                className="input"
                value={form.company}
                maxLength={120}
                required
                onChange={set("company")}
              />
            </Field>
            <Field label={t("oa.role")} htmlFor={`${id}-role`}>
              <input
                id={`${id}-role`}
                className="input"
                value={form.title}
                maxLength={200}
                required
                onChange={set("title")}
              />
            </Field>
          </div>
          <div className="app-add__pair">
            <Field label={t("oa.location")} htmlFor={`${id}-location`}>
              <input
                id={`${id}-location`}
                className="input"
                value={form.location}
                maxLength={200}
                placeholder={t("oa.locationPh")}
                onChange={set("location")}
              />
            </Field>
            <Field label={t("oa.workplace")} htmlFor={`${id}-workplace`}>
              <select
                id={`${id}-workplace`}
                className="select"
                value={form.workplace}
                onChange={set("workplace")}
              >
                <option value="">{t("oa.workplace.any")}</option>
                <option value="REMOTE">{t("oa.workplace.remote")}</option>
                <option value="HYBRID">{t("oa.workplace.hybrid")}</option>
                <option value="ONSITE">{t("oa.workplace.onsite")}</option>
              </select>
            </Field>
          </div>
          <Field label={t("oa.salary")} htmlFor={`${id}-salary`}>
            <input
              id={`${id}-salary`}
              className="input"
              value={form.salaryText}
              maxLength={120}
              placeholder={t("oa.salaryPh")}
              onChange={set("salaryText")}
            />
          </Field>
          {errorLine}
          <div className="modal__foot" style={{ padding: "4px 0 0" }}>
            <Button
              variant="ghost"
              onClick={() => {
                setError(null)
                setStep({ name: "link" })
              }}
            >
              {t("oa.back")}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {t("oa.submit")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="modal__body app-add">
          <p className="app-add__found is-found" role="status">
            {t(step.known ? "oa.known" : "oa.added", { company: step.company, title: step.title })}
          </p>
          <p className="t-sm muted">{t("oa.next")}</p>
          <div className="modal__foot" style={{ padding: "4px 0 0" }}>
            <ButtonLink href={`/jobs/${step.jobId}`} variant="outline">
              {t("oa.open")}
            </ButtonLink>
            <ButtonLink href={`/jobs/${step.jobId}/cv`} variant="primary" icon={<FileText />}>
              {t("oa.tailor")}
            </ButtonLink>
          </div>
        </div>
      )}
    </Modal>
  )
}
