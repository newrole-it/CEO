import type { SourceType } from "../schemas"

/**
 * Slugs that answered HTTP 200 for the wrong company on 2026-10-10.
 * Source pack §4. Never treat these as the company the slug looks like.
 */
export const BLOCKED_SLUGS: Record<string, readonly string[]> = {
  GREENHOUSE: ["wise", "remote", "relativity", "cleo", "traderepublic"],
  ASHBY: ["ramp", "kiwi", "flink", "lunar", "neon"],
  LEVER: ["neon"],
  WORKABLE: ["1password", "scalable", "11bitstudios", "1komma5", "1komma5grad"],
  SMARTRECRUITERS: [],
}

const GENERIC_WORKABLE_NAMES = new Set(["workable", "james reynolds", "the scalable company"])

export function isBlockedSlug(provider: SourceType | string, slug: string): boolean {
  const list = BLOCKED_SLUGS[provider] ?? []
  return list.includes(slug.trim().toLowerCase())
}

export function compactName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

/** True when both names are present and clearly the same company. Missing names do not match. */
export function namesAgree(expected: string | undefined, actual: string | undefined): boolean {
  if (!expected || !actual) return false
  const left = compactName(expected)
  const right = compactName(actual)
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

export function isGenericWorkableName(name: string | undefined): boolean {
  if (!name) return true
  return GENERIC_WORKABLE_NAMES.has(name.trim().toLowerCase())
}
