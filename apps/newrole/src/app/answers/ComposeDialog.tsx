"use client"

import { invoke } from "@blitzjs/rpc"
import { useEffect, useRef, useState } from "react"
import { CircleAlert, LoaderCircle, Sparkles } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { CopyButton, Modal, ModalHead, useIsMobile, useToast } from "@newrole/ui/interactive"
import { Banner, Field } from "@newrole/ui/primitives"
import { useCopy } from "src/app/i18n/Locale"
import draftAnswer from "./mutations/draftAnswer"
import saveAnswer from "./mutations/saveAnswer"
import similarAnswers from "./queries/similarAnswers"
import { toRow, type AnswerRow } from "./rows"

const SIMILAR_DEBOUNCE_MS = 300
const MIN_QUESTION = 3

type Similar = { row: AnswerRow; score: number }
type SimilarState =
  | { status: "idle" }
  | { status: "loading"; items: Similar[] }
  | { status: "done"; items: Similar[] }
  | { status: "error" }

type DraftState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "failed" }
  | { status: "none" }
  | { status: "done"; reader: "llm" | "reuse"; sources: AnswerRow[]; jobFromIndex: boolean }

/**
 * "Nowa odpowiedź na podstawie bazy": paste a question, see the most similar saved answers, use
 * one or ask Claude for a draft, correct it, save. Origin is "draft" only for a model draft.
 */
