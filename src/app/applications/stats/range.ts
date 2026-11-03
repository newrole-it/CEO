/** The `?w=` range of the stats page, in weeks. Kept out of the "use client" screen so the server page can parse it too. */
export type RangeKey = "4" | "12" | "26" | "52" | "all"
export const RANGES: RangeKey[] = ["4", "12", "26", "52", "all"]
export const DEFAULT_RANGE: RangeKey = "12"

export function parseRange(value: string | undefined): RangeKey {
  return (RANGES as string[]).includes(value ?? "") ? (value as RangeKey) : DEFAULT_RANGE
}
