import { intlLocale, type CopyKey, type Locale, type T } from "src/app/i18n/copy"
import type { OfferView } from "src/shared/offer-view"

import { relativeTime } from "@newrole/ui/time"

export { relativeTime }

const DAY = 86_400_000

function k(n: number): string {
  const value = n / 1000
  if (value >= 10) return String(Math.round(value))
  return String(Math.round(value * 10) / 10).replace(".", ",")
}

export function payRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  const lo = min ?? max!
  const hi = max ?? min!
  return k(lo) === k(hi) ? k(lo) : `${k(lo)}–${k(hi)}`
}

/** "25–30 tys. zł / mies." with "≈" when converted, plus the tooltip text. */
export function payInfo(
  offer: Pick<
    OfferView,
    | "payListed"
    | "payConverted"
    | "payMin"
    | "payMax"
    | "payNote"
    | "payCurrency"
    | "payFromOther"
    | "paySourceUrl"
  >,
  t: T
): { text: string; none: boolean; approx: boolean; tip: string | null } {
  if (offer.payListed && offer.payConverted) {
    const range = payRange(offer.payMin, offer.payMax)
    if (range) {
      const approx = Boolean(offer.payNote)
      return {
        text: `${approx ? "≈ " : ""}${t("pay.month", { range })}`,
        none: false,
        approx,
        tip: offer.payNote ? t(`pay.note.${offer.payNote}` as CopyKey) : null,
      }
    }
  }
  if (offer.payListed && !offer.payConverted) {
    return {
      text: t("pay.foreign", { cur: offer.payCurrency || "?" }),
      none: true,
      approx: false,
      tip: null,
    }
  }
  return { text: t("pay.none"), none: true, approx: false, tip: null }
}

/** A country's name in the interface language ("PL" → "Polska" / "Poland"). */
export function countryLabel(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames(locale, { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}

export function placeText(
  offer: Pick<OfferView, "city" | "inPoland" | "workMode" | "countryCode">,
  t: T,
  locale: Locale
): string {
  if (offer.city) return offer.city
  if (offer.countryCode) {
    const country = countryLabel(offer.countryCode, locale)
    return offer.workMode === "remote" ? t("loc.remoteIn", { country }) : country
  }
  return offer.workMode === "remote" ? t("mode.remote") : t("loc.unknown")
}

/** "Nowa" for < 48 h, else "3 dni temu"; `title` is the absolute date. */
export function freshness(
  iso: string | null | undefined,
  t: T,
  locale: Locale,
  now = Date.now()
): { isNew: boolean; label: string; title: string; old: boolean } | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const age = now - at.getTime()
  const title = at.toLocaleDateString(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  if (age < 2 * DAY) return { isNew: true, label: t("card.new"), title, old: false }
  return { isNew: false, label: relativeTime(iso, t, now) ?? "", title, old: age > 30 * DAY }
}

/**
 * The age the employer's own posting date gives. Days up to a month, then months, then "over a
 * year" with `stale` set, so a years-old opening that is still listed is visible as one.
 */
export function postedAge(
  iso: string | null | undefined,
  t: T,
  now = Date.now()
): { label: string; days: number; stale: boolean } | null {
  if (!iso) return null
  const at = new Date(iso).getTime()
  if (!Number.isFinite(at)) return null
  const days = Math.max(0, Math.floor((now - at) / DAY))
  if (days > 365)
    return { label: t("card.posted", { when: t("card.postedYear") }), days, stale: true }
  if (days > 30) {
    const months = Math.floor(days / 30)
    return {
      label: t("card.posted", { when: t("card.postedMonths", { n: months }) }),
      days,
      stale: false,
    }
  }
  return { label: t("card.posted", { when: relativeTime(iso, t, now) ?? "" }), days, stale: false }
}

export function shortDate(iso: string | null | undefined, locale: Locale): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return at.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short" })
}
