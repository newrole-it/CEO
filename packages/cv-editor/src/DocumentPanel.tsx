"use client"

import { useEffect, useId, useMemo, useState } from "react"
import { ArrowLeft, ExternalLink, GitCompareArrows, RotateCcw, Sparkles, X } from "lucide-react"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { useToast } from "@newrole/ui/interactive"
import { Badge, Field, Skeleton } from "@newrole/ui/primitives"
import { relativeTime } from "@newrole/ui/time"
import { compactDiff, diffCv, hasChanges, type DiffPart } from "@newrole/cv-core/diff"
import type { CvContent } from "@newrole/cv-core/schema"
import { readOnlyExcerpt, type KeywordNote, type TailorNotes } from "@newrole/cv-core/tailor"
import type { CvVersionView, TailorContext } from "@newrole/cv-core/views"
import { useCvBackend } from "./backend"
import { useCvCopy } from "./locale"
import { tailorErrorKey } from "./tailor-errors"
import type { CvLanguage } from "./useCvDocument"

export type PanelTab = "versions" | "review"

/** The part of useCvDocument the panel works with. */
type PanelDoc = {
  content: CvContent
  language: CvLanguage
  flush: () => Promise<boolean>
  replace: (next: { content: CvContent; language: CvLanguage }, updatedAt: Date) => void
  undo: () => void
}

