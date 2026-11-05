import type { Translate } from "./i18n"

const DAY = 86_400_000

type TimeKey =
  | "common.justNow"
  | "common.minutesAgo"
  | "common.hoursAgo"
  | "common.yesterday"
  | "common.over30"
  | "common.daysAgo"

/** "przed chwilą", "3 h temu", "wczoraj", "5 dni temu", "> 30 dni"; null for no date. */
export function relativeTime(
  iso: string | Date | null | undefined,
  t: Translate<TimeKey>,
  now = Date.now()
): string | null {
  if (!iso) return null
  const at = new Date(iso).getTime()
  if (!Number.isFinite(at)) return null
  const diff = Math.max(0, now - at)
  if (diff < 60_000) return t("common.justNow")
  if (diff < 3_600_000) return t("common.minutesAgo", { n: Math.floor(diff / 60_000) })
  if (diff < DAY) return t("common.hoursAgo", { n: Math.floor(diff / 3_600_000) })
  const days = Math.floor(diff / DAY)
  if (days === 1) return t("common.yesterday")
  if (days > 30) return t("common.over30")
  return t("common.daysAgo", { n: days })
}
