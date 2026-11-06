"use client"

import { useId, useState } from "react"
import { Check, RotateCcw, Sparkles, X } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { useToast } from "@newrole/ui/interactive"
import { Field } from "@newrole/ui/primitives"
import { compactDiff, diffText, hasChanges } from "@newrole/cv-core/diff"
import type { CvContent } from "@newrole/cv-core/schema"
import { isRewritable } from "@newrole/cv-core/tailor"
import { sectionPlainText } from "@newrole/cv-core/text"
import type { ImproveMode, ImprovedSection } from "@newrole/cv-core/views"
import { useCvBackend } from "./backend"
import type { CvCopyKey } from "./copy"
import { DiffRows } from "./DiffRows"
import { useCvCopy } from "./locale"
import type { CvLanguage } from "./useCvDocument"

type ImproveDoc = {
  content: CvContent
  language: CvLanguage
  flush: () => Promise<boolean>
  replace: (next: { content: CvContent; language: CvLanguage }, updatedAt: Date) => void
  undo: () => void
}

const MODES: { mode: ImproveMode; label: CvCopyKey; hint: CvCopyKey }[] = [
  { mode: "polish", label: "tl.ai.mode.polish", hint: "tl.ai.mode.polishHint" },
  { mode: "shorten", label: "tl.ai.mode.shorten", hint: "tl.ai.mode.shortenHint" },
  { mode: "stronger", label: "tl.ai.mode.stronger", hint: "tl.ai.mode.strongerHint" },
]

/** The message for a section that came back with nothing; the error's message is its code. */
function improveErrorKey(error: unknown): CvCopyKey {
  const code = error instanceof Error ? error.message : ""
  if (code === "llm-unavailable") return "tl.ai.err.noModel"
  if (code === "no-content") return "tl.ai.err.section"
  return "tl.err.failed"
}

/**
 * "Popraw z AI" in the editor's side panel: pick a section and what to do with it, see the
 * model's proposal against the section as it is now, then apply it or not. Applying keeps the
 * state before in the version history and can be undone at once.
 */
export function ImproveTab({
  id,
  doc,
  sectionId,
  onSection,
}: {
  id: string
  doc: ImproveDoc
  sectionId: string | null
  onSection: (id: string) => void
}) {
  const { t, locale } = useCvCopy()
  const backend = useCvBackend()
  const toast = useToast()
  const sectionField = useId()
  const noteField = useId()
  const [mode, setMode] = useState<ImproveMode>("polish")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState<"write" | "apply" | null>(null)
  const [attempt, setAttempt] = useState(1)
  const [result, setResult] = useState<ImprovedSection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const improve = backend.improve

  const sections = doc.content.sections.filter(
    (section) => !section.hidden && isRewritable(section)
  )
  const selected = sections.find((section) => section.id === sectionId) ?? sections[0] ?? null
  // the proposal against the section as it is on the sheet now (one section: cheap to redo)
  const rows =
    result && selected && result.section.id === selected.id
      ? diffText(
          sectionPlainText(doc.content, selected.id),
          sectionPlainText(
            {
              ...doc.content,
              sections: doc.content.sections.map((section) =>
                section.id === result.section.id ? result.section : section
              ),
            },
            selected.id
          )
        )
      : null

  if (!improve) return null
  if (!selected) return <p className="t-sm muted">{t("tl.ai.empty")}</p>

  async function write(next: number) {
    if (!improve || !selected) return
    setBusy("write")
    setError(null)
    try {
      // the model reads what is stored, so what is on the sheet goes first
      await doc.flush()
      const proposal = await improve.preview({
        id,
        sectionId: selected.id,
        mode,
        note: note.trim() || undefined,
        locale,
        attempt: next,
      })
      if (!proposal) throw new Error("no result")
      setAttempt(next)
      setResult(proposal)
    } catch (failure) {
      setError(t(improveErrorKey(failure)))
    } finally {
      setBusy(null)
    }
  }

  async function apply() {
    if (!improve || !result) return
    setBusy("apply")
    try {
      await doc.flush()
      const applied = await improve.apply({ id, section: result.section })
      doc.replace({ content: applied.content, language: applied.language }, applied.updatedAt)
      setResult(null)
      setAttempt(1)
      toast.show({
        message: t("tl.ai.applied"),
        action: { label: t("cv.ed.undo"), onClick: doc.undo },
      })
    } catch {
      toast.show({ message: t("tl.v.err"), tone: "danger" })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="stack-sm cvt-ai">
      <p className="t-sm muted">{t("tl.ai.lead")}</p>
      <Field label={t("tl.ai.section")} htmlFor={sectionField}>
        <select
          id={sectionField}
          className="select"
          value={selected.id}
          disabled={busy !== null}
          onChange={(event) => {
            onSection(event.target.value)
            setResult(null)
            setAttempt(1)
          }}
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.title.trim() || t("cv.out.untitled")}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="cvt-ai__modes" disabled={busy !== null}>
        <legend className="t-sm">{t("tl.ai.mode")}</legend>
        {MODES.map((entry) => (
          <label key={entry.mode} className="cvt-check">
            <input
              type="radio"
              name={`${sectionField}-mode`}
              checked={mode === entry.mode}
              onChange={() => {
                setMode(entry.mode)
                setAttempt(1)
              }}
            />
            <span>
              {t(entry.label)}
              <small>{t(entry.hint)}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <Field label={t("tl.ai.note")} htmlFor={noteField}>
        <textarea
          id={noteField}
          className="textarea"
          rows={2}
          maxLength={2000}
          value={note}
          disabled={busy !== null}
          placeholder={t("tl.ai.notePh")}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>

      {result ? null : (
        <div>
          <Button
            variant="primary"
            size="sm"
            icon={<Sparkles />}
            loading={busy === "write"}
            onClick={() => void write(1)}
          >
            {t(busy === "write" ? "tl.ai.working" : "tl.ai.go")}
          </Button>
        </div>
      )}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}

      {result && rows ? (
        <section className="cvt-ai__result" aria-live="polite">
          <h3 className="cvt-ai__title">{t("tl.ai.proposal")}</h3>
          {hasChanges(rows) ? (
            <DiffRows rows={compactDiff(rows)} />
          ) : (
            <p className="t-sm muted">{t("tl.ai.none")}</p>
          )}
          {result.changes.length ? (
            <>
              <h4 className="cvt-ai__sub">{t("tl.ai.changes")}</h4>
              <ul className="cvt-ai__list">
                {result.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </>
          ) : null}
          {result.unverified.length ? (
            <div className="cvt-notice">
              <p>{t("tl.ai.check")}</p>
              <ul className="cvt-terms">
                {result.unverified.map((term) => (
                  <li key={term}>{term}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.reverted ? (
            <p className="t-sm muted">{t("tl.ai.reverted", { n: result.reverted })}</p>
          ) : null}
          <div className="cvt-ai__actions">
            <Button
              variant="primary"
              size="sm"
              icon={<Check />}
              loading={busy === "apply"}
              disabled={busy === "write" || !hasChanges(rows)}
              onClick={() => void apply()}
            >
              {t("tl.ai.apply")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw />}
              loading={busy === "write"}
              disabled={busy === "apply"}
              onClick={() => void write(attempt + 1)}
            >
              {t(busy === "write" ? "tl.ai.working" : "tl.ai.again")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<X />}
              disabled={busy !== null}
              onClick={() => setResult(null)}
            >
              {t("tl.ai.discard")}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