/** The right-hand panel of the editor: version history, and what the model did to a tailored document. */
export function DocumentPanel({
  id,
  doc,
  isLetter,
  tab,
  onTab,
  onClose,
  tailor,
  notes,
  onNotes,
}: {
  id: string
  doc: PanelDoc
  isLetter: boolean
  tab: PanelTab
  onTab: (tab: PanelTab) => void
  onClose: () => void
  tailor: TailorContext | null
  notes: TailorNotes | null
  onNotes: (notes: TailorNotes) => void
}) {
  const { t } = useCvCopy()
  return (
    <aside className="cvt-panel" aria-label={t("tl.panel.label")}>
      <div className="cvt-panel__head">
        <div className="tabs" role="tablist">
          <button
            type="button"
            className="tab"
            role="tab"
            aria-selected={tab === "versions"}
            onClick={() => onTab("versions")}
          >
            {t("tl.panel.versions")}
          </button>
          {tailor ? (
            <button
              type="button"
              className="tab"
              role="tab"
              aria-selected={tab === "review"}
              onClick={() => onTab("review")}
            >
              {t("tl.panel.review")}
            </button>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon={<X />}
          aria-label={t("tl.panel.close")}
          title={t("tl.panel.close")}
          onClick={onClose}
        />
      </div>
      <div className="cvt-panel__body">
        {tab === "review" && tailor ? (
          <ReviewTab
            doc={doc}
            isLetter={isLetter}
            jobId={tailor.job.id}
            notes={notes}
            onNotes={onNotes}
          />
        ) : (
          <VersionsTab id={id} doc={doc} />
        )}
      </div>
    </aside>
  )
}

function VersionsTab({ id, doc }: { id: string; doc: PanelDoc }) {
  const { t } = useCvCopy()
  const backend = useCvBackend()
  const toast = useToast()
  const inputId = useId()
  const [versions, setVersions] = useState<CvVersionView[] | null>(null)
  const [loadedFrom, setLoadedFrom] = useState<CvContent | null>(null)
  const [label, setLabel] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [compare, setCompare] = useState<{ number: number; content: CvContent } | null>(null)

  async function load(content: CvContent) {
    const rows = await backend.versions.list(id)
    setVersions(rows)
    setLoadedFrom(content)
  }

  useEffect(() => {
    let live = true
    void doc
      .flush()
      .then(() => backend.versions.list(id))
      .then((rows) => {
        if (!live) return
        setVersions(rows)
        setLoadedFrom(doc.content)
      })
      .catch(() => live && setVersions([]))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function save() {
    setBusy("save")
    try {
      await doc.flush()
      const result = await backend.versions.save(id, label.trim() || undefined)
      const named = Boolean(label.trim())
      setLabel("")
      await load(doc.content)
      toast.show({
        message: t(result.created ? "tl.v.saved" : named ? "tl.v.named" : "tl.v.unchanged", {
          n: result.version.number,
        }),
      })
    } catch {
      toast.show({ message: t("tl.v.err"), tone: "danger" })
    } finally {
      setBusy(null)
    }
  }

  async function restore(version: CvVersionView) {
    setBusy(version.id)
    try {
      await doc.flush()
      const result = await backend.versions.restore(id, version.id)
      doc.replace({ content: result.content, language: result.language }, result.updatedAt)
      await load(result.content)
      setCompare(null)
      toast.show({
        message: t("tl.v.restored", { n: version.number }),
        action: { label: t("cv.ed.undo"), onClick: doc.undo },
      })
    } catch {
      toast.show({ message: t("tl.v.err"), tone: "danger" })
    } finally {
      setBusy(null)
    }
  }

  async function openCompare(version: CvVersionView) {
    setBusy(version.id)
    try {
      const { content } = await backend.versions.get(id, version.id)
      setCompare({ number: version.number, content })
    } catch {
      toast.show({ message: t("tl.v.err"), tone: "danger" })
    } finally {
      setBusy(null)
    }
  }

  if (compare) {
    return <CompareView compare={compare} current={doc.content} onBack={() => setCompare(null)} />
  }

  // typing since the list loaded: the history no longer holds what is on the sheet
  const edited = loadedFrom !== null && loadedFrom !== doc.content
  return (
    <>
      <form
        className="cvt-save"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <Field label={t("tl.v.saveLabel")} htmlFor={inputId}>
          <input
            id={inputId}
            className="input"
            value={label}
            maxLength={120}
            placeholder={t("tl.v.savePh")}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>
        <Button type="submit" size="sm" variant="secondary" loading={busy === "save"}>
          {t("tl.v.save")}
        </Button>
      </form>

      {versions === null ? (
        <>
          <Skeleton h={72} />
          <Skeleton h={72} />
        </>
      ) : versions.length === 0 ? (
        <p className="t-sm muted">{t("tl.v.empty")}</p>
      ) : (
        <ol className="cvt-versions">
          {versions.map((version) => {
            const current = version.isCurrent && !edited
            return (
              <li key={version.id} className={`cvt-version${current ? " is-current" : ""}`}>
                <div className="cvt-version__top">
                  <span>{t("tl.v.number", { n: version.number })}</span>
                  {current ? <Badge tone="primary">{t("tl.v.current")}</Badge> : null}
                </div>
                <span className="cvt-version__label">
                  {version.label ??
                    (version.origin === "restored"
                      ? t("tl.v.origin.restored", { n: version.sourceNumber ?? "?" })
                      : t(`tl.v.origin.${version.origin}`))}
                </span>
                <span className="t-caption muted">{relativeTime(version.createdAt, t)}</span>
                <div className="cvt-version__actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<GitCompareArrows />}
                    loading={busy === version.id}
                    onClick={() => void openCompare(version)}
                  >
                    {t("tl.v.compare")}
                  </Button>
                  <ButtonLink
                    href={backend.printUrl(id, { versionId: version.id })}
                    external
                    size="sm"
                    variant="ghost"
                    icon={<ExternalLink />}
                  >
                    {t("tl.v.preview")}
                  </ButtonLink>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<RotateCcw />}
                    disabled={current || busy !== null}
                    onClick={() => void restore(version)}
                  >
                    {t("tl.v.restore")}
                  </Button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </>
  )
}

function Parts({ parts, Mark }: { parts: DiffPart[]; Mark: "ins" | "del" }) {
  return (
    <>
      {parts.map((part, index) =>
        part.changed ? <Mark key={index}>{part.text}</Mark> : <span key={index}>{part.text}</span>
      )}
    </>
  )
}

function CompareView({
  compare,
  current,
  onBack,
}: {
  compare: { number: number; content: CvContent }
  current: CvContent
  onBack: () => void
}) {
  const { t } = useCvCopy()
  const rows = useMemo(() => diffCv(compare.content, current), [compare.content, current])
  const shown = useMemo(() => compactDiff(rows), [rows])
  return (
    <>
      <div>
        <Button size="sm" variant="ghost" icon={<ArrowLeft />} onClick={onBack}>
          {t("tl.v.back")}
        </Button>
      </div>
      <h3 className="t-sm" style={{ fontWeight: 600, margin: 0 }}>
        {t("tl.v.compareTitle", { n: compare.number })}
      </h3>
      {!hasChanges(rows) ? (
        <p className="t-sm muted">{t("tl.diff.none")}</p>
      ) : (
        <div className="cvt-diff">
          {shown.map((row, index) => {
            if (row.kind === "gap") {
              return (
                <p key={index} className="cvt-diff__gap">
                  {t("tl.diff.gap", { n: row.count })}
                </p>
              )
            }
            if (row.kind === "same") {
              return (
                <p key={index} className="cvt-diff__same">
                  {row.text}
                </p>
              )
            }
            if (row.kind === "del") {
              return (
                <p key={index} className="cvt-diff__del">
                  <span className="sr-only">{t("tl.diff.removed")} </span>
                  <del>{row.text}</del>
                </p>
              )
            }
            if (row.kind === "add") {
              return (
                <p key={index} className="cvt-diff__add">
                  <span className="sr-only">{t("tl.diff.added")} </span>
                  <ins>{row.text}</ins>
                </p>
              )
            }
            return (
              <div key={index} className="cvt-diff">
                <p className="cvt-diff__del">
                  <span className="sr-only">{t("tl.diff.removed")} </span>
                  <Parts parts={row.before} Mark="del" />
                </p>
                <p className="cvt-diff__add">
                  <span className="sr-only">{t("tl.diff.added")} </span>
                  <Parts parts={row.after} Mark="ins" />
                </p>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/** The offer's key terms: those in the CV, those the person has but this CV leaves out, the rest. */
function KeywordList({ keywords }: { keywords: KeywordNote[] }) {
  const { t } = useCvCopy()
  const inCv = keywords.filter((item) => item.status === "kept" || item.status === "added")
  const added = keywords.filter((item) => item.status === "added").length
  const groups = [
    { key: "in", label: null, items: inCv },
    {
      key: "unplaced",
      label: t("tl.r.kwUnplaced"),
      items: keywords.filter((item) => item.status === "unplaced"),
    },
    {
      key: "missing",
      label: t("tl.r.kwMissing"),
      items: keywords.filter((item) => item.status === "missing"),
    },
  ]
  return (
    <section className="cvt-note">
      <h3>{t("tl.r.keywords")}</h3>
      <p>
        {t("tl.r.kwIn", { n: inCv.length, total: keywords.length })}
        {added ? ` ${t("tl.r.kwAdded", { n: added })}` : ""}
      </p>
      {groups.map((group) =>
        group.items.length ? (
          <div key={group.key} className="cvt-kw">
            {group.label ? <p className="t-sm muted">{group.label}</p> : null}
            <ul className="cvt-terms">
              {group.items.map((item) => (
                <li key={item.term}>{item.term}</li>
              ))}
            </ul>
          </div>
        ) : null
      )}
    </section>
  )
}

function ReviewTab({
  doc,
  isLetter,
  jobId,
  notes,
  onNotes,
}: {
  doc: PanelDoc
  isLetter: boolean
  jobId: string | null
  notes: TailorNotes | null
  onNotes: (notes: TailorNotes) => void
}) {
  const { t, locale } = useCvCopy()
  const backend = useCvBackend()
  const toast = useToast()
  const noteId = useId()
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  async function generateAgain() {
    if (!jobId) return
    setBusy(true)
    try {
      await doc.flush()
      const input = { jobId, note: note.trim() || undefined, language: doc.language }
      const result = isLetter
        ? await backend.tailor.letter(input)
        : await backend.tailor.cv({ ...input, locale })
      if (!result) throw new Error("no result")
      doc.replace({ content: result.content, language: result.language }, result.updatedAt)
      onNotes(result.notes)
      toast.show({
        message: t("tl.r.done"),
        action: { label: t("cv.ed.undo"), onClick: doc.undo },
      })
    } catch (error) {
      toast.show({ message: t(tailorErrorKey(error)), tone: "danger" })
    } finally {
      setBusy(false)
    }
  }

  const empty =
    notes &&
    !notes.changes.length &&
    !notes.gaps.length &&
    !notes.unverified.length &&
    !notes.keywords?.length
  return (
    <>
      {notes?.unverified.length ? (
        <section className="cvt-note cvt-note--warn">
          <h3>{t("tl.r.check")}</h3>
          <p>{t("tl.r.checkBody")}</p>
          <ul className="cvt-terms">
            {notes.unverified.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {notes && !notes.usedJobText ? (
        <section className="cvt-note cvt-note--warn">
          <p>{t("tl.r.noJobText")}</p>
        </section>
      ) : null}
      {notes && readOnlyExcerpt(notes) ? (
        <section className="cvt-note cvt-note--warn">
          <p>{t("tl.r.excerpt", { n: notes.offerText?.chars ?? 0 })}</p>
        </section>
      ) : null}
      {notes?.offerText?.origin === "full" ? (
        <p className="t-sm muted">{t("tl.r.full", { n: notes.offerText.chars })}</p>
      ) : null}
      {notes?.reverted ? (
        <section className="cvt-note">
          <p>{t("tl.r.reverted", { n: notes.reverted })}</p>
        </section>
      ) : null}
      {notes?.keywords?.length ? <KeywordList keywords={notes.keywords} /> : null}
      {notes?.changes.length ? (
        <section className="cvt-note">
          <h3>{t("tl.r.changes")}</h3>
          <ul>
            {notes.changes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {notes?.gaps.length ? (
        <section className="cvt-note">
          <h3>{t("tl.r.gaps")}</h3>
          <ul>
            {notes.gaps.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="t-sm muted">{t("tl.r.gapsHint")}</p>
        </section>
      ) : null}
      {!notes || empty ? <p className="t-sm muted">{t("tl.r.noNotes")}</p> : null}

      {jobId ? (
        <form
          className="cvt-again"
          onSubmit={(event) => {
            event.preventDefault()
            void generateAgain()
          }}
        >
          <Field label={t("tl.r.noteLabel")} htmlFor={noteId} hint={t("tl.r.againHint")}>
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
          <Button type="submit" size="sm" variant="secondary" icon={<Sparkles />} loading={busy}>
            {t(isLetter ? "tl.r.againLetter" : "tl.r.again")}
          </Button>
        </form>
      ) : (
        <p className="t-sm muted">{t("tl.r.offerGone")}</p>
      )}
    </>
  )
}
