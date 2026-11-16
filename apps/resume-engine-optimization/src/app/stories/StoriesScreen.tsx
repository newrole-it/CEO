"use client"

import { useMemo, useState } from "react"
import { BookOpenText, CircleAlert, Info, Plus, Sparkles } from "lucide-react"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { cx } from "@newrole/ui/cx"
import { Modal, useToast } from "@newrole/ui/interactive"
import { Badge, Banner, EmptyState, Segmented } from "@newrole/ui/primitives"
import { missingParts } from "@newrole/cv-core/stories"
import { invoke } from "src/app/rpc"
import { useCopy } from "src/app/i18n/Locale"
import { intlLocale, pluralKind, type CopyKey } from "src/app/i18n/copy"
import type { DraftStoriesCode } from "src/server/interview/types"
import draftStories from "./mutations/draftStories"
import { StoryPanel } from "./StoryPanel"
import { toRow, type StoryRow } from "./rows"
import { useWide } from "./useWide"

type Filter = "all" | "saved" | "draft"

/** What the panel shows: a stored story, or a new one that starts with these themes. */
type Open = { kind: "story"; row: StoryRow } | { kind: "new"; themes: string[] }

type DraftState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; code: DraftStoriesCode; kept: number; dropped: number }

const NOTE_TONE: Record<DraftStoriesCode, "info" | "success" | "warning" | "danger"> = {
  drafted: "success",
  nothing: "warning",
  "no-data": "info",
  "no-model": "info",
  failed: "danger",
  limited: "warning",
}

/**
 * The story bank: the list, the editor next to it (a drawer on a narrow screen) and "Draft from my
 * CV". A draft stays marked as one until the person saves it.
 */