export function ComposeDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (row: AnswerRow, created: boolean) => void
}) {
  const { t } = useCopy()
  const toast = useToast()
  const mobile = useIsMobile()
  const [question, setQuestion] = useState("")
  const [company, setCompany] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [url, setUrl] = useState("")
  const [limit, setLimit] = useState("")
  const [text, setText] = useState("")
  const [origin, setOrigin] = useState<"manual" | "draft">("manual")
  const [similar, setSimilar] = useState<SimilarState>({ status: "idle" })
  const [draft, setDraft] = useState<DraftState>({ status: "idle" })
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [lookupRun, setLookupRun] = useState(0)
  const draftRun = useRef(0)
  const textRef = useRef<HTMLTextAreaElement>(null)
  // A draft can take a minute: when it lands it must see what was typed in the meantime.
  const textNow = useRef(text)
  textNow.current = text

  const maxChars = Number.parseInt(limit, 10) > 0 ? Number.parseInt(limit, 10) : undefined
  const over = maxChars ? text.length - maxChars : 0
  const ready = question.trim().length >= MIN_QUESTION

  useEffect(() => {
    const value = question.trim()
    if (value.length < MIN_QUESTION) {
      setSimilar({ status: "idle" })
      return
    }
    let live = true
    setSimilar((current) => ({ status: "loading", items: "items" in current ? current.items : [] }))
    const timer = window.setTimeout(() => {
      invoke(similarAnswers, { question: value, limit: 5 })
        .then((rows) => {
          if (!live) return
          setSimilar({
            status: "done",
            items: rows.map((row) => ({ row: toRow(row), score: row.score ?? 0 })),
          })
        })
        .catch(() => {
          if (live) setSimilar({ status: "error" })
        })
    }, SIMILAR_DEBOUNCE_MS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [question, lookupRun])

  // A draft that finishes after the dialog closed is dropped.
  useEffect(
    () => () => {
      draftRun.current += 1
    },
    []
  )

  /** New text replaces what was typed, with a way back. */
  function replaceText(next: string) {
    const previous = textNow.current
    setText(next)
    if (previous.trim() && previous !== next) {
      toast.show({
        message: t("ans.compose.replaced"),
        action: { label: t("act.undo"), onClick: () => setText(previous) },
      })
    }
  }

  function use(item: Similar) {
    replaceText(item.row.answer)
    setOrigin("manual")
    setDraft({ status: "idle" })
    textRef.current?.focus()
  }

  async function writeDraft() {
    const id = (draftRun.current += 1)
    setDraft({ status: "running" })
    try {
      const result = await invoke(draftAnswer, {
        question: question.trim(),
        company: company.trim() || null,
        jobTitle: jobTitle.trim() || null,
        url: url.trim() || null,
        maxChars,
      })
      if (id !== draftRun.current) return
      if (!result.text || result.reader === "none") {
        setDraft({ status: "none" })
        return
      }
      replaceText(result.text)
      setOrigin(result.reader === "llm" ? "draft" : "manual")
      setCompany((current) => (current.trim() ? current : result.company ?? current))
      setJobTitle((current) => (current.trim() ? current : result.jobTitle ?? current))
      setDraft({
        status: "done",
        reader: result.reader,
        sources: result.sources.map(toRow),
        jobFromIndex: result.jobFromIndex,
      })
      // The draft button was disabled while running, so focus fell to the page. Don't steal it otherwise.
      if (!document.activeElement || document.activeElement === document.body)
        textRef.current?.focus()
    } catch {
      if (id === draftRun.current) setDraft({ status: "failed" })
    }
  }

  async function save() {
    setSaving(true)
    setSaveFailed(false)
    try {
      const result = await invoke(saveAnswer, {
        question: question.trim(),
        answer: text,
        company: company.trim() || null,
        jobTitle: jobTitle.trim() || null,
        sourceUrl: url.trim() || null,
        origin,
      })
      if (result) onSaved(toRow(result.answer), result.created)
    } catch {
      setSaveFailed(true)
      setSaving(false)
    }
  }

  function close() {
    if (text.trim() && !window.confirm(t("ans.compose.discard"))) return
    onClose()
  }

  const drafting = draft.status === "running"

  return (
    <Modal
      open
      kind={mobile ? "drawer" : "dialog"}
      onClose={close}
      labelledBy="ans-compose-title"
      className="modal--wide ans-compose"
      initialFocus="#ans-c-question"
    >
      <ModalHead id="ans-compose-title" title={t("ans.compose.title")} onClose={close} />
      <div className="modal__body stack">
        <Field
          label={t("ans.field.question")}
          htmlFor="ans-c-question"
          hint={t("ans.compose.questionHint")}
        >
          <textarea
            id="ans-c-question"
            className="textarea ans-panel__question"
            rows={2}
            maxLength={2000}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </Field>

        <details className="ans-more">
          <summary>{t("ans.compose.more")}</summary>
          <div className="ans-more__grid">
            <Field label={t("ans.field.company")} htmlFor="ans-c-company">
              <input
                id="ans-c-company"
                className="input"
                maxLength={200}
                value={company}
                onChange={(event) => setCompany(event.target.value)}
              />
            </Field>
            <Field label={t("ans.field.jobTitle")} htmlFor="ans-c-title">
              <input
                id="ans-c-title"
                className="input"
                maxLength={200}
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
              />
            </Field>
            <Field label={t("ans.field.url")} htmlFor="ans-c-url" hint={t("ans.compose.urlHint")}>
              <input
                id="ans-c-url"
                className="input"
                type="url"
                inputMode="url"
                maxLength={2000}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </Field>
            <Field label={t("ans.field.maxChars")} htmlFor="ans-c-limit">
              <input
                id="ans-c-limit"
                className="input num"
                type="number"
                inputMode="numeric"
                min={1}
                max={20000}
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
              />
            </Field>
          </div>
        </details>

        <section className="ans-similar" aria-labelledby="ans-c-similar">
          <h3 className="t-label" id="ans-c-similar">
            {t("ans.compose.similar")}
          </h3>
          <div aria-live="polite" className="stack-sm">
            {similar.status === "idle" ? (
              <p className="t-sm muted">{t("ans.compose.similarHint")}</p>
            ) : null}
            {similar.status === "loading" && !similar.items.length ? (
              <p className="t-sm muted">{t("ans.compose.similarLoading")}</p>
            ) : null}
            {similar.status === "done" && !similar.items.length ? (
              <p className="t-sm muted">{t("ans.compose.similarNone")}</p>
            ) : null}
            {similar.status === "error" ? (
              <div className="row">
                <span className="t-sm muted">{t("ans.compose.similarError")}</span>
                <Button size="sm" variant="ghost" onClick={() => setLookupRun((run) => run + 1)}>
                  {t("common.retry")}
                </Button>
              </div>
            ) : null}
            {"items" in similar && similar.items.length ? (
              <ul className="ans-similar__list">
                {similar.items.map((item) => (
                  <li key={item.row.id} className="ans-similar__item">
                    <div className="ans-similar__head">
                      <span className="badge badge--primary num">
                        {t("ans.compose.score", { n: Math.round(item.score * 100) })}
                      </span>
                      <strong>{item.row.question}</strong>
                      {item.row.company ? (
                        <span className="muted t-sm">{item.row.company}</span>
                      ) : null}
                    </div>
                    <p className="ans-similar__text">{item.row.answer}</p>
                    <div className="row">
                      <Button
                        size="sm"
                        variant="soft"
                        aria-label={t("ans.compose.useLabel", { question: item.row.question })}
                        onClick={() => use(item)}
                      >
                        {t("ans.compose.use")}
                      </Button>
                      <CopyButton text={item.row.answer} variant="ghost" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <div className="stack-sm">
          <div className="row">
            <Button
              variant="secondary"
              icon={<Sparkles />}
              loading={drafting}
              disabled={!ready}
              onClick={() => void writeDraft()}
            >
              {draft.status === "done" && draft.reader === "llm"
                ? t("ans.compose.redraft")
                : t("ans.compose.draft")}
            </Button>
          </div>
          <div aria-live="polite" className="stack-sm">
            {drafting ? (
              <p className="ans-drafting" role="status">
                <LoaderCircle className="spin" aria-hidden />
                {t("ans.compose.drafting")}
              </p>
            ) : null}
            {draft.status === "failed" ? (
              <Banner tone="danger" icon={<CircleAlert />}>
                {t("ans.compose.draftFailed")}
              </Banner>
            ) : null}
            {draft.status === "none" ? (
              <Banner tone="warning" icon={<CircleAlert />}>
                {t("ans.compose.none")}
              </Banner>
            ) : null}
            {draft.status === "done" ? (
              <div className="ans-draft-info">
                <p>
                  {draft.reader === "reuse" ? t("ans.compose.reused") : t("ans.compose.draftDone")}
                </p>
                {draft.reader === "llm" && !draft.sources.length ? (
                  <p>{t("ans.compose.basedOnNone")}</p>
                ) : null}
                {draft.jobFromIndex ? <p>{t("ans.compose.jobUsed")}</p> : null}
                {draft.sources.length ? (
                  <>
                    <p>{t("ans.compose.basedOn")}</p>
                    <ul>
                      {draft.sources.map((source) => (
                        <li key={source.id}>
                          {source.question}
                          {source.company ? ` · ${source.company}` : ""}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <Field
          label={t("ans.compose.result")}
          htmlFor="ans-c-text"
          hint={
            <span className="num">
              {maxChars
                ? t("ans.charsOf", { n: text.length, max: maxChars })
                : t("ans.chars", { n: text.length })}
              {!text ? ` · ${t("ans.compose.resultHint")}` : ""}
            </span>
          }
          error={over > 0 ? t("ans.err.overLimit", { n: over }) : null}
        >
          <textarea
            ref={textRef}
            id="ans-c-text"
            className="textarea"
            rows={8}
            maxLength={20_000}
            value={text}
            aria-invalid={over > 0 || undefined}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
        {saveFailed ? (
          <Banner tone="danger" icon={<CircleAlert />} role="alert">
            {t("ans.err.save")}
          </Banner>
        ) : null}
      </div>
      <div className="modal__foot">
        <Button variant="ghost" onClick={close}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          loading={saving}
          disabled={!question.trim() || !text.trim()}
          onClick={() => void save()}
        >
          {t("ans.compose.save")}
        </Button>
      </div>
    </Modal>
  )
}
