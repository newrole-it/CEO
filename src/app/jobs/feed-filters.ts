/** Feed filter state ↔ URL. Shared by the server page and client components (no server imports). */
import { cleanTags } from "src/shared/title-tags"
import type { FeedTab } from "./types"

export type Level = "junior" | "mid" | "senior" | "lead" | "head"
export const LEVELS: Level[] = ["junior", "mid", "senior", "lead", "head"]

export type FeedFilters = {
  /** Title tags, one `q` each in the URL; an offer matching any one is shown. */
  tags: string[]
  /** "" follows the person's country (profile, else browser); "any" is every country; else ISO. */
  country: string
  /** With a country: leave out remote offers the employer tied to another one. */
  remoteHere: boolean
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
const all = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value : value ? [value] : []

export function parseFilters(params: Params): FeedFilters {
  const where = one(params.where)
  const country = one(params.country).trim()
  const mode = one(params.mode)
  const pay = Number(one(params.pay))
  return {
    tags: cleanTags(all(params.q)),
    // Old links: where=pl is Poland, where=abroad was "not Poland" and now means every country.
    country: /^[a-z]{2}$/i.test(country)
      ? country.toUpperCase()
      : country === "any" || where === "abroad" || where === "any"
      ? "any"
      : where === "pl"
      ? "PL"
      : "",
    remoteHere: one(params.remotehere) === "1",
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
  for (const tag of filters.tags) params.append("q", tag)
  if (filters.country) params.set("country", filters.country)
  if (filters.remoteHere) params.set("remotehere", "1")
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

/**
 * The country "" means when nobody picked one: the person's own, else every country. Clearing the
 * place has to say "any" when there is an own country, or the list goes straight back to it.
 */
export function noCountry(ownCountry: string | null): string {
  return ownCountry ? "any" : ""
}

/** Every filter off, the default country included; the sort stays. */
export function clearedFilters(filters: FeedFilters, ownCountry: string | null): FeedFilters {
  return {
    ...filters,
    tags: [],
    country: noCountry(ownCountry),
    remoteHere: false,
    city: "",
    mode: "any",
    pay: null,
    levels: [],
    companyOnly: false,
    payOnly: false,
    fresh: false,
    company: "",
  }
}

/** Whether anything narrows the list. `country` is the one the list covers, a default included. */
export function hasActiveFilters(filters: FeedFilters, country: string | null): boolean {
  return Boolean(
    filters.tags.length ||
      country ||
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
