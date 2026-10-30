"use client"

import { ArrowDownUp, ArrowDown, ArrowUp, ExternalLink } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { CompanyInitial } from "src/app/components/ds/primitives"
import { cx } from "src/app/components/ds/cx"
import {
  APPLICATION_STATUSES,
  isActiveStatus,
  STAGE_RECORDING_STATUSES,
  statusLabel,
  type ApplicationStatus,
} from "src/shared/applications"
import { dayLabel, daysLabel, daysSince, isOverdue, longDate, sourceKey, type AppRow } from "./rows"
import { StatusSelect } from "./StatusSelect"

export type SortKey = "company" | "title" | "status" | "inStage" | "applied" | "next" | "source"
export type Sort = { key: SortKey; dir: "asc" | "desc" }

const rank = (status: string) => (APPLICATION_STATUSES as readonly string[]).indexOf(status)

/** Funnel order, then the newest application first (same as the sheet). */
export function defaultOrder(a: AppRow, b: AppRow): number {
  return rank(a.status) - rank(b.status) || b.appliedAt.localeCompare(a.appliedAt)
}

export function compareBy(sort: Sort, locale: string, label: (row: AppRow) => string) {
  const sign = sort.dir === "asc" ? 1 : -1
  return (a: AppRow, b: AppRow): number => {
    switch (sort.key) {
      case "company":
      case "title":
        return sign * a[sort.key].localeCompare(b[sort.key], locale, { sensitivity: "base" })
      case "status":
        return sign * (rank(a.status) - rank(b.status))
      case "inStage":
        return sign * (daysSince(a.statusChangedAt) - daysSince(b.statusChangedAt))
      case "applied":
        return sign * a.appliedAt.localeCompare(b.appliedAt)
      case "next":
        if (!a.nextStepAt || !b.nextStepAt) return a.nextStepAt ? -1 : b.nextStepAt ? 1 : 0
        return sign * a.nextStepAt.localeCompare(b.nextStepAt)
      case "source":
        return sign * label(a).localeCompare(label(b), locale)
    }
  }
}

function ClosedAfter({ row }: { row: AppRow }) {
  const { t, locale } = useCopy()
  if (!row.closedAtStage || !(STAGE_RECORDING_STATUSES as readonly string[]).includes(row.status))
    return null
  return (
    <span className="apps-sub">
      {t(`app.closedAfter.${row.status}` as CopyKey, {
        stage: statusLabel(row.closedAtStage, locale),
      })}
    </span>
  )
}

function NextStep({ row }: { row: AppRow }) {
  const { t, locale } = useCopy()
  // A closed application has no next step; what was planned stays in the drawer and the timeline.
  if ((!row.nextStep && !row.nextStepAt) || !isActiveStatus(row.status)) {
    return <span className="subtle">—</span>
  }
  const overdue = isOverdue(row)
  return (
    <span className={cx("apps-next", overdue && "is-overdue")}>
      {row.nextStep ? <span>{row.nextStep}</span> : null}
      {row.nextStepAt ? (
        <span className="apps-next__date">
          {dayLabel(row.nextStepAt, locale)}
          {overdue ? ` · ${t("app.overdue")}` : ""}
        </span>
      ) : null}
    </span>
  )
}

function OfferLink({ row }: { row: AppRow }) {
  const { t } = useCopy()
  if (!row.url) return null
  return (
    <a
      className="apps-link"
      href={row.url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={t("app.openOfferOf", { title: row.title })}
      title={t("app.openOffer")}
      onClick={(event) => event.stopPropagation()}
    >
      <ExternalLink width={18} height={18} aria-hidden />
    </a>
  )
}

export function ApplicationTable({
  rows,
  sort,
  onSort,
  openId,
  onOpen,
  onStatus,
  listId,
}: {
  rows: AppRow[]
  sort: Sort | null
  onSort: (key: SortKey) => void
  openId: string | null
  onOpen: (id: string) => void
  onStatus: (row: AppRow, status: ApplicationStatus) => void
  listId: string
}) {
  const { t, locale } = useCopy()

  const head = (key: SortKey, label: string) => {
    const active = sort?.key === key
    const Icon = !active ? ArrowDownUp : sort.dir === "asc" ? ArrowUp : ArrowDown
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          className="apps-sort"
          onClick={() => onSort(key)}
          title={t("app.sortBy", { col: label })}
        >
          {label}
          <Icon aria-hidden />
        </button>
      </th>
    )
  }

  return (
    <div id={listId}>
      <div className="table-wrap apps-desktop">
        <table className="table apps-table">
          <thead>
            <tr>
              {head("company", t("app.col.company"))}
              {head("title", t("app.col.title"))}
              {head("status", t("app.col.status"))}
              {head("inStage", t("app.col.inStage"))}
              {head("applied", t("app.col.applied"))}
              {head("next", t("app.col.next"))}
              {head("source", t("app.col.source"))}
              <th scope="col">
                <span className="sr-only">{t("app.col.link")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onOpen(row.id)}
                aria-current={openId === row.id ? "true" : undefined}
              >
                <td>
                  <span className="row" style={{ flexWrap: "nowrap", gap: 10 }}>
                    <CompanyInitial name={row.company} />
                    <button
                      type="button"
                      className="apps-open"
                      aria-label={t("app.openDetails", { company: row.company, title: row.title })}
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpen(row.id)
                      }}
                    >
                      {row.company}
                    </button>
                  </span>
                </td>
                <td className="apps-title">
                  {row.title}
                  {row.stageNote ? <span className="apps-sub">{row.stageNote}</span> : null}
                </td>
                <td>
                  <StatusSelect
                    value={row.status}
                    label={t("app.changeStatus", { company: row.company, title: row.title })}
                    onChange={(status) => onStatus(row, status)}
                  />
                  <ClosedAfter row={row} />
                </td>
                <td className="num" title={longDate(row.statusChangedAt, locale)}>
                  {daysLabel(row.statusChangedAt, t)}
                </td>
                <td className="num" title={longDate(row.appliedAt, locale)}>
                  {dayLabel(row.appliedAt, locale)}
                </td>
                <td>
                  <NextStep row={row} />
                </td>
                <td>
                  <span className="badge">{t(sourceKey(row.source))}</span>
                </td>
                <td>
                  <OfferLink row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="apps-mobile">
        {rows.map((row) => (
          <li key={row.id} className="card apps-card">
            <CompanyInitial name={row.company} />
            <div className="apps-card__main">
              <button
                type="button"
                className="apps-open"
                aria-label={t("app.openDetails", { company: row.company, title: row.title })}
                onClick={() => onOpen(row.id)}
              >
                {row.company}
              </button>
              <span>{row.title}</span>
              <span className="apps-card__meta">
                {t("app.col.applied")} {dayLabel(row.appliedAt, locale)} ·{" "}
                {t(sourceKey(row.source))}
              </span>
            </div>
            <div className="apps-card__row">
              <StatusSelect
                value={row.status}
                label={t("app.changeStatus", { company: row.company, title: row.title })}
                onChange={(status) => onStatus(row, status)}
              />
              <span className="t-sm muted">{daysLabel(row.statusChangedAt, t)}</span>
              <OfferLink row={row} />
            </div>
            {row.stageNote || row.closedAtStage ? (
              <div className="apps-card__next">
                {row.stageNote ? <span className="apps-sub">{row.stageNote}</span> : null}
                <ClosedAfter row={row} />
              </div>
            ) : null}
            {(row.nextStep || row.nextStepAt) && isActiveStatus(row.status) ? (
              <div className="apps-card__next">
                <NextStep row={row} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
