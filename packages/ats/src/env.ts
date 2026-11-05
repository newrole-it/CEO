/**
 * A non-negative integer from the environment. Unset, blank, non-numeric, or negative
 * values fall back, so a typo in .env never turns a cap into zero or infinity.
 */
export function envCount(
  name: string,
  fallback: number,
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env[name]
  if (raw == null || raw.trim() === "") return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.floor(parsed)
}
