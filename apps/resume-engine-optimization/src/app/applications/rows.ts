import { intlLocale, type CopyKey, type Locale, type T } from "src/app/i18n/copy"
import { isActiveStatus, type ApplicationStatus } from "src/shared/applications"
import type { ApplicationView } from "src/server/applications/types"

/** An application as the client keeps it: dates as ISO strings, safe to pass from the server page. */
export type AppRow = Omit<
  ApplicationView,
  "appliedAt" | "statusChangedAt" | "nextStepAt" | "createdAt" | "updatedAt"
> & {
  appliedAt: string
  statusChangedAt: string
  nextStepAt: string | null
  createdAt: string
  updatedAt: string
}

export function toRow(view: ApplicationView): AppRow {
  return {
    ...view,
    appliedAt: new Date(view.appliedAt).toISOString(),
    statusChangedAt: new Date(view.statusChangedAt).toISOString(),
    nextStepAt: view.nextStepAt ? new Date(view.nextStepAt).toISOString() : null,
    createdAt: new Date(view.createdAt).toISOString(),
    updatedAt: new Date(view.updatedAt).toISOString(),
  }
}

export type AppGroup = "active" | "all" | "closed" | "rejected"
export const GROUPS: AppGroup[] = ["active", "all", "closed", "rejected"]

export function inGroup(status: ApplicationStatus, group: AppGroup): boolean {
  if (group === "all") return true
  if (group === "active") return isActiveStatus(status)
  if (group === "rejected") return status === "REJECTED"
  return !isActiveStatus(status)
}

const DAY = 86_400_000

function startOfToday(now = Date.now()): number {
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}

/** Whole days since the status changed: "dziś", "1 dzień", "5 dni". */
export function daysLabel(iso: string, t: T, now = Date.now()): string {
  const days = Math.max(
    0,
    Math.floor((startOfToday(now) - startOfToday(new Date(iso).getTime())) / DAY)
  )
  if (days === 0) return t("app.days.today")
  if (days === 1) return t("app.days.one")
  return t("app.days.many", { n: days })
}

export function daysSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY))
}

export function isOverdue(row: Pick<AppRow, "status" | "nextStepAt">, now = Date.now()): boolean {
  return Boolean(
    row.nextStepAt &&
    isActiveStatus(row.status) &&
    new Date(row.nextStepAt).getTime() < startOfToday(now)
  )
}

/** "12 paź" this year, "12 paź 2025" otherwise. */
export function dayLabel(iso: string | null, locale: Locale): string {
  if (!iso) return ""
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ""
  const sameYear = at.getFullYear() === new Date().getFullYear()
  return at.toLocaleDateString(intlLocale(locale), {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })
}

/** Full date for titles and the timeline. */
export function longDate(iso: string | Date, locale: Locale, withTime = false): string {
  const at = new Date(iso)
  return at.toLocaleString(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  })
}

/** Value for <input type="date"> in local time. */
export function dateInput(iso: string | null): string {
  if (!iso) return ""
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

/** A picked day as local noon, so it stays the same day in every view and in the sheet. */
export function fromDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const at = new Date(`${value}T12:00:00`)
  return Number.isNaN(at.getTime()) ? null : at
}

export function sourceKey(source: string): CopyKey {
  return (
    ["nowarola", "extension", "manual", "mcp", "gmail", "sheet", "csv"].includes(source)
      ? `app.source.${source}`
      : "app.source.manual"
  ) as CopyKey
}
