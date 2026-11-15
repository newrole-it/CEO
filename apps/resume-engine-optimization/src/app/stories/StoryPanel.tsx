"use client"

import { useEffect, useRef, useState } from "react"
import { Trash2, X } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { ChipInput, useToast } from "@newrole/ui/interactive"
import { Banner, Field } from "@newrole/ui/primitives"
import { missingParts, STORY_MAX, STORY_PARTS, type StoryPart } from "@newrole/cv-core/stories"
import { invoke } from "src/app/rpc"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import deleteStory from "./mutations/deleteStory"
import saveStory from "./mutations/saveStory"
import { toRow, type StoryRow } from "./rows"

type Fields = Record<StoryPart, string> & { title: string; themes: string[]; source: string }

function fieldsOf(row: StoryRow | null, themes: string[]): Fields {
  return {
    title: row?.title ?? "",
    situation: row?.situation ?? "",
    task: row?.task ?? "",
    action: row?.action ?? "",
    result: row?.result ?? "",
    reflection: row?.reflection ?? "",
    themes: row?.themes ?? themes,
    source: row?.source ?? "",
  }
}

const ROWS: Record<StoryPart, number> = {
  situation: 3,
  task: 2,
  action: 5,
  result: 3,
  reflection: 3,
}

/**
 * One story: its five parts, the themes it is best for and where it came from. Saved with the
 * button; saving a draft makes it the person's own. A draft shows what code found when it checked
 * the model's text against the person's data: the fragment it stands on, what was taken out and
 * what is left for the person to answer.
 */
export function StoryPanel({
  row,
  themes,
  titleId,
  onSaved,
  onDeleted,
  onClose,
}: {
  /** Null for a new story */
  row: StoryRow | null
  /** The themes a new story starts with */
  themes: string[]
  titleId: string
  onSaved: (row: StoryRow, created: boolean) => void
  onDeleted: (id: string) => void
  onClose: () => void
}) {
  const { t } = useCopy()
  const toast = useToast()
  const [fields, setFields] = useState(() => fieldsOf(row, themes))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<CopyKey | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const draft = row?.status === "draft"
  const checks = draft ? row.checks : null
  const dirty = JSON.stringify(fields) !== JSON.stringify(fieldsOf(row, themes))

  useEffect(() => {
    if (!row) titleRef.current?.focus()
  }, [row])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const update = (patch: Partial<Fields>) => {
    setError(null)
    setFields((current) => ({ ...current, ...patch }))
  }

  async function save() {
    if (!fields.title.trim()) return setError("iv.story.err.title")
    setSaving(true)
    setError(null)
    try {
      const result = await invoke(saveStory, { id: row?.id, ...fields })
      if (!result) throw new Error("no result")
      onSaved(toRow(result), !row)
    } catch (failure) {
      const code = (failure as { code?: unknown }).code
      setError(code === "limit" ? "iv.story.err.limit" : "iv.story.err.save")
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!row) return
    setDeleting(true)
    try {
      await invoke(deleteStory, { id: row.id })
      onDeleted(row.id)
    } catch {
      setDeleting(false)
      toast.show({ message: t("iv.story.err.delete"), tone: "danger" })
    }
  }

  const empty = missingParts(fields)

  return (
    <form
      className="ans-panel"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <div className="ans-panel__head">
        <h2 className="t-h3" id={titleId}>
          {t(row ? (draft ? "iv.panel.draft" : "iv.panel.edit") : "iv.panel.new")}
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

      {draft ? (
        <Banner tone="warning">
          <p>{t("iv.draft.banner")}</p>
        </Banner>
      ) : null}

      {checks ? (
        <section className="iv-checks" aria-label={t("iv.checks.title")}>
          <h3 className="t-label">{t("iv.checks.title")}</h3>
          {checks.evidence ? (
            <div>
              <p className="t-sm">{t("iv.checks.evidence")}</p>
              <blockquote className="iv-quote">{checks.evidence}</blockquote>
            </div>
          ) : null}
          {checks.removed.length ? (
            <div>
              <p className="t-sm">{t("iv.checks.removed")}</p>
              <ul className="iv-list">
                {checks.removed.map((item, index) => (
                  <li key={`${item.part}-${item.value}-${index}`}>
                    {t(`iv.checks.removed.${item.kind}` as CopyKey, {
                      value: item.value,
                      part: t(`iv.part.${item.part}` as CopyKey),
                    })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {checks.questions.length ? (
            <div>
              <p className="t-sm">{t("iv.checks.questions")}</p>
              <ul className="iv-list">
                {checks.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <Field label={t("iv.field.title")} htmlFor="iv-p-title" error={error ? t(error) : null}>
        <input
          ref={titleRef}
          id="iv-p-title"
          className="input"
          maxLength={STORY_MAX.title}
          value={fields.title}
          placeholder={t("iv.field.title.hint")}
          onChange={(event) => update({ title: event.target.value })}
        />
      </Field>

      {STORY_PARTS.map((part) => (
        <Field
          key={part}
          label={t(`iv.part.${part}` as CopyKey)}
          htmlFor={`iv-p-${part}`}
          hint={
            draft && empty.includes(part)
              ? t(`iv.part.${part}.ask` as CopyKey)
              : t(`iv.part.${part}.hint` as CopyKey)
          }
        >
          <textarea
            id={`iv-p-${part}`}
            className="textarea"
            rows={ROWS[part]}
            maxLength={STORY_MAX.part}
            value={fields[part]}
            onChange={(event) => update({ [part]: event.target.value })}
          />
        </Field>
      ))}

      <Field label={t("iv.field.themes")} htmlFor="iv-p-themes" hint={t("iv.field.themes.hint")}>
        <ChipInput
          id="iv-p-themes"
          label={t("iv.field.themes")}
          max={STORY_MAX.themes}
          values={fields.themes}
          onChange={(next) => update({ themes: next })}
        />
      </Field>

      <Field label={t("iv.field.source")} htmlFor="iv-p-source" hint={t("iv.field.source.hint")}>
        <input
          id="iv-p-source"
          className="input"
          maxLength={STORY_MAX.source}
          value={fields.source}
          onChange={(event) => update({ source: event.target.value })}
        />
      </Field>

      <div className="row">
        <Button type="submit" variant="primary" loading={saving} disabled={!draft && !dirty}>
          {t(draft ? "iv.story.saveDraft" : "iv.story.save")}
        </Button>
        {row && !draft ? (
          <span className="t-sm muted">{t(`iv.story.origin.${row.origin}` as CopyKey)}</span>
        ) : null}
      </div>

      {row ? (
        <div className="ans-panel__danger">
          {confirming ? (
            <div className="stack-sm" role="group" aria-label={t("iv.story.delete")}>
              <p className="t-sm">{t("iv.story.delete.confirm")}</p>
              <div className="row">
                <Button variant="danger" size="sm" loading={deleting} onClick={() => void remove()}>
                  {t("iv.story.delete.yes")}
                </Button>
                <Button
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
              {t(draft ? "iv.story.discard" : "iv.story.delete")}
            </Button>
          )}
        </div>
      ) : null}
    </form>
  )
}
