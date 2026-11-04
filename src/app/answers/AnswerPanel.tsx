"use client"

import { invoke } from "@blitzjs/rpc"
import { useCallback, useEffect, useRef, useState } from "react"
import { Check, CircleAlert, ExternalLink, LoaderCircle, Pencil, Trash2, X } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { ChipInput, CopyButton, useToast } from "@newrole/ui/interactive"
import { Field, Segmented } from "@newrole/ui/primitives"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { relativeTime } from "src/app/jobs/format"
import deleteAnswer from "./mutations/deleteAnswer"
import saveAnswer from "./mutations/saveAnswer"
import getAnswer from "./queries/getAnswer"
import { toRow, type AnswerRow } from "./rows"

const AUTOSAVE_MS = 800

type Fields = {
  question: string
  answer: string
  tags: string[]
  language: "pl" | "en" | null
  company: string
  jobTitle: string
}

type SaveState = "saved" | "dirty" | "saving" | "invalid" | "error"

function fieldsOf(row: AnswerRow): Fields {
  return {
    question: row.question,
    answer: row.answer,
    tags: row.tags,
    language: row.language === "pl" || row.language === "en" ? row.language : null,
    company: row.company ?? "",
    jobTitle: row.jobTitle ?? "",
  }
}

const snapshot = (fields: Fields) => JSON.stringify(fields)
const isValid = (fields: Fields) => Boolean(fields.question.trim() && fields.answer.trim())

/** Links stored from a form page or MCP: only http(s) ever becomes a link. */
function safeHref(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null
}

