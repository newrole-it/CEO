"use client"

import { useEffect, useRef, useState } from "react"
import { invoke } from "@blitzjs/rpc"
import type { PromiseReturnType } from "blitz"
import { useCopy } from "src/app/i18n/Locale"
import { Button } from "src/app/components/ds/Button"
import { Modal, ModalHead } from "src/app/components/ds/interactive"
import { Field } from "src/app/components/ds/primitives"
import type { ApplicationStatus } from "src/shared/applications"
import type { ApplicationView } from "src/server/applications/types"
import createApplication from "./mutations/createApplication"
import lookupApplicationUrl from "./queries/lookupApplicationUrl"
import { dateInput, fromDateInput } from "./rows"
import { StatusSelect } from "./StatusSelect"

type Lookup = PromiseReturnType<typeof lookupApplicationUrl>

const EMPTY = {
  url: "",
  company: "",
  title: "",
  location: "",
  status: "APPLIED" as ApplicationStatus,
  appliedAt: "",
}

/** "Dodaj aplikację": a posting URL (filled from the index when it matches) or company + role. */
export function AddApplicationDialog({
  open,
  onClose,
  onShow,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  onShow: (id: string) => void
  onAdded: (view: ApplicationView, created: boolean) => void
}) {
  const { t } = useCopy()
  const [form, setForm] = useState(EMPTY)
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const asked = useRef("")

  useEffect(() => {
    if (!open) return
    setForm({ ...EMPTY, appliedAt: dateInput(new Date().toISOString()) })
    setLookup(null)
    setError(null)
    asked.current = ""
  }, [open])

  useEffect(() => {
    const url = form.url.trim()
    if (!open || !url || url === asked.current) {
      if (!url) setLookup(null)
      return
    }
    const timer = window.setTimeout(() => {
      asked.current = url
      setChecking(true)
      invoke(lookupApplicationUrl, { url })
        .then((result) => {
          if (asked.current !== url) return
          setLookup(result)
          if (result.job) {
            const job = result.job
            setForm((value) => ({
              ...value,
              company: value.company || job.company,
              title: value.title || job.title,
              location: value.location || job.location || "",
            }))
          }
        })
        .catch(() => setLookup(null))
        .finally(() => setChecking(false))
    }, 450)
    return () => window.clearTimeout(timer)
  }, [form.url, open])

  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) =>
    setForm((value) => ({ ...value, [key]: event.target.value }))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const url = form.url.trim()
    if (url && lookup && !lookup.valid) {
      setError(t("app.add.badUrl"))
      return
    }
    if (!lookup?.job && (!form.company.trim() || !form.title.trim())) {
      setError(t("app.add.required"))
      return
    }
    setPending(true)
    try {
      const result = await invoke(createApplication, {
        url: url || null,
        jobId: lookup?.job?.jobId ?? null,
        company: form.company.trim() || undefined,
        title: form.title.trim() || undefined,
        location: form.location.trim() || null,
        status: form.status,
        appliedAt: fromDateInput(form.appliedAt) ?? undefined,
      })
      onAdded(result.application, result.created)
    } catch {
      setError(t("app.err.save"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="app-add-title" className="modal--wide">
      <ModalHead title={t("app.add.title")} id="app-add-title" onClose={onClose} />
      <form className="modal__body app-add" onSubmit={(event) => void submit(event)} noValidate>
        <Field
          label={t("app.add.url")}
          htmlFor="app-add-url"
          hint={
            <span aria-live="polite">
              {checking
                ? t("app.add.checking")
                : lookup && !lookup.valid
                ? t("app.add.badUrl")
                : lookup?.existing
                ? t("app.add.existing", {
                    company: lookup.existing.company,
                    title: lookup.existing.title,
                  })
                : lookup?.job
                ? t("app.add.found", { company: lookup.job.company, title: lookup.job.title })
                : t("app.add.urlHint")}
            </span>
          }
        >
          <input
            id="app-add-url"
            className="input"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://"
            value={form.url}
            maxLength={2000}
            onChange={set("url")}
          />
        </Field>
        {lookup?.existing ? (
          <div>
            <Button size="sm" variant="outline" onClick={() => onShow(lookup.existing!.id)}>
              {t("app.add.showExisting")}
            </Button>
          </div>
        ) : null}
        <p className="or">{t("app.add.or")}</p>
        <div className="app-add__pair">
          <Field label={t("app.add.company")} htmlFor="app-add-company">
            <input
              id="app-add-company"
              className="input"
              value={form.company}
              maxLength={200}
              onChange={set("company")}
            />
          </Field>
          <Field label={t("app.add.role")} htmlFor="app-add-title-input">
            <input
              id="app-add-title-input"
              className="input"
              value={form.title}
              maxLength={300}
              onChange={set("title")}
            />
          </Field>
        </div>
        <Field label={t("app.add.location")} htmlFor="app-add-location">
          <input
            id="app-add-location"
            className="input"
            value={form.location}
            maxLength={200}
            onChange={set("location")}
          />
        </Field>
        <div className="app-add__pair">
          <Field label={t("app.add.status")} htmlFor="app-add-status">
            <StatusSelect
              id="app-add-status"
              size="lg"
              value={form.status}
              onChange={(status) => setForm((value) => ({ ...value, status }))}
            />
          </Field>
          <Field label={t("app.add.appliedAt")} htmlFor="app-add-date">
            <input
              id="app-add-date"
              className="input"
              type="date"
              value={form.appliedAt}
              onChange={set("appliedAt")}
            />
          </Field>
        </div>
        {error ? (
          <p className="field__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal__foot" style={{ padding: "4px 0 0" }}>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            {t("app.add.submit")}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
