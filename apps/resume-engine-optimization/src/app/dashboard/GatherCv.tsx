"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { Combine } from "lucide-react"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { Modal, ModalHead } from "@newrole/ui/interactive"
import { Banner, Field } from "@newrole/ui/primitives"
import { compactDiff, diffCv, hasChanges } from "@newrole/cv-core/diff"
import type { GatherNote } from "@newrole/cv-core/gather"
import { DiffRows } from "@newrole/cv-editor/DiffRows"
import { pluralKind, type CopyKey } from "src/app/i18n/copy"
import { useCopy } from "src/app/i18n/Locale"
import { invoke } from "src/app/rpc"
import { useMutation } from "src/app/rpc-hooks"
import draftGatheredCv from "src/app/cv/mutations/draftGatheredCv"
import saveGatheredCv from "src/app/cv/mutations/saveGatheredCv"
import getGatherPreview from "src/app/cv/queries/getGatherPreview"
import type { GatherPreview, GatherResult } from "src/server/cv/gather"
import { NotFoundError } from "src/shared/errors"

const ERRORS = {
  "not-found": "dash.gather.err.not-found",
  "no-changes": "dash.gather.err.no-changes",
  "llm-unavailable": "dash.gather.err.llm-unavailable",
  "llm-failed": "dash.gather.err.llm-failed",
  conflict: "dash.gather.err.conflict",
  "invalid-content": "dash.gather.err.invalid-content",
} as const satisfies Record<string, CopyKey>

type ErrorCode = keyof typeof ERRORS | "other"

/** The code a resolver's error carries (src/app/cv/guard.ts), for a translated message. */
function codeOf(error: unknown): ErrorCode {
  if (error instanceof NotFoundError) return "not-found"
  const code = error instanceof Error ? error.message : ""
  return code in ERRORS ? (code as keyof typeof ERRORS) : "other"
}

const OUTCOMES = ["added", "merged", "skipped"] as const

type Saved = { cvId: string; title: string; number: number | null }

/**
 * "Zbierz wszystko do CV ogólnego" on the dashboard: shows which CVs hold the person's own
 * changes, has the model merge them into the general CV, and shows the result before and after.
 * Nothing is stored until "Zapisz jako nową wersję" (src/server/cv/gather.ts).
 */
const EMPTY: GatherPreview = { target: null, targets: [], sources: [], skipped: [] }

