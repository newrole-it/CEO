import { z } from "zod"
import { salaryCurrencies, seniorityValues } from "@newrole/profile/schema"

/** The longest list item, as the profile's longest (homeCity, locations: packages/profile/src/schema.ts). */
export const FILTER_ITEM_MAX = 80
/** The highest minimum pay, as the profile's salaryFloor. */
export const PAY_MAX = 10_000_000

const item = z.string().trim().min(1).max(FILTER_ITEM_MAX)

/**
 * The filters of an offer search: proposed from the profile, edited by the person, sent to the web
 * search. Bounded like the profile (packages/profile/src/schema.ts), since "Also save to my
 * profile" writes the pay, the places and the rest of its fields there.
 */
export const SearchFilters = z.object({
  roles: z.array(item).max(5),
  level: z.enum(seniorityValues).nullable(),
  skills: z.array(item).max(12),
  excluded: z.array(item).max(12),
  places: z.array(item).max(6),
  relocation: z.boolean(),
  workMode: z.enum(["remote", "hybrid", "onsite", "any"]),
  minPay: z.object({
    amount: z.number().min(0).max(PAY_MAX).nullable(),
    currency: z.enum(salaryCurrencies).nullable(),
    period: z.enum(["month", "year"]),
    contract: z.enum(["uop", "b2b"]).nullable(),
  }),
  contracts: z.array(item).max(6),
  industries: z.array(item).max(6),
  industryMode: z.enum(["stick", "prefer", "any"]),
  languages: z.array(item).max(4),
  freshnessDays: z.union([z.literal(7), z.literal(14), z.literal(30)]),
})
export type SearchFilters = z.infer<typeof SearchFilters>

const trimmed = (list: string[]) => list.map((item) => item.trim())

/** True when a profile-backed field differs: level, pay, work mode, places (ordered, trimmed) or relocation. */
export function filtersDiffer(a: SearchFilters, b: SearchFilters): boolean {
  const places = trimmed(a.places)
  const otherPlaces = trimmed(b.places)
  return (
    a.level !== b.level ||
    a.minPay.amount !== b.minPay.amount ||
    a.minPay.currency !== b.minPay.currency ||
    a.minPay.period !== b.minPay.period ||
    a.minPay.contract !== b.minPay.contract ||
    a.workMode !== b.workMode ||
    a.relocation !== b.relocation ||
    places.length !== otherPlaces.length ||
    places.some((place, i) => place !== otherPlaces[i])
  )
}
