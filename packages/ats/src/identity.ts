import { extractAtsKey } from "@newrole/matching/dedupe"
import { resolveJobCountries, type JobCountries } from "./countries"
import { safeCanonicalUrl } from "./dedupe"
import type { ListedJob } from "./schemas"
import { APP_TO_SOURCE } from "./sources"

/**
 * The rules that make one offer one row, wherever it is stored: an index of crawled offers
 * (@newrole/job-index) and an app that keeps the offers a person added by link use the same key,
 * so the two never hold the same posting twice.
 */

/** Where an offer is, from the ATS's own fields and its location text. */
export function placeOf(job: ListedJob): JobCountries {
  return resolveJobCountries({
    locationText: job.locationText,
    workplaceType: job.workplaceType,
    structured: job.countryCodes,
  })
}

/** The Job columns that say where an offer is. */
export function countryFields(place: JobCountries) {
  return {
    countries: place.countries,
    countryCode: place.countries[0] ?? null,
    remoteRegions: place.remoteRegions,
    countrySource: place.source,
  }
}

/** The ATS's own id where it has one ("greenhouse:acme:123"), else the canonical URL. */
export function identityFor(job: ListedJob): string {
  const canonical = safeCanonicalUrl(job.originalUrl)
  const source = APP_TO_SOURCE[job.sourceType] ?? "company_site"
  const key = extractAtsKey(canonical, source, job.externalId, job.sourceBoardId)
  const company = (job.companyName || "").trim().toLowerCase()
  const board = (job.sourceBoardId || "").toLowerCase()
  const named = [`${source}:${company}`, `${source}:${board}:${company}`]
  if (key && company && named.includes(key.toLowerCase())) return `url:${canonical}`
  return key ?? `url:${canonical}`
}
