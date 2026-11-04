"use client"

import { ChevronDown, ChevronUp, Pencil, RotateCcw, Sparkles, X } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { Banner } from "@newrole/ui/primitives"
import { intlLocale } from "@newrole/ui/i18n"
import type { CvT } from "./copy"
import { useCvCopy } from "./locale"
import { auditCategories, type CvAuditNote } from "@newrole/cv-core/audit"
import type { CvAuditState } from "./useCvAudit"

function progressLine(t: CvT, score: number, previous: number | null): string | null {
  if (previous == null) return null
  const delta = score - previous
  if (delta === 0) return t("cv.au.same")
  return t(delta > 0 ? "cv.au.up" : "cv.au.down", { n: Math.abs(delta), previous })
}

/** Over the sheets: the score, what the audit found overall and which notes are shown. */
export function AuditBar({ state }: { state: CvAuditState }) {
  const { t, locale } = useCvCopy()
  const { audit, busy, failed, allOpen, hidden } = state
  if (!audit) {
    return (
      <section className="cva-bar" aria-label={t("cv.au.title")}>
        <div className="cva-bar__main">
          <p className="cva-bar__title">{t("cv.au.title")}</p>
          <p className="cva-bar__summary" role="status">
            {busy ? t("cv.au.running") : failed ? t("cv.au.err") : t("cv.au.intro")}
          </p>
        </div>
        <div className="cva-bar__actions">
          <Button
            size="sm"
            variant="primary"
            icon={<Sparkles />}
            loading={busy}
            onClick={() => void state.run()}
          >
            {t("cv.au.run")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon={<X />}
            aria-label={t("cv.au.close")}
            title={t("cv.au.close")}
            onClick={state.toggle}
          />
        </div>
      </section>
    )
  }

  const total = audit.notes.length
  const skipped = audit.dismissed.length
  const done = total - allOpen.length - skipped
  const counts = new Map(auditCategories.map((category) => [category, 0]))
  for (const { note } of allOpen) counts.set(note.category, (counts.get(note.category) ?? 0) + 1)
  const when = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(audit.createdAt))
  const progress = progressLine(t, audit.score, audit.previousScore)
  const demand = audit.demand.filter((fact) => fact.matchingOffers > 0).slice(0, 8)

  return (
    <section className="cva-bar" aria-label={t("cv.au.title")}>
      <p className="cva-score">
        <strong>{audit.score}</strong>
        <span>{t("cv.au.outOf")}</span>
      </p>
      <div className="cva-bar__main">
        <p className="cva-bar__summary">{audit.summary}</p>
        <p className="cva-bar__meta">
          {[progress, t("cv.au.progress", { done, total }), when].filter(Boolean).join(" · ")}
        </p>
        {!audit.usedModel ? <p className="cva-bar__meta">{t("cv.au.noModel")}</p> : null}
        {failed ? <p className="field__error">{t("cv.au.err")}</p> : null}
        <div className="cva-legend" role="group" aria-label={t("cv.au.filter")}>
          {auditCategories.map((category) => (
            <button
              key={category}
              type="button"
              className={`cva-chip cva-c-${category}`}
              aria-pressed={!hidden.has(category)}
              disabled={!counts.get(category)}
              onClick={() => state.toggleCategory(category)}
            >
              <i aria-hidden />
              {t(`cv.au.cat.${category}`)}
              <b>{counts.get(category)}</b>
            </button>
          ))}
        </div>
        {demand.length ? (
          <details className="cva-demand">
            <summary>{t("cv.au.demand")}</summary>
            <div className="cva-demand__scroll">
              <table className="cva-demand__table">
                <thead>
                  <tr>
                    <th>{t("cv.au.demand.role")}</th>
                    <th>{t("cv.au.demand.phrase")}</th>
                    <th>{t("cv.au.demand.offers")}</th>
                    <th>{t("cv.au.demand.inCv")}</th>
                  </tr>
                </thead>
                <tbody>
                  {demand.map((fact) => (
                    <tr key={fact.id}>
                      <td>{fact.role}</td>
                      <td>{fact.phrase}</td>
                      <td>
                        {t("cv.au.demand.count", {
                          percent: fact.percent,
                          matching: fact.matchingOffers,
                          total: fact.totalOffers,
                        })}
                      </td>
                      <td>{t(fact.presentInProfile ? "cv.au.demand.yes" : "cv.au.demand.no")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="cva-bar__meta">{t("cv.au.demand.hint")}</p>
          </details>
        ) : null}
      </div>
      <div className="cva-bar__actions">
        {skipped ? (
          <Button size="sm" variant="ghost" onClick={state.restoreSkipped}>
            {t("cv.au.restore", { n: skipped })}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          icon={<RotateCcw />}
          loading={busy}
          onClick={() => void state.run()}
        >
          {busy ? t("cv.au.rerunning") : t("cv.au.rerun")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon={<X />}
          aria-label={t("cv.au.close")}
          title={t("cv.au.close")}
          onClick={state.toggle}
        />
      </div>
    </section>
  )
}

function NoteCard({
  note,
  active,
  state,
}: {
  note: CvAuditNote
  active: boolean
  state: CvAuditState
}) {
  const { t } = useCvCopy()
  const important = note.severity >= 4
  return (
    <article
      className={`cva-note cva-c-${note.category}${active ? " is-active" : ""}`}
      data-note={note.id}
      onClick={() => {
        if (!active) state.activate(note.id)
      }}
    >
      <button
        type="button"
        className="cva-note__head"
        aria-expanded={active}
        onClick={(event) => {
          event.stopPropagation()
          state.activate(active ? null : note.id, !active)
        }}
      >
        <i aria-hidden />
        <span className="cva-note__cat">{t(`cv.au.cat.${note.category}`)}</span>
        {note.rewrite && !active ? (
          <Sparkles className="cva-note__has" role="img" aria-label={t("cv.au.hasSuggestion")} />
        ) : null}
        {important ? <span className="cva-note__sev">{t("cv.au.important")}</span> : null}
      </button>
      <p className="cva-note__why">{note.why}</p>
      {active && note.rewrite ? (
        <div className="cva-sug">
          <p className="cva-sug__label">{t("cv.au.suggestion")}</p>
          <p className="cva-sug__text">
            <del>{note.quote}</del> <ins>{note.rewrite}</ins>
          </p>
        </div>
      ) : null}
      {active && !note.rewrite && note.quote ? (
        <p className="cva-note__quote">„{note.quote}”</p>
      ) : null}
      {active ? (
        <div className="cva-note__actions">
          {note.rewrite ? (
            <Button
              size="sm"
              variant="primary"
              onClick={(event) => {
                event.stopPropagation()
                state.apply(note)
              }}
            >
              {t("cv.au.apply")}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={note.rewrite ? "ghost" : "outline"}
            icon={<Pencil />}
            onClick={(event) => {
              event.stopPropagation()
              state.editNote(note)
            }}
          >
            {t("cv.au.edit")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation()
              state.skip(note)
            }}
          >
            {t("cv.au.skip")}
          </Button>
        </div>
      ) : null}
    </article>
  )
}

/** Beside the sheet: one card per note, level with the text it is about. */
export function AuditRail({ state }: { state: CvAuditState }) {
  const { t } = useCvCopy()
  const { audit, busy, notes, allOpen, active, position, stackRef } = state
  const running = busy && !audit
  return (
    <aside className="cva-rail" aria-label={t("cv.au.notes")}>
      <div className="cva-nav">
        <span className="cva-nav__pos" role="status" aria-live="polite">
          {notes.length
            ? position >= 0
              ? t("cv.au.nav", { n: position + 1, total: notes.length })
              : t("cv.au.navCount", { total: notes.length })
            : t("cv.au.navNone")}
        </span>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon={<ChevronUp />}
          aria-label={t("cv.au.prev")}
          title={t("cv.au.prev")}
          disabled={!notes.length}
          onClick={() => state.step(-1)}
        />
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon={<ChevronDown />}
          aria-label={t("cv.au.next")}
          title={t("cv.au.next")}
          disabled={!notes.length}
          onClick={() => state.step(1)}
        />
      </div>
      {running ? (
        <div className="cva-empty" role="status">
          <p className="cva-empty__title">{t("cv.au.running")}</p>
          <p>{t("cv.au.runningBody")}</p>
          <p className="cva-empty__truth">{t("cv.au.truth")}</p>
        </div>
      ) : null}
      {audit && !allOpen.length ? (
        <div className="cva-empty">
          {audit.notes.length ? (
            <>
              <p className="cva-empty__title">{t("cv.au.allDone")}</p>
              <p>{t("cv.au.allDoneBody")}</p>
            </>
          ) : (
            <p className="cva-empty__title">{t("cv.au.noNotes")}</p>
          )}
        </div>
      ) : null}
      {audit && allOpen.length && !notes.length ? (
        <div className="cva-empty">
          <Banner>{t("cv.au.allFiltered")}</Banner>
        </div>
      ) : null}
      <div className="cva-stack" ref={stackRef}>
        {notes.map(({ note }) => (
          <NoteCard key={note.id} note={note} active={note.id === active?.id} state={state} />
        ))}
      </div>
    </aside>
  )
}