export function GatherCv({ enabled }: { enabled: boolean }) {
  const { t, locale } = useCopy()
  const router = useRouter()
  const titleId = useId()
  const pickId = useId()
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<GatherResult | null>(null)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [error, setError] = useState<ErrorCode | null>(null)
  const [makeDraft, { isPending: working }] = useMutation(draftGatheredCv)
  const [saveDraft, { isPending: saving }] = useMutation(saveGatheredCv)
  const target = preview.target

  async function load(targetId?: string) {
    setLoading(true)
    setError(null)
    try {
      setPreview(await invoke(getGatherPreview, { targetId }))
    } catch (caught) {
      setError(codeOf(caught))
    } finally {
      setLoading(false)
    }
  }

  function openDialog() {
    setOpen(true)
    // a draft that was closed by a stray click is still there: the model's minutes are not lost
    if (draft) return
    setSaved(null)
    void load(target?.id)
  }

  function discard() {
    setDraft(null)
    setError(null)
    setOpen(false)
  }

  function close() {
    if (working || saving) return
    setOpen(false)
  }

  async function start() {
    if (!target) return
    setError(null)
    setDraft(null)
    try {
      setDraft(await makeDraft({ targetId: target.id }))
    } catch (caught) {
      setError(codeOf(caught))
    }
  }

  async function save() {
    if (!draft || !target) return
    setError(null)
    try {
      const result = await saveDraft({
        targetId: draft.targetId,
        updatedAt: draft.updatedAt,
        sources: draft.sources,
        content: draft.content,
      })
      setSaved({ ...result, title: target.title })
      setDraft(null)
      router.refresh()
    } catch (caught) {
      setError(codeOf(caught))
    }
  }

  const rows = draft ? diffCv(draft.before, draft.content) : []
  const changed = hasChanges(rows)
  const notesOf = (outcome: GatherNote["outcome"]) =>
    draft?.notes.filter((note) => note.outcome === outcome) ?? []

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        icon={<Combine />}
        disabled={!enabled}
        title={enabled ? undefined : t("dash.gather.noTarget")}
        aria-haspopup="dialog"
        onClick={openDialog}
      >
        {t("dash.gather.button")}
      </Button>
      <Modal open={open} onClose={close} labelledBy={titleId} className="dash-gather">
        <ModalHead id={titleId} title={t("dash.gather.title")} onClose={close} />
        <div className="modal__body stack-sm" aria-live="polite">
          {error ? (
            <Banner tone="danger" role="alert">
              {t(error === "other" ? "dash.gather.err.other" : ERRORS[error])}
            </Banner>
          ) : null}

          {saved ? (
            <p>
              {saved.number === null
                ? t("dash.gather.marked", { title: saved.title })
                : t("dash.gather.saved", { n: saved.number, title: saved.title })}
            </p>
          ) : working ? (
            <p className="dash-gather__working">{t("dash.gather.working")}</p>
          ) : draft ? (
            <>
              {OUTCOMES.map((outcome) => {
                const notes = notesOf(outcome)
                return notes.length ? (
                  <section key={outcome}>
                    <h3 className="dash-gather__sub">{t(`dash.gather.notes.${outcome}`)}</h3>
                    <ul className="dash-gather__list">
                      {notes.map((note, index) => (
                        <li key={index}>
                          {t("dash.gather.note", { source: note.source, text: note.text })}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null
              })}
              {draft.warnings.length ? (
                <Banner tone="warning">
                  <p>{t("dash.gather.warn")}</p>
                  <ul className="dash-gather__list">
                    {draft.warnings.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </Banner>
              ) : null}
              {draft.reverted ? (
                <p className="t-sm muted">
                  {t(`dash.gather.reverted.${pluralKind(draft.reverted, locale)}`, {
                    n: draft.reverted,
                  })}
                </p>
              ) : null}
              {draft.kept ? (
                <p className="t-sm muted">
                  {t(`dash.gather.kept.${pluralKind(draft.kept, locale)}`, { n: draft.kept })}
                </p>
              ) : null}
              {draft.unverified.length ? (
                <p className="t-sm muted">
                  {t("dash.gather.unverified", { terms: draft.unverified.join(", ") })}
                </p>
              ) : null}
              <h3 className="dash-gather__sub">{t("dash.gather.diff")}</h3>
              {changed ? (
                <DiffRows rows={compactDiff(rows)} />
              ) : (
                <p className="t-sm muted">{t("dash.gather.nochange")}</p>
              )}
            </>
          ) : (
            <>
              <p className="t-sm muted">{t("dash.gather.intro")}</p>
              {preview.targets.length > 1 ? (
                <Field label={t("dash.gather.target")} htmlFor={pickId}>
                  <select
                    id={pickId}
                    className="select"
                    value={target?.id ?? ""}
                    disabled={loading}
                    onChange={(event) => void load(event.target.value)}
                  >
                    {preview.targets.map((choice) => (
                      <option key={choice.id} value={choice.id}>
                        {choice.title}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              {loading ? (
                <p className="t-sm muted">{t("dash.gather.loading")}</p>
              ) : !target ? (
                <p>{error ? null : t("dash.gather.noTarget.body")}</p>
              ) : preview.sources.length ? (
                <section>
                  <h3 className="dash-gather__sub">{t("dash.gather.sources")}</h3>
                  <ul className="dash-gather__list">
                    {preview.sources.map((source) => (
                      <li key={source.id}>
                        <strong>{source.title}</strong>
                        {source.company ? (
                          <span className="muted">
                            {source.role
                              ? t("dash.gather.source.offer", {
                                  company: source.company,
                                  role: source.role,
                                })
                              : t("dash.gather.source.company", { company: source.company })}
                          </span>
                        ) : null}
                        <span className="muted">
                          {t(`dash.gather.changes.${pluralKind(source.changes, locale)}`, {
                            n: source.changes,
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <p>{t("dash.gather.none")}</p>
              )}
              {!loading && preview.skipped.length ? (
                <section>
                  <h3 className="dash-gather__sub">{t("dash.gather.skipped")}</h3>
                  <ul className="dash-gather__list">
                    {preview.skipped.map((row) => (
                      <li key={row.id} className="t-sm muted">
                        {t("dash.gather.skipped.no-content", { title: row.title })}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
        <div className="modal__foot">
          {saved ? (
            <>
              <Button type="button" variant="ghost" onClick={close}>
                {t("common.close")}
              </Button>
              <ButtonLink href={`/cv/${saved.cvId}`} variant="primary">
                {t("dash.gather.open")}
              </ButtonLink>
            </>
          ) : draft ? (
            <>
              <Button type="button" variant="ghost" disabled={saving} onClick={discard}>
                {changed ? t("dash.gather.discard") : t("common.close")}
              </Button>
              {error === "conflict" ? (
                <Button type="button" variant="primary" onClick={() => void start()}>
                  {t("dash.gather.again")}
                </Button>
              ) : changed ? (
                <Button
                  type="button"
                  variant="primary"
                  loading={saving}
                  onClick={() => void save()}
                >
                  {t("dash.gather.save")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  loading={saving}
                  onClick={() => void save()}
                >
                  {t("dash.gather.done")}
                </Button>
              )}
            </>
          ) : !loading && !target && !error ? (
            <>
              <Button type="button" variant="ghost" onClick={close}>
                {t("common.close")}
              </Button>
              <ButtonLink href="/cv" variant="primary">
                {t("dash.gather.noTarget.action")}
              </ButtonLink>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" disabled={working} onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={working}
                disabled={loading || !target || !preview.sources.length}
                onClick={() => void start()}
              >
                {t("dash.gather.start")}
              </Button>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}
