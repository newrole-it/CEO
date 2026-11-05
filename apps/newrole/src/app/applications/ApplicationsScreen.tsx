"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { invoke } from "@blitzjs/rpc"
import {
  ChartNoAxesColumn,
  ClipboardList,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Plus,
  Search,
  Upload,
} from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { numberFormat, type CopyKey } from "src/app/i18n/copy"
import { Button, ButtonLink, buttonClass } from "@newrole/ui/Button"
import { useToast } from "@newrole/ui/interactive"
import { EmptyState } from "@newrole/ui/primitives"
import { computeStats, matchesQuery, nextClosedAtStage } from "src/server/applications/logic"
import { statusLabel, type ApplicationStatus } from "src/shared/applications"
import updateApplication from "./mutations/updateApplication"
import importApplicationsCsv from "./mutations/importApplicationsCsv"
import { AddApplicationDialog } from "./AddApplicationDialog"
import { ApplicationDrawer } from "./ApplicationDrawer"
import { MailInbox } from "./MailInbox"
import {
  ApplicationTable,
  compareBy,
  defaultOrder,
  type Sort,
  type SortKey,
} from "./ApplicationTable"
import { GROUPS, inGroup, sourceKey, toRow, type AppGroup, type AppRow } from "./rows"

export function ApplicationsScreen({
  signedIn,
  initialRows,
  initialGroup,
  initialOpenId,
  sheetUrl,
}: {
  signedIn: boolean
  initialRows: AppRow[]
  initialGroup: AppGroup
  initialOpenId: string | null
  /** The connected Google Sheet, when the person saved its link in Settings */
  sheetUrl: string | null
}) {
  const { t, locale } = useCopy()
  const toast = useToast()
  const [rows, setRows] = useState(initialRows)
  const [group, setGroup] = useState<AppGroup>(initialGroup)
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<Sort | null>(null)
  const [openId, setOpenId] = useState<string | null>(initialOpenId)
  const [revision, setRevision] = useState(0)
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const csvInput = useRef<HTMLInputElement>(null)
  const pushed = useRef(false)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const onPop = () => {
      pushed.current = false
      setOpenId(new URLSearchParams(window.location.search).get("id"))
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const setParam = useCallback((name: string, value: string | null, push = false) => {
    const url = new URL(window.location.href)
    if (value) url.searchParams.set(name, value)
    else url.searchParams.delete(name)
    if (push) window.history.pushState(null, "", url)
    else window.history.replaceState(null, "", url)
  }, [])

  const open = useCallback(
    (id: string) => {
      setOpenId(id)
      const already = new URLSearchParams(window.location.search).get("id")
      setParam("id", id, !already)
      if (!already) pushed.current = true
    },
    [setParam]
  )

  async function importFile(file: File) {
    setImporting(true)
    try {
      const result = await invoke(importApplicationsCsv, { text: await file.text() })
      if (result.error || !result.applications) {
        toast.show({ message: t("app.import.columns"), tone: "danger", duration: 8000 })
        return
      }
      setRows(result.applications.map(toRow))
      toast.show({
        message: t("app.import.done", { created: result.created, skipped: result.skipped }),
      })
    } catch {
      toast.show({ message: t("app.import.failed"), tone: "danger" })
    } finally {
      setImporting(false)
      if (csvInput.current) csvInput.current.value = ""
    }
  }

  const close = useCallback(() => {
    setOpenId(null)
    if (pushed.current) {
      pushed.current = false
      window.history.back()
    } else {
      setParam("id", null)
    }
  }, [setParam])

  const replace = useCallback((row: AppRow) => {
    setRows((current) => current.map((item) => (item.id === row.id ? row : item)))
  }, [])

  const changeStatus = useCallback(
    async (row: AppRow, status: ApplicationStatus, stageNote?: string | null) => {
      if (status === row.status) return
      replace({
        ...row,
        status,
        stageNote: stageNote ?? null,
        statusChangedAt: new Date().toISOString(),
        closedAtStage: nextClosedAtStage(row.status, row.closedAtStage, status),
      })
      try {
        const view = await invoke(updateApplication, {
          id: row.id,
          status,
          stageNote: stageNote ?? null,
        })
        const saved = toRow(view)
        replace(saved)
        setRevision((value) => value + 1)
        toast.show({
          message: t("app.toast.status", {
            company: row.company,
            status: statusLabel(status, locale),
          }),
          action: {
            label: t("act.undo"),
            onClick: () => void changeStatus(saved, row.status, row.stageNote),
          },
        })
      } catch {
        replace(row)
        toast.show({ message: t("app.err.save"), tone: "danger" })
      }
    },
    [locale, replace, t, toast]
  )

  const stats = useMemo(
    () =>
      computeStats(
        rows.map((row) => ({
          status: row.status,
          closedAtStage: row.closedAtStage,
          nextStepAt: row.nextStepAt ? new Date(row.nextStepAt) : null,
        })),
        new Date()
      ),
    [rows]
  )

  const counts = useMemo(
    () =>
      Object.fromEntries(
        GROUPS.map((value) => [value, rows.filter((row) => inGroup(row.status, value)).length])
      ),
    [rows]
  ) as Record<AppGroup, number>

  const visible = useMemo(() => {
    const filtered = rows.filter((row) => inGroup(row.status, group) && matchesQuery(row, q))
    const label = (row: AppRow) => t(sourceKey(row.source))
    return filtered.sort(sort ? compareBy(sort, locale, label) : defaultOrder)
  }, [rows, group, q, sort, locale, t])

  function onSort(key: SortKey) {
    setSort((current) =>
      current?.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    )
  }

  function pickGroup(next: AppGroup) {
    setGroup(next)
    setParam("group", next === "active" ? null : next)
  }

  const nf = numberFormat(locale)
  const openRow = rows.find((row) => row.id === openId) ?? null
  const groupKey: Record<AppGroup, CopyKey> = {
    active: "app.filter.active",
    all: "app.filter.all",
    closed: "app.filter.closed",
    rejected: "app.filter.rejected",
  }

  return (
    <div className="stack-lg apps-page">
      <div className="apps-head">
        <header className="page-head">
          <h1 className="t-h1">{t("app.title")}</h1>
          <p>{t("app.sub")}</p>
        </header>
        {signedIn ? (
          <div className="apps-head__actions">
            <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>
              {t("app.add")}
            </Button>
            {rows.length ? (
              <ButtonLink
                href="/applications/stats"
                variant="outline"
                icon={<ChartNoAxesColumn aria-hidden />}
              >
                {t("stx.open")}
              </ButtonLink>
            ) : null}
            <Button
              variant="outline"
              icon={<Upload aria-hidden />}
              loading={importing}
              onClick={() => csvInput.current?.click()}
            >
              {t("app.import")}
            </Button>
            <input
              ref={csvInput}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void importFile(file)
              }}
            />
            {rows.length ? (
              <a
                href="/applications/export"
                className={buttonClass({ variant: "outline" })}
                download
              >
                <Download aria-hidden />
                {t("app.export")}
              </a>
            ) : null}
            {sheetUrl ? (
              <ButtonLink
                href={sheetUrl}
                external
                variant="outline"
                icon={<FileSpreadsheet aria-hidden />}
                iconRight={<ExternalLink aria-hidden />}
              >
                {t("sheet.open")}
              </ButtonLink>
            ) : null}
          </div>
        ) : null}
      </div>

      {signedIn ? (
        <MailInbox
          onChanged={(view) => {
            const row = toRow(view)
            setRows((current) =>
              current.some((item) => item.id === row.id)
                ? current.map((item) => (item.id === row.id ? row : item))
                : [row, ...current]
            )
            setRevision((value) => value + 1)
          }}
        />
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title={t("app.empty.title")}
          body={signedIn ? t("app.empty.body") : `${t("app.empty.body")} ${t("app.signIn")}`}
        >
          <ButtonLink href="/jobs" variant="primary">
            {t("app.empty.offers")}
          </ButtonLink>
          <ButtonLink href="/settings#st-extension" variant="outline">
            {t("app.empty.extension")}
          </ButtonLink>
        </EmptyState>
      ) : (
        <>
          <dl className="apps-stats" aria-label={t("app.stats.label")}>
            <div className="card">
              <dt>{t("app.stats.active")}</dt>
              <dd>{nf.format(stats.active)}</dd>
            </div>
            <div className="card">
              <dt>{t("app.stats.interviewing")}</dt>
              <dd>{nf.format(stats.interviewing)}</dd>
            </div>
            <div className="card">
              <dt>{t("app.stats.offers")}</dt>
              <dd>{nf.format(stats.offers)}</dd>
            </div>
            <div className="card">
              <dt>{t("app.stats.rejected")}</dt>
              <dd>{nf.format(stats.rejected)}</dd>
            </div>
            <div className="card">
              <dt>{t("app.stats.response")}</dt>
              <dd>
                {stats.responseRate == null ? "—" : `${Math.round(stats.responseRate * 100)}%`}
              </dd>
            </div>
          </dl>

          <div className="stack">
            <div className="apps-toolbar">
              <div className="tabs" role="tablist" aria-label={t("app.filter.label")}>
                {GROUPS.map((value, index) => (
                  <button
                    key={value}
                    ref={(node) => {
                      tabRefs.current[index] = node
                    }}
                    type="button"
                    role="tab"
                    className="tab"
                    aria-selected={group === value}
                    aria-controls="apps-list"
                    tabIndex={group === value ? 0 : -1}
                    onClick={() => pickGroup(value)}
                    onKeyDown={(event) => {
                      const step =
                        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
                      if (!step) return
                      event.preventDefault()
                      const next = (index + step + GROUPS.length) % GROUPS.length
                      pickGroup(GROUPS[next])
                      tabRefs.current[next]?.focus()
                    }}
                  >
                    {t(groupKey[value])}
                    {counts[value] ? <span className="badge num">{counts[value]}</span> : null}
                  </button>
                ))}
              </div>
              <div className="input-affix input-affix--icon apps-search">
                <Search className="input-affix__icon" aria-hidden />
                <input
                  className="input"
                  type="search"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder={t("app.search")}
                  aria-label={t("app.search")}
                />
              </div>
            </div>

            {stats.overdue ? (
              <p className="t-sm" style={{ color: "var(--danger)", fontWeight: 600 }}>
                {t("app.stats.overdue", { n: stats.overdue })}
              </p>
            ) : null}

            {visible.length ? (
              <div role="tabpanel" aria-label={t(groupKey[group])}>
                <ApplicationTable
                  listId="apps-list"
                  rows={visible}
                  sort={sort}
                  onSort={onSort}
                  openId={openId}
                  onOpen={open}
                  onStatus={(row, status) => void changeStatus(row, status)}
                />
              </div>
            ) : (
              <div id="apps-list" role="tabpanel" className="card card--quiet card--pad stack-sm">
                <p className="muted">
                  {q.trim() ? t("app.empty.search", { q: q.trim() }) : t("app.empty.filter")}
                </p>
                {q.trim() ? (
                  <div>
                    <Button size="sm" variant="ghost" onClick={() => setQ("")}>
                      {t("app.clearSearch")}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </>
      )}

      <ApplicationDrawer
        id={openId}
        row={openRow}
        revision={revision}
        onClose={close}
        onSaved={(view) => replace(toRow(view))}
        onStatus={(row, status, stageNote) => changeStatus(row, status, stageNote)}
        onDeleted={(id) => {
          setRows((current) => current.filter((row) => row.id !== id))
          close()
          toast.show({ message: t("app.toast.deleted") })
        }}
      />

      <AddApplicationDialog
        open={adding}
        onClose={() => setAdding(false)}
        onShow={(id) => {
          setAdding(false)
          open(id)
        }}
        onAdded={(view, created) => {
          setAdding(false)
          const row = toRow(view)
          if (created) {
            setRows((current) => [row, ...current.filter((item) => item.id !== row.id)])
            if (!inGroup(row.status, group)) pickGroup("all")
            toast.show({
              message: t("app.toast.added", { company: row.company, title: row.title }),
            })
          } else {
            replace(row)
            toast.show({ message: t("app.toast.exists") })
            open(row.id)
          }
        }}
      />
    </div>
  )
}
