import type { AnswerBankStats } from "src/server/answers/service"
import type { AnswerView } from "src/server/answers/types"
import { intlLocale, pluralKind, type CopyKey, type Locale, type T } from "src/app/i18n/copy"

/** An answer as the client keeps it: dates as ISO strings, safe to pass from the server page. */
export type AnswerRow = Omit<AnswerView, "lastUsedAt" | "createdAt" | "updatedAt"> & {
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export type { AnswerBankStats }

export function toRow(view: AnswerView): AnswerRow {
  return {
    ...view,
    lastUsedAt: view.lastUsedAt ? new Date(view.lastUsedAt).toISOString() : null,
    createdAt: new Date(view.createdAt).toISOString(),
    updatedAt: new Date(view.updatedAt).toISOString(),
  }
}

/** t("ans.count.{one,few,many}", { n }) with the right Polish plural. */
export function plural(t: T, locale: Locale, stem: string, n: number): string {
  return t(`${stem}.${pluralKind(n, locale)}` as CopyKey, { n })
}

export function shortDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}
