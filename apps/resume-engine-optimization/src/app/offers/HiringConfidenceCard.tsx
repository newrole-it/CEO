"use client"

import { useId } from "react"
import { intlLocale, pluralKind, type CopyKey, type Locale, type T } from "src/app/i18n/copy"
import { useCopy } from "src/app/i18n/Locale"
import { Badge } from "@newrole/ui/primitives"
import type { HiringConfidence, HiringLevel, HiringSignal } from "src/shared/hiring-confidence"

const LEVEL = {
  high: "hc.level.high",
  medium: "hc.level.medium",
  low: "hc.level.low",
} as const satisfies Record<HiringLevel, CopyKey>

const TONE = { high: "success", medium: "plain", low: "warning" } as const

function signalText(signal: HiringSignal, t: T, locale: Locale): string {
  const n = signal.n ?? 0
  switch (signal.code) {
    case "age":
      return n === 0 ? t("hc.s.age.today") : t(`hc.s.age.${pluralKind(n, locale)}`, { n })
    case "seen":
      return t(`hc.s.seen.${pluralKind(n, locale)}`, { n })
    case "evergreen":
      return t(`hc.s.evergreen.${pluralKind(n, locale)}`, { n })
    default:
      return t(`hc.s.${signal.code}`)
  }
}

/** The offer's hiring confidence with every sign it rests on (src/shared/hiring-confidence.ts). */
export function HiringConfidenceCard({ hiring }: { hiring: HiringConfidence }) {
  const { t, locale } = useCopy()
  const id = useId()
  const signed = new Intl.NumberFormat(intlLocale(locale), { signDisplay: "exceptZero" })
  return (
    <section className="card card--pad offer-section" aria-labelledby={`${id}-hiring`}>
      <div className="offer-section__head">
        <h2 id={`${id}-hiring`} className="t-h3">
          {t("hc.title")}
        </h2>
        <Badge tone={TONE[hiring.level]}>{t(LEVEL[hiring.level])}</Badge>
      </div>
      <p className="hiring-score">{t("hc.score", { n: hiring.score })}</p>
      {hiring.level === "low" ? <p className="t-sm">{t("hc.low.hint")}</p> : null}
      <ul className="hiring-signals" aria-label={t("hc.signals")}>
        {hiring.signals.map((signal) => (
          <li key={signal.code}>
            <span>{signalText(signal, t, locale)}</span>
            {signal.points ? (
              <span className="hiring-signals__points">
                {t("hc.points", { points: signed.format(signal.points) })}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="t-caption muted">{t("hc.note")}</p>
    </section>
  )
}
