/** Compact text the model reads. Structured content carries the full data. */

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