/** Edits one answer and saves on its own, 0.8 s after the last change. The state is always shown. */
export function AnswerPanel({
  row,
  titleId,
  onSaved,
  onDeleted,
  onSelect,
  onClose,
}: {
  row: AnswerRow
  titleId: string
  onSaved: (row: AnswerRow) => void
  onDeleted: (id: string) => void
  onSelect: (row: AnswerRow) => void
  onClose: () => void
}) {
  const { t } = useCopy()
  const toast = useToast()
  const [fields, setFields] = useState(() => fieldsOf(row))
  const [state, setState] = useState<SaveState>("saved")
  const [variants, setVariants] = useState<AnswerRow[] | null>(null)
  const [offers, setOffers] = useState<{ id: string; company: string; title: string }[]>([])
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const latest = useRef(fields)
  const lastSaved = useRef(snapshot(fields))
  const inFlight = useRef(false)
  const again = useRef(false)
  const timer = useRef<number | null>(null)
  const mounted = useRef(true)
  const deleted = useRef(false)
  // Refs keep flush stable: the toast context changes identity whenever a toast appears.
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved
  const notify = useRef(() => toast.show({ message: t("ans.err.save"), tone: "danger" }))
  notify.current = () => toast.show({ message: t("ans.err.save"), tone: "danger" })

  const flush = useCallback(async () => {
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = null
    const current = latest.current
    const snap = snapshot(current)
    if (deleted.current || snap === lastSaved.current || !isValid(current)) return
    if (inFlight.current) {
      again.current = true
      return
    }
    inFlight.current = true
    if (mounted.current) setState("saving")
    try {
      const result = await invoke(saveAnswer, {
        id: row.id,
        question: current.question,
        answer: current.answer,
        tags: current.tags,
        language: current.language,
        company: current.company.trim() || null,
        jobTitle: current.jobTitle.trim() || null,
      })
      if (result) {
        lastSaved.current = snap
        onSavedRef.current(toRow(result.answer))
      }
      if (mounted.current) setState(snapshot(latest.current) === snap ? "saved" : "dirty")
    } catch {
      if (mounted.current) setState("error")
      else notify.current()
    } finally {
      inFlight.current = false
      if (again.current) {
        again.current = false
        void flush()
      }
    }
  }, [row.id])

  function update(patch: Partial<Fields>) {
    const next = { ...latest.current, ...patch }
    latest.current = next
    setFields(next)
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = null
    if (snapshot(next) === lastSaved.current) return setState("saved")
    if (!isValid(next)) return setState("invalid")
    setState("dirty")
    timer.current = window.setTimeout(() => void flush(), AUTOSAVE_MS)
  }

  // Leaving the panel (another variant, close, delete) saves what is pending.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      void flush()
    }
  }, [flush])

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (snapshot(latest.current) !== lastSaved.current) event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [])

  useEffect(() => {
    let live = true
    invoke(getAnswer, { id: row.id })
      .then((result) => {
        if (!live) return
        setVariants(result.variants.map(toRow))
        setOffers(result.offers)
      })
      .catch(() => {
        if (live) setVariants([])
      })
    return () => {
      live = false
    }
  }, [row.id, row.questionKey])

  useEffect(() => {
    if (confirming) cancelRef.current?.focus()
  }, [confirming])

  async function remove() {
    setDeleting(true)
    deleted.current = true
    try {
      await invoke(deleteAnswer, { id: row.id })
      onDeleted(row.id)
    } catch {
      deleted.current = false
      setDeleting(false)
      toast.show({ message: t("ans.delete.failed"), tone: "danger" })
    }
  }

  const source = safeHref(row.sourceUrl)
  const usedAt = relativeTime(row.lastUsedAt, t)
  const others = variants ?? []

  return (
    <div
      className="ans-panel"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault()
          void flush()
        }
      }}
    >
      <div className="ans-panel__head">
        <h2 className="t-h3" id={titleId}>
          {t("ans.panel.title")}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t("common.close")}
          onClick={onClose}
          icon={<X />}
        />
      </div>

      <div className="ans-save" data-state={state} role="status">
        {state === "saved" ? <Check aria-hidden /> : null}
        {state === "dirty" ? <Pencil aria-hidden /> : null}
        {state === "saving" ? <LoaderCircle className="spin" aria-hidden /> : null}
        {state === "invalid" || state === "error" ? <CircleAlert aria-hidden /> : null}
        <span>{t(`ans.save.${state}` as CopyKey)}</span>
        {state === "error" ? (
          <button type="button" className="link" onClick={() => void flush()}>
            {t("ans.save.retry")}
          </button>
        ) : null}
      </div>

      <Field label={t("ans.field.question")} htmlFor="ans-p-question">
        <textarea
          id="ans-p-question"
          className="textarea ans-panel__question"
          rows={2}
          maxLength={2000}
          value={fields.question}
          aria-invalid={!fields.question.trim() || undefined}
          onChange={(event) => update({ question: event.target.value })}
        />
      </Field>

      <Field
        label={t("ans.field.answer")}
        htmlFor="ans-p-answer"
        hint={<span className="num">{t("ans.chars", { n: fields.answer.length })}</span>}
        error={!fields.answer.trim() ? t("ans.err.required") : null}
      >
        <textarea
          id="ans-p-answer"
          className="textarea"
          rows={9}
          maxLength={20_000}
          value={fields.answer}
          aria-invalid={!fields.answer.trim() || undefined}
          onChange={(event) => update({ answer: event.target.value })}
        />
      </Field>
      <div className="row">
        <CopyButton text={fields.answer} />
      </div>

      <Field label={t("ans.field.tags")} htmlFor="ans-p-tags">
        <ChipInput
          id="ans-p-tags"
          label={t("ans.field.tags")}
          placeholder={t("ans.field.tagsHint")}
          max={12}
          values={fields.tags}
          onChange={(tags) => update({ tags })}
        />
      </Field>

      <div className="ans-panel__cols">
        <Field label={t("ans.field.company")} htmlFor="ans-p-company">
          <input
            id="ans-p-company"
            className="input"
            maxLength={200}
            value={fields.company}
            onChange={(event) => update({ company: event.target.value })}
          />
        </Field>
        <Field label={t("ans.field.jobTitle")} htmlFor="ans-p-title">
          <input
            id="ans-p-title"
            className="input"
            maxLength={200}
            value={fields.jobTitle}
            onChange={(event) => update({ jobTitle: event.target.value })}
          />
        </Field>
      </div>

      <div className="field">
        <span className="field__label">{t("ans.field.language")}</span>
        <Segmented<"pl" | "en">
          label={t("ans.field.language")}
          value={fields.language}
          onChange={(language) => update({ language })}
          options={[
            { value: "pl", label: t("ans.lang.pl") },
            { value: "en", label: t("ans.lang.en") },
          ]}
        />
      </div>

      <p className="ans-panel__meta">
        <span>{t(`ans.meta.origin.${row.origin}` as CopyKey)}</span>
        <span className="num">{t("ans.meta.uses", { n: row.useCount })}</span>
        {usedAt ? (
          <span suppressHydrationWarning>{t("ans.meta.lastUsed", { when: usedAt })}</span>
        ) : null}
        {source ? (
          <a className="link" href={source} target="_blank" rel="noreferrer noopener">
            {t("ans.meta.source")} <ExternalLink aria-hidden className="ans-panel__ext" />
            <span className="sr-only"> {t("common.newTab")}</span>
          </a>
        ) : null}
      </p>

      {offers.length ? (
        <section aria-labelledby="ans-p-offers" className="ans-variants">
          <h3 className="t-label" id="ans-p-offers">
            {t("ans.offers")}
          </h3>
          <ul>
            {offers.map((offer) => (
              <li key={offer.id}>
                <a className="link" href={`/applications?id=${encodeURIComponent(offer.id)}`}>
                  {offer.company} · {offer.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {variants === null ? (
        <p className="t-sm muted">{t("ans.variants.loading")}</p>
      ) : others.length > 1 ? (
        <section aria-labelledby="ans-p-variants" className="ans-variants">
          <h3 className="t-label" id="ans-p-variants">
            {t("ans.variants")}
          </h3>
          <ul>
            {others.map((variant) => {
              const current = variant.id === row.id
              return (
                <li key={variant.id}>
                  <button
                    type="button"
                    className="ans-variant"
                    aria-current={current ? "true" : undefined}
                    onClick={() => (current ? undefined : onSelect(variant))}
                  >
                    <span className="ans-variant__head">
                      <strong>{variant.company ?? t("ans.variants.noCompany")}</strong>
                      {variant.jobTitle ? <span>{variant.jobTitle}</span> : null}
                      {current ? (
                        <span className="ans-variant__current">{t("ans.variants.current")}</span>
                      ) : null}
                    </span>
                    <span className="ans-variant__text">
                      {current ? fields.answer : variant.answer}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <div className="ans-panel__danger">
        {confirming ? (
          <div className="stack-sm" role="group" aria-label={t("ans.delete")}>
            <p className="t-sm">{t("ans.delete.confirm")}</p>
            <div className="row">
              <Button variant="danger" size="sm" loading={deleting} onClick={() => void remove()}>
                {t("ans.delete.yes")}
              </Button>
              <Button
                ref={cancelRef}
                variant="ghost"
                size="sm"
                disabled={deleting}
                onClick={() => setConfirming(false)}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="danger-ghost"
            size="sm"
            icon={<Trash2 />}
            onClick={() => setConfirming(true)}
          >
            {t("ans.delete")}
          </Button>
        )}
      </div>
    </div>
  )
}
