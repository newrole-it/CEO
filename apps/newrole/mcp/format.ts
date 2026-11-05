import type { OfferCard } from "./jobs"

/** Compact text the model reads. Structured content carries the full data. */

const MODES: Record<string, string> = {
  remote: "zdalnie",
  hybrid: "hybrydowo",
  onsite: "stacjonarnie",
}

export function offerLine(offer: OfferCard, index?: number): string {
  const head = [
    index != null ? `${index + 1}.` : null,
    offer.score != null ? `[${offer.score}]` : null,
    `${offer.title} · ${offer.company}`,
  ]
    .filter(Boolean)
    .join(" ")
  const facts = [
    offer.location,
    MODES[offer.workMode] ?? null,
    offer.salary ? `${offer.salary}/mies.` : null,
    offer.source ?? null,
    offer.firstSeen ? `od ${offer.firstSeen}` : null,
  ].filter(Boolean)
  const lines = [head, `   ${facts.join(" · ") || "brak szczegółów"} · id ${offer.id}`]
  if (offer.reasons?.length) lines.push(`   + ${offer.reasons.slice(0, 3).join(" ")}`)
  if (offer.warnings?.length) lines.push(`   − ${offer.warnings.slice(0, 2).join(" ")}`)
  lines.push(`   ${offer.url}`)
  return lines.join("\n")
}

export function offerList(title: string, offers: OfferCard[], empty: string): string {
  if (!offers.length) return `${title}\n${empty}`
  return [title, ...offers.map(offerLine)].join("\n")
}

export function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!value || !Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(max, Math.floor(value)))
}

export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

/** Bullet list of key: value, skipping empty values. */
export function facts(entries: [string, unknown][]): string {
  return entries
    .filter(
      ([, value]) => value != null && value !== "" && !(Array.isArray(value) && !value.length)
    )
    .map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join("\n")
}