export function StoriesScreen({
  signedIn,
  initialRows,
  canDraft,
  startNew,
  topic,
}: {
  signedIn: boolean
  initialRows: StoryRow[]
  /** A model is configured; without one the bank is filled by hand */
  canDraft: boolean
  startNew: boolean
  topic: string
}) {
  const { t, locale } = useCopy()
  const toast = useToast()
  const wide = useWide()
  const [rows, setRows] = useState(initialRows)
  const [filter, setFilter] = useState<Filter>("all")
  const [open, setOpen] = useState<Open | null>(
    signedIn && startNew ? { kind: "new", themes: topic ? [topic] : [] } : null
  )
  const [draft, setDraft] = useState<DraftState>({ status: "idle" })

  const drafts = rows.filter((row) => row.status === "draft").length
  const saved = rows.length - drafts
  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((row) => row.status === filter)),
    [rows, filter]
  )
  const shortDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso))
  const partNames = (row: StoryRow) =>
    new Intl.ListFormat(intlLocale(locale), { style: "narrow", type: "conjunction" }).format(
      missingParts(row).map((part) => t(`iv.part.${part}` as CopyKey))
    )

  async function runDraft() {
    setDraft({ status: "running" })
    try {
      const result = await invoke(draftStories, {})
      if (!result) throw new Error("no result")
      const added = result.stories.map(toRow)
      if (added.length) {
        setRows((current) => [...added, ...current])
        setFilter("all")
      }
      setDraft({
        status: "done",
        code: result.code,
        kept: added.length,
        dropped: result.dropped,
      })
    } catch {
      setDraft({ status: "done", code: "failed", kept: 0, dropped: 0 })
    }
  }

  function onSaved(row: StoryRow, created: boolean) {
    setRows((current) =>
      created ? [row, ...current] : current.map((item) => (item.id === row.id ? row : item))
    )
    setOpen({ kind: "story", row })
    toast.show({ message: t("iv.story.saved") })
  }

  function onDeleted(id: string) {
    setRows((current) => current.filter((item) => item.id !== id))
    setOpen(null)
    toast.show({ message: t("iv.story.deleted") })
  }

  const head = (
    <header className="ans-head">
      <div className="page-head">
        <h1 className="t-h1">{t("iv.stories.title")}</h1>
        <p>{t("iv.stories.sub")}</p>
        {rows.length ? (
          <p className="ans-head__count num">
            {t(`iv.stories.count.${pluralKind(saved, locale)}` as CopyKey, { n: saved })}
          </p>
        ) : null}
      </div>
      {signedIn ? (
        <div className="row">
          {canDraft ? (
            <Button
              variant="outline"
              icon={<Sparkles />}
              loading={draft.status === "running"}
              onClick={() => void runDraft()}
            >
              {t("iv.draft.cta")}
            </Button>
          ) : null}
          <Button
            variant="primary"
            icon={<Plus />}
            onClick={() => setOpen({ kind: "new", themes: [] })}
          >
            {t("iv.stories.add")}
          </Button>
        </div>
      ) : null}
    </header>
  )

  if (!signedIn) {
    return (
      <>
        {head}
        <EmptyState
          icon={<BookOpenText />}
          title={t("iv.stories.signIn.title")}
          body={t("iv.stories.signIn.body")}
        >
          <ButtonLink href="/login?returnTo=/stories" variant="primary">
            {t("iv.stories.signIn.cta")}
          </ButtonLink>
        </EmptyState>
      </>
    )
  }

  const notes = (
    <>
      {draft.status === "running" ? (
        <p className="ans-drafting iv-note" role="status">
          <Sparkles aria-hidden />
          <span>{t("iv.draft.running")}</span>
        </p>
      ) : null}
      {draft.status === "done" ? (
        <Banner
          tone={NOTE_TONE[draft.code]}
          icon={draft.code === "failed" ? <CircleAlert /> : <Info />}
          role={draft.code === "failed" ? "alert" : "status"}
          className="iv-note"
        >
          <p>
            {draft.code === "drafted"
              ? t(`iv.draft.done.${pluralKind(draft.kept, locale)}` as CopyKey, { n: draft.kept })
              : t(`iv.draft.code.${draft.code}` as CopyKey)}
          </p>
          {draft.dropped ? (
            <p className="t-sm">
              {t(`iv.draft.dropped.${pluralKind(draft.dropped, locale)}` as CopyKey, {
                n: draft.dropped,
              })}
            </p>
          ) : null}
        </Banner>
      ) : null}
      {!canDraft ? <p className="t-sm muted iv-note">{t("iv.draft.noModel")}</p> : null}
    </>
  )

  const panel = open ? (
    <StoryPanel
      key={open.kind === "story" ? open.row.id : "new"}
      row={open.kind === "story" ? open.row : null}
      themes={open.kind === "new" ? open.themes : []}
      titleId="iv-panel-title"
      onSaved={onSaved}
      onDeleted={onDeleted}
      onClose={() => setOpen(null)}
    />
  ) : null

  return (
    <>
      {head}
      {notes}
      {!rows.length && !open ? (
        <EmptyState
          icon={<BookOpenText />}
          title={t("iv.stories.empty.title")}
          body={t("iv.stories.empty.body")}
        >
          <Button
            variant="primary"
            icon={<Plus />}
            onClick={() => setOpen({ kind: "new", themes: [] })}
          >
            {t("iv.stories.empty.add")}
          </Button>
        </EmptyState>
      ) : (
        <>
          {drafts ? (
            <div className="ans-toolbar">
              <Segmented<Filter>
                label={t("iv.stories.filter")}
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: t("iv.stories.filter.all") },
                  { value: "saved", label: t("iv.stories.filter.saved") },
                  { value: "draft", label: t("iv.stories.filter.draft") },
                ]}
              />
            </div>
          ) : null}
          <div className={cx("ans-layout", open && wide && "has-panel")}>
            <div className="ans-main">
              {visible.length ? (
                <ul className="ans-list" aria-label={t("iv.stories.list")}>
                  {visible.map((row) => {
                    const active = open?.kind === "story" && open.row.id === row.id
                    const missing = missingParts(row)
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          className={cx("card card--hover ans-row", active && "is-active")}
                          aria-current={active ? "true" : undefined}
                          onClick={() => setOpen({ kind: "story", row })}
                        >
                          <span className="ans-row__q">{row.title}</span>
                          <span className="ans-row__a">
                            {row.action || row.situation || row.task || row.result}
                          </span>
                          <span className="ans-row__meta">
                            {row.status === "draft" ? (
                              <Badge tone="warning">{t("iv.story.draft")}</Badge>
                            ) : null}
                            {row.themes.map((theme) => (
                              <Badge key={theme} tone="plain">
                                {theme}
                              </Badge>
                            ))}
                            {missing.length ? (
                              <span>{t("iv.story.missing", { parts: partNames(row) })}</span>
                            ) : null}
                            <span suppressHydrationWarning>
                              {t("iv.story.updated", { when: shortDate(row.updatedAt) })}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : rows.length ? (
                <p className="muted">{t("iv.stories.filter.none")}</p>
              ) : null}
            </div>
            {panel && wide ? (
              <aside className="card ans-side" aria-labelledby="iv-panel-title">
                {panel}
              </aside>
            ) : null}
          </div>
        </>
      )}
      {panel && !wide ? (
        <Modal
          open
          kind="drawer"
          onClose={() => setOpen(null)}
          labelledBy="iv-panel-title"
          className="ans-drawer"
        >
          {panel}
        </Modal>
      ) : null}
    </>
  )
}
