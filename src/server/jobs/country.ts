/**
 * The country a search covers when nobody picked one: offers are global, a search is local.
 * The profile's city or locations first, then the browser's region, else every country.
 */
import db from "db"
import { normalizeLocation } from "matching/normalization"
import { COUNTRY_CODES } from "matching/places"
import { asStringList } from "src/server/profile/schema"
import { languagesFromHeader } from "@newrole/app-kit/languages"

const KNOWN = new Set(COUNTRY_CODES)

export function profileCountry(
  profile: { homeCity: string | null; locations: unknown } | null
): string | null {
  if (!profile) return null
  for (const place of [profile.homeCity, ...asStringList(profile.locations)]) {
    if (!place) continue
    const code = normalizeLocation(place).countries[0]
    if (code && KNOWN.has(code)) return code
  }
  return null
}

/**
 * The region of the browser's first language ("pl-PL", "en-US"). A bare "pl" is Poland: Polish is
 * the language of one country. Other bare languages ("en", "de") name no country.
 */
export function countryFromAcceptLanguage(header: string | null | undefined): string | null {
  const first = languagesFromHeader(header)[0]
  if (!first) return null
  const [language, ...rest] = first.split("-")
  const region = rest.find((part) => /^[a-z]{2}$/i.test(part))?.toUpperCase()
  if (region && KNOWN.has(region)) return region
  return language.toLowerCase() === "pl" ? "PL" : null
}

export async function defaultCountry(
  userId: number | null,
  acceptLanguage?: string | null
): Promise<string | null> {
  if (userId) {
    const profile = await db.candidateProfile.findUnique({
      where: { userId },
      select: { homeCity: true, locations: true },
    })
    const fromProfile = profileCountry(profile)
    if (fromProfile) return fromProfile
  }
  return countryFromAcceptLanguage(acceptLanguage)
}
