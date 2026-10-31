"use client"

import { useEffect, useRef, useState } from "react"
import { invoke } from "@blitzjs/rpc"
import { useCopy } from "src/app/i18n/Locale"
import { Button } from "src/app/components/ds/Button"
import { Modal, ModalHead } from "src/app/components/ds/interactive"
import { Field } from "src/app/components/ds/primitives"
import { refillForm } from "src/server/applications/logic"
import type { ApplicationStatus } from "src/shared/applications"
import type { ApplicationView, OfferFacts, OfferUrlCheck } from "src/server/applications/types"
import createApplication from "./mutations/createApplication"
import readApplicationUrl from "./mutations/readApplicationUrl"
import lookupApplicationUrl from "./queries/lookupApplicationUrl"
import { dateInput, fromDateInput } from "./rows"
import { StatusSelect } from "./StatusSelect"

const EMPTY = {
  url: "",
  company: "",
  title: "",
  location: "",
  salaryText: "",
  status: "APPLIED" as ApplicationStatus,
  appliedAt: "",
}

const UNREADABLE: OfferUrlCheck = {
  valid: true,
  url: null,
  outcome: "unreadable",
  job: null,
  existing: null,
}

/** "Dodaj aplikację": a posting URL, read and filled in by us, or company + role by hand. */
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
  const [check, setCheck] = useState<OfferUrlCheck | null>(null)
  const [busy, setBusy] = useState<"index" | "page" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const run = useRef<{ url: string; read: boolean; done: Promise<OfferUrlCheck | null> } | null>(
    null
  )
  const filled = useRef<OfferFacts | null>(null)
  const pasted = useRef(false)

  /** One request per link. A newer link makes the answer to an older one irrelevant. */
  function ask(url: string, read: boolean): Promise<OfferUrlCheck | null> {
    const current = run.current
    if (current?.url === url && (current.read || !read)) return current.done
    setBusy(read ? "page" : "index")
    const done: Promise<OfferUrlCheck | null> = (
      read ? invoke(readApplicationUrl, { url }) : invoke(lookupApplicationUrl, { url })
    )
      .catch(() => (read ? UNREADABLE : null))
      .then((result) => {
        if (run.current?.done === done) {
          setBusy(null)
          setCheck(result)
          if (result?.job) {
            const previous = filled.current
            const next = result.job
            filled.current = next
            setForm((value) => refillForm(value, previous, next))
          }
        }
        return result
      })
    run.current = { url, read, done }
    return done
  }

  /** The index first: fetching a page takes seconds and counts against the hourly limit. */
  async function readLink(url: string): Promise<OfferUrlCheck | null> {
    const known = await ask(url, false)
    if (run.current?.url !== url) return known
    if (known && (!known.valid || known.job || known.existing)) return known
    return ask(url, true)
  }

  useEffect(() => {
    if (!open) return
    setForm({ ...EMPTY, appliedAt: dateInput(new Date().toISOString()) })
    setCheck(null)
    setBusy(null)
    setError(null)
    run.current = null
    filled.current = null
    pasted.current = false
  }, [open])

  useEffect(() => {
    if (!open) return
    const url = form.url.trim()
    if (run.current?.url === url) return
    run.current = null
    setCheck(null)
    setBusy(null)
    const previous = filled.current
    if (previous) {
      filled.current = null
      setForm((value) => refillForm(value, previous, null))
    }
    if (!url) return
    // While typing only the index is asked; a whole link (pasted, or on leaving the field) is read.
    const eager = pasted.current
    pasted.current = false
    const timer = window.setTimeout(
      () => void (eager ? readLink(url) : ask(url, false)),
      eager ? 0 : 450
    )
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.url, open])

  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) =>
    setForm((value) => ({ ...value, [key]: event.target.value }))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const url = form.url.trim()
    setPending(true)
    try {
      const typed = form.company.trim() && form.title.trim()
      const found = url && !typed ? await readLink(url) : check
      if (url && found && !found.valid) {
        setError(t("app.add.badUrl"))
        return
      }
      if (found?.existing) {
        onShow(found.existing.id)
        return
      }
      // Read just now, so the form does not show it yet. A guess waits for the person to see it.
      const fresh = found !== check
      if (fresh && url && found?.outcome !== "read") return
      const from = fresh ? found?.job : null
      const company = form.company.trim() || from?.company
      const title = form.title.trim() || from?.title
      if (!company || !title) {
        setError(t("app.add.required"))
        return
      }
      const result = await invoke(createApplication, {
        url: found?.url ?? (url || null),
        jobId: found?.job?.jobId ?? null,
        company,
        title,
        location: form.location.trim() || from?.location || null,
        salaryText: form.salaryText.trim() || from?.salaryText || null,
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

  const job = check?.job
  const hint =
    busy === "page"
      ? t("app.add.reading")
      : busy === "index"
      ? t("app.add.checking")
      : check && !check.valid
      ? t("app.add.badUrl")
      : check?.existing
      ? t("app.add.existing", { company: check.existing.company, title: check.existing.title })
      : check?.outcome === "read" && job?.company && job.title
      ? t("app.add.found", { company: job.company, title: job.title })
      : check?.outcome === "partial"
      ? t("app.add.partial")
      : check?.outcome === "link-only"
      ? t("app.add.linkOnly")
      : check?.outcome === "unreadable"
      ? t("app.add.unreadable")
      : t("app.add.urlHint")

  return (
    <Modal open={open} onClose={onClose} labelledBy="app-add-title" className="modal--wide">
      <ModalHead title={t("app.add.title")} id="app-add-title" onClose={onClose} />
      <form className="modal__body app-add" onSubmit={(event) => void submit(event)} noValidate>
        <Field
          label={t("app.add.url")}
          htmlFor="app-add-url"
          hint={<span aria-live="polite">{hint}</span>}
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
            onPaste={() => {
              pasted.current = true
            }}
            onBlur={() => {
              const url = form.url.trim()
              if (url) void readLink(url)
            }}
          />
        </Field>
        {check?.existing ? (
          <div>
            <Button size="sm" variant="outline" onClick={() => onShow(check.existing!.id)}>
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
        <div className="app-add__pair">
          <Field label={t("app.add.location")} htmlFor="app-add-location">
            <input
              id="app-add-location"
              className="input"
              value={form.location}
              maxLength={200}
              onChange={set("location")}
            />
          </Field>
          <Field label={t("app.add.salary")} htmlFor="app-add-salary">
            <input
              id="app-add-salary"
              className="input"
              value={form.salaryText}
              maxLength={120}
              onChange={set("salaryText")}
            />
          </Field>
        </div>
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
