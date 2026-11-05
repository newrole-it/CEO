"use client"

import { invoke } from "@blitzjs/rpc"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CircleAlert, MessageSquareText, Plus, Search, SearchX } from "lucide-react"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { cx } from "@newrole/ui/cx"
import { Modal, useToast } from "@newrole/ui/interactive"
import { Badge, Banner, Chip, EmptyState, Segmented, Skeleton } from "@newrole/ui/primitives"
import { useCopy } from "src/app/i18n/Locale"
import { groupAnswers } from "src/server/answers/group"
import { AnswerPanel } from "./AnswerPanel"
import { ComposeDialog } from "./ComposeDialog"
import listAnswers from "./queries/listAnswers"
import { plural, shortDate, toRow, type AnswerBankStats, type AnswerRow } from "./rows"

const LIST_LIMIT = 500
const SEARCH_DEBOUNCE_MS = 250

type LanguageFilter = "all" | "pl" | "en"

/** True from 1024 px: the edit panel sits next to the list. Below that it opens as a modal. */
function useWide(): boolean {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)")
    const update = () => setWide(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return wide
}

export function AnswersScreen({
  signedIn,
  initialRows,
  initialStats,
}: {
  signedIn: boolean
  initialRows: AnswerRow[]
  initialStats: AnswerBankStats
}) {
  const { t, locale } = useCopy()
  const toast = useToast()
  const wide = useWide()
  const [rows, setRows] = useState(initialRows)
  const [stats, setStats] = useState(initialStats)
  const [q, setQ] = useState("")
  const [tag, setTag] = useState<string | null>(null)
  const [language, setLanguage] = useState<LanguageFilter>("all")
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<AnswerRow | null>(null)
  const [composing, setComposing] = useState(false)
  const run = useRef(0)
  const firstRender = useRef(true)
  const panelRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (query: string, activeTag: string | null) => {
    const id = (run.current += 1)
    setLoading(true)
    setFailed(false)
    try {
      const result = await invoke(listAnswers, {
        q: query.trim() || undefined,
        tag: activeTag ?? undefined,
        limit: LIST_LIMIT,
      })
      if (id !== run.current) return
      setRows(result.rows.map(toRow))
      setStats(result.stats)
    } catch {
      if (id === run.current) setFailed(true)
    } finally {
      if (id === run.current) setLoading(false)
    }
  }, [])

  const refresh = useCallback(() => void load(q, tag), [load, q, tag])

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const timer = window.setTimeout(() => void load(q, tag), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [q, tag, load])

  const visible = useMemo(
    () => (language === "all" ? rows : rows.filter((row) => row.language === language)),
    [rows, language]
  )
  const groups = useMemo(() => groupAnswers(visible), [visible])
  const filtering = Boolean(q.trim() || tag || language !== "all")

  const selectedId = selected?.id
  useEffect(() => {
    if (wide && selectedId) panelRef.current?.focus()
  }, [wide, selectedId])

  function closePanel() {
    const key = selected?.questionKey
    setSelected(null)
    if (!wide) return // the modal restores focus by itself
    window.setTimeout(() => {
      const row = key
        ? listRef.current?.querySelector<HTMLElement>(`[data-answer-key="${CSS.escape(key)}"]`)
        : null
      ;(row ?? searchRef.current)?.focus()
    }, 0)
  }

  function onPanelSaved(row: AnswerRow) {
    const previous = rows.find((item) => item.id === row.id)
    setRows((current) => current.map((item) => (item.id === row.id ? row : item)))
    setSelected((current) => (current?.id === row.id ? row : current))
    // Counts and tag chips depend on these; the text alone does not need a reload.
    if (
      !previous ||
      previous.questionKey !== row.questionKey ||
      previous.tags.join() !== row.tags.join()
    )
      refresh()
  }

  function onPanelDeleted(id: string) {
    setRows((current) => current.filter((item) => item.id !== id))
    closePanel()
    toast.show({ message: t("ans.delete.done") })
    refresh()
  }

  function onComposed(row: AnswerRow, created: boolean) {
    setComposing(false)
    toast.show({ message: t(created ? "ans.compose.saved" : "ans.compose.savedSame") })
    setSelected(row)
    refresh()
  }

  function clearFilters() {
    setQ("")
    setTag(null)
    setLanguage("all")
    searchRef.current?.focus()
  }

  const head = (
    <header className="ans-head">
      <div className="page-head">
        <h1 className="t-h1">{t("ans.title")}</h1>
        <p>{t("ans.sub")}</p>
        {stats.total ? (
          <p className="ans-head__count num">
            {plural(t, locale, "ans.count", stats.total)} ·{" "}
            {plural(t, locale, "ans.questions", stats.questions)}
          </p>
        ) : null}
      </div>
      {signedIn ? (
        <Button variant="primary" icon={<Plus />} onClick={() => setComposing(true)}>
          {t("ans.new")}
        </Button>
      ) : null}
    </header>
  )

  if (!signedIn) {
    return (
      <>
        {head}
        <EmptyState
          icon={<MessageSquareText />}
          title={t("ans.signIn.title")}
          body={t("ans.signIn.body")}
        >
          <ButtonLink href="/login?returnTo=/answers" variant="primary">
            {t("ans.signIn.cta")}
          </ButtonLink>
        </EmptyState>
      </>
    )
  }

  const compose = composing ? (
    <ComposeDialog onClose={() => setComposing(false)} onSaved={onComposed} />
  ) : null

  if (!stats.total && !rows.length && !failed) {
    return (
      <>
        {head}
        <EmptyState
          icon={<MessageSquareText />}
          title={t("ans.empty.title")}
          body={t("ans.empty.body")}
        >
          <Button variant="primary" icon={<Plus />} onClick={() => setComposing(true)}>
            {t("ans.empty.add")}
          </Button>
        </EmptyState>
        {compose}
      </>
    )
  }

  const panel = selected ? (
    <AnswerPanel
      key={selected.id}
      row={selected}
      titleId="ans-panel-title"
      onSaved={onPanelSaved}
      onDeleted={onPanelDeleted}
      onSelect={setSelected}
      onClose={closePanel}
    />
  ) : null

  return (
    <>
      {head}
      <div className="ans-toolbar">
        <div className="ans-search">
          <Search aria-hidden />
          <input
            ref={searchRef}
            type="search"
            className="input"
            value={q}
            aria-label={t("ans.search")}
            placeholder={t("ans.search")}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <Segmented<LanguageFilter>
          label={t("ans.filter.language")}
          value={language}
          onChange={setLanguage}
          options={[
            { value: "all", label: t("ans.lang.all") },
            { value: "pl", label: t("ans.lang.pl") },
            { value: "en", label: t("ans.lang.en") },
          ]}
        />
      </div>
      {stats.tags.length ? (
        <div className="chips chips--sm ans-tags" role="group" aria-label={t("ans.filter.tags")}>
          {stats.tags.slice(0, 16).map((item) => (
            <Chip
              key={item.tag}
              size="sm"
              pressed={tag === item.tag}
              onClick={() => setTag((current) => (current === item.tag ? null : item.tag))}
            >
              {item.tag}
            </Chip>
          ))}
        </div>
      ) : null}
      {failed ? (
        <Banner tone="danger" icon={<CircleAlert />} role="alert" className="ans-banner">
          <div className="row row--between">
            <span>{t("ans.err.load")}</span>
            <Button size="sm" variant="outline" onClick={refresh}>
              {t("common.retry")}
            </Button>
          </div>
        </Banner>
      ) : null}
      <p className="sr-only" role="status">
        {loading ? t("common.loading") : plural(t, locale, "ans.questions", groups.length)}
      </p>
      <div className={cx("ans-layout", selected && wide && "has-panel")}>
        <div className="ans-main">
          {loading && !rows.length ? (
            <div className="stack-sm" aria-hidden>
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} h={112} r={14} />
              ))}
            </div>
          ) : !groups.length && !failed ? (
            <EmptyState icon={<SearchX />} title={t("ans.none.title")} body={t("ans.none.body")}>
              {filtering ? (
                <Button variant="outline" onClick={clearFilters}>
                  {t("ans.none.clear")}
                </Button>
              ) : null}
            </EmptyState>
          ) : (
            <ul ref={listRef} className="ans-list" aria-label={t("ans.list")} aria-busy={loading}>
              {groups.map((group) => {
                const variants = stats.variants[group.key] ?? group.rows.length
                const active = selected ? group.rows.some((row) => row.id === selected.id) : false
                return (
                  <li key={group.key}>
                    <button
                      type="button"
                      className={cx("card card--hover ans-row", active && "is-active")}
                      aria-current={active ? "true" : undefined}
                      data-answer-key={group.key}
                      onClick={() => setSelected(group.latest)}
                    >
                      <span className="ans-row__q">{group.latest.question}</span>
                      <span className="ans-row__a">{group.latest.answer}</span>
                      <span className="ans-row__meta">
                        {variants > 1 ? (
                          <Badge tone="primary">
                            {plural(t, locale, "ans.row.variants", variants)}
                          </Badge>
                        ) : null}
                        {group.uses > 1 ? (
                          <Badge>{t("ans.row.uses", { n: group.uses })}</Badge>
                        ) : null}
                        {group.company ? (
                          <span className="ans-row__company">{group.company}</span>
                        ) : null}
                        <span suppressHydrationWarning>
                          {t("ans.row.updated", {
                            when: shortDate(group.latest.updatedAt, locale),
                          })}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {rows.length >= LIST_LIMIT ? (
            <p className="t-sm muted ans-note">{t("ans.limitNote", { n: LIST_LIMIT })}</p>
          ) : null}
        </div>
        {panel && wide ? (
          <aside
            ref={panelRef}
            className="card ans-side"
            tabIndex={-1}
            aria-labelledby="ans-panel-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation()
                closePanel()
              }
            }}
          >
            {panel}
          </aside>
        ) : null}
      </div>
      {panel && !wide ? (
        <Modal
          open
          kind="drawer"
          onClose={closePanel}
          labelledBy="ans-panel-title"
          className="ans-drawer"
        >
          {panel}
        </Modal>
      ) : null}
      {compose}
    </>
  )
}
