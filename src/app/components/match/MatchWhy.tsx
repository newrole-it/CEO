"use client"

import { useCopy } from "src/app/i18n/Locale"

export type FitLine = { kind: "ok" | "warn"; text: string }

function Mark({ kind }: { kind: "ok" | "warn" }) {
  if (kind === "ok") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M4.5 8.2 7 10.5 11.5 5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 8h9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function MatchWhy({
  mode,
  lines,
  reason,
  max = 3,
}: {
  mode: "you" | "phrase"
  lines?: FitLine[]
  reason?: string | null
  max?: number
}) {
  const { t } = useCopy()
  const shown = (lines ?? []).filter((line) => line.text.trim()).slice(0, max)
  if (mode === "you" && !shown.length) return null
  if (mode === "phrase" && !reason) return null
  return (
    <div className="why">
      <p className="why-h">{mode === "you" ? t("whyFitsYou") : t("whyThisOffer")}</p>
      {mode === "you" ? (
        <ul className="why-list">
          {shown.map((line) => (
            <li key={line.text} className={line.kind === "ok" ? "why-ok" : "why-warn"}>
              <Mark kind={line.kind} />
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="reason">{reason}</p>
      )}
    </div>
  )
}
