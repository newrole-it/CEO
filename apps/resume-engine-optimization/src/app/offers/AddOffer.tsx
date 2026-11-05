"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { invoke } from "@blitzjs/rpc"
import { Link2 } from "lucide-react"
import { ADD_OFFER_ANCHOR } from "src/app/components/onboarding/FirstSteps"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { Button } from "@newrole/ui/Button"
import { useToast } from "@newrole/ui/interactive"
import { Field } from "@newrole/ui/primitives"
import type { OfferOutcome } from "src/server/applications/types"
import addOfferByLink from "./mutations/addOfferByLink"
import confirmOffer from "./mutations/confirmOffer"

type Workplace = "" | "REMOTE" | "HYBRID" | "ONSITE"

const EMPTY = {
  company: "",
  title: "",
  location: "",
  workplace: "" as Workplace,
  salaryText: "",
  text: "",
}

type Draft = { url: string; outcome: OfferOutcome; readText: string }

const OUTCOME_HINT: Record<OfferOutcome, CopyKey> = {
  read: "oa.read",
  partial: "oa.partial",
  "link-only": "oa.linkOnly",
  unreadable: "oa.unreadable",
}

/**
 * "Dodaj ofertę" at the top of Offers: a link in, the whole posting read and kept, the offer's page
 * open. A page without structured data comes back as a draft with the text read from it, for the
 * person to check before it is kept.
 */
export function AddOffer({
  autoFocus = false,
  initialUrl = null,
}: {
  autoFocus?: boolean
  /** A link handed over by the extension (/offers?add=…): read at once */
  initialUrl?: string | null
}) {
  const { t } = useCopy()
  const id = useId()
  const router = useRouter()
  const toast = useToast()
  const [url, setUrl] = useState(initialUrl ?? "")
  const started = useRef(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) =>
    setForm((value) => ({ ...value, [key]: event.target.value }))

  async function read(value: string) {
    setError(null)
    if (!value.trim()) {
      setError(t("oa.err.badUrl"))
      return
    }
    setPending(true)
    try {
      const result = await invoke(addOfferByLink, { url: value.trim() })
      if (result.kind === "invalid") setError(t("oa.err.badUrl"))
      else if (result.kind === "refused") setError(t("oa.err.refused"))
      else if (result.kind === "added") {
        toast.show({
          message: result.textChars
            ? t("oa.addedText", { n: result.textChars })
            : t("oa.addedNoText"),
        })
        router.push(`/offers/${result.jobId}`)
        return
      } else {
        const facts = result.facts
        setForm({
          company: facts?.company ?? "",
          title: facts?.title ?? "",
          location: facts?.location ?? "",
          workplace: "",
          salaryText: facts?.salaryText ?? "",
          text: result.text,
        })
        setDraft({ url: result.url, outcome: result.outcome, readText: result.text })
      }
    } catch {
      setError(t("oa.err.read"))
    }
    setPending(false)
  }

  async function check(event: React.FormEvent) {
    event.preventDefault()
    await read(url)
  }

  useEffect(() => {
    if (!initialUrl || started.current) return
    started.current = true
    void read(initialUrl)
    // read once, for the link the page was opened with
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    setError(null)
    const company = form.company.trim()
    const title = form.title.trim()
    if (company.length < 2 || title.length < 2) {
      setError(t("oa.required"))
      return
    }
    setPending(true)
    try {
      const text = form.text.trim()
      const result = await invoke(confirmOffer, {
        url: draft.url,
        company,
        title,
        location: form.location.trim() || undefined,
        workplace: form.workplace || undefined,
        salaryText: form.salaryText.trim() || undefined,
        text: text || undefined,
        textOrigin: text && text === draft.readText.trim() ? "full" : "pasted",
      })
      if ("error" in result) {
        setError(t("oa.err.save"))
        setPending(false)
        return
      }
      router.push(`/offers/${result.jobId}`)
    } catch {
      setError(t("oa.err.save"))
      setPending(false)
    }
  }

  const errorLine = error ? (
    <p className="field__error" role="alert">
      {error}
    </p>
  ) : null

  return (
    <section
      id={ADD_OFFER_ANCHOR}
      className="card card--pad offer-add"
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`} className="t-h3">
        {t("oa.title")}
      </h2>
      {!draft ? (
        <form className="offer-add__link" onSubmit={(event) => void check(event)} noValidate>
          <p className="t-sm muted">{t("oa.lead")}</p>
          <Field
            label={t("oa.url")}
            htmlFor={`${id}-url`}
            hint={<span aria-live="polite">{pending ? t("oa.reading") : t("oa.urlHint")}</span>}
          >
            <div className="offer-add__row">
              <input
                id={`${id}-url`}
                className="input"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://"
                value={url}
                maxLength={2000}
                autoFocus={autoFocus}
                onChange={(event) => setUrl(event.target.value)}
              />
              <Button type="submit" variant="primary" loading={pending} icon={<Link2 />}>
                {t("oa.check")}
              </Button>
            </div>
          </Field>
          {errorLine}
        </form>
      ) : (
        <form className="stack app-add" onSubmit={(event) => void save(event)} noValidate>
          <p className="t-sm" role="status">
            {t(OUTCOME_HINT[draft.outcome])}
          </p>
          <p className="t-sm muted" style={{ overflowWrap: "anywhere" }}>
            <a
              className="link link--quiet"
              href={draft.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              {draft.url}
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
          <Field
            label={t("oa.text")}
            htmlFor={`${id}-text`}
            hint={draft.readText ? t("oa.textHint") : t("oa.textEmpty")}
          >
            <textarea
              id={`${id}-text`}
              className="textarea offer-add__text"
              value={form.text}
              rows={12}
              maxLength={60_000}
              placeholder={t("ow.text.ph")}
              onChange={set("text")}
            />
          </Field>
          {errorLine}
          <div className="row row--end">
            <Button
              variant="ghost"
              onClick={() => {
                setError(null)
                setDraft(null)
              }}
            >
              {t("oa.back")}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {t("oa.submit")}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
