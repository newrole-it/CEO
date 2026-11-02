/** Feed filter state ↔ URL. Shared by the server page and client components (no server imports). */
import type { FeedTab } from "./types"

export type Level = "junior" | "mid" | "senior" | "lead" | "head"
export const LEVELS: Level[] = ["junior", "mid", "senior", "lead", "head"]

export type FeedFilters = {
  q: string
  /** "" follows the person's country (profile, else browser); "any" is every country; else ISO. */
  country: string
  city: string
  mode: "any" | "remote" | "hybrid" | "onsite"
  pay: number | null
  levels: Level[]
  companyOnly: boolean
  payOnly: boolean
  fresh: boolean
  sort: "fit" | "new"
  company: string
}

type Params = Record<string, string | string[] | undefined>
const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? ""

export function parseFilters(params: Params): FeedFilters {
  const where = one(params.where)
  const country = one(params.country).trim()
  const mode = one(params.mode)
  const pay = Number(one(params.pay))
  return {
    q: one(params.q).slice(0, 160),
    // Old links: where=pl is Poland, where=abroad was "not Poland" and now means every country.
    country: /^[a-z]{2}$/i.test(country)
      ? country.toUpperCase()
      : country === "any" || where === "abroad" || where === "any"
      ? "any"
      : where === "pl"
      ? "PL"
      : "",
    city: one(params.city).slice(0, 80),
    mode: mode === "remote" || mode === "hybrid" || mode === "onsite" ? mode : "any",
    pay: Number.isFinite(pay) && pay > 0 ? Math.round(pay) : null,
    levels: one(params.seniority)
      .split(",")
      .filter((value): value is Level => (LEVELS as string[]).includes(value)),
    companyOnly: one(params.source) === "company",
    payOnly: one(params.payonly) === "1",
    fresh: Boolean(one(params.fresh)),
    sort: one(params.sort) === "new" ? "new" : "fit",
    company: one(params.company).slice(0, 64),
  }
}

/** URL for a filter set (keeps the tab). */
export function filtersQuery(
  filters: FeedFilters,
  tab: FeedTab,
  extra: Record<string, string> = {}
): string {
  const params = new URLSearchParams()
  if (tab === "all") params.set("tab", "all")
  if (filters.q) params.set("q", filters.q)
  if (filters.country) params.set("country", filters.country)
  if (filters.city) params.set("city", filters.city)
  if (filters.mode !== "any") params.set("mode", filters.mode)
  if (filters.pay) params.set("pay", String(filters.pay))
  if (filters.levels.length) params.set("seniority", filters.levels.join(","))
  if (filters.companyOnly) params.set("source", "company")
  if (filters.payOnly) params.set("payonly", "1")
  if (filters.fresh) params.set("fresh", "7")
  if (filters.sort === "new") params.set("sort", "new")
  if (filters.company) params.set("company", filters.company)
  for (const [key, value] of Object.entries(extra)) params.set(key, value)
  const query = params.toString()
  return query ? `/jobs?${query}` : "/jobs"
}

export function hasActiveFilters(filters: FeedFilters): boolean {
  return Boolean(
    filters.q ||
      Boolean(filters.country) ||
      filters.city ||
      filters.mode !== "any" ||
      filters.pay ||
      filters.levels.length ||
      filters.companyOnly ||
      filters.payOnly ||
      filters.fresh ||
      filters.company
  )
}
