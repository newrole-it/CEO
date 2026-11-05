import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "@newrole/matching/config"
import {
  DAYS_PER_MONTH,
  HOURS_PER_MONTH,
  MONTHS_PER_YEAR,
  PLN_PER_UNIT,
  canonicalCity,
  citiesFrom,
  descriptionExcerpt,
  monthlyBasePln,
  offerMatches,
  placeFacts,
  requirementExcerpt,
} from "./offer-facts"

describe("monthly base PLN", () => {
  it("keeps a monthly PLN amount and does not invent a second figure", () => {
    const pay = monthlyBasePln({ salaryMin: 18_000, salaryMax: 22_000, salaryCurrency: "PLN" })
    expect(pay).toMatchObject({
      listed: true,
      converted: true,
      min: 18_000,
      max: 22_000,
      note: null,
    })
  })

  it("divides a yearly amount by 12 and converts EUR and USD", () => {
    const eur = monthlyBasePln({
      salaryMin: 120_000,
      salaryMax: 120_000,
      salaryCurrency: "EUR/year",
    })
    const usd = monthlyBasePln({ salaryMin: 120_000, salaryMax: null, salaryCurrency: "USD/year" })
    expect(eur).toMatchObject({
      min: Math.round((120_000 / MONTHS_PER_YEAR) * PLN_PER_UNIT.EUR),
      max: Math.round((120_000 / MONTHS_PER_YEAR) * PLN_PER_UNIT.EUR),
      note: "year",
    })
    expect(usd).toMatchObject({
      min: Math.round((120_000 / MONTHS_PER_YEAR) * PLN_PER_UNIT.USD),
      max: Math.round((120_000 / MONTHS_PER_YEAR) * PLN_PER_UNIT.USD),
      note: "year",
    })
  })

  it("turns an hourly rate into a month at 168 hours", () => {
    const pay = monthlyBasePln({ salaryMin: 100, salaryMax: 100, salaryCurrency: "PLN/hour" })
    expect(HOURS_PER_MONTH).toBe(168)
    expect(pay).toMatchObject({ min: 100 * 168, max: 100 * 168, note: "hour" })
  })

  it("converts hourly USD with the same hour assumption and the USD rate", () => {
    const pay = monthlyBasePln({ salaryMin: 50, salaryMax: 50, salaryCurrency: "USD/hour" })
    expect(pay).toMatchObject({
      min: Math.round(50 * HOURS_PER_MONTH * PLN_PER_UNIT.USD),
      note: "hour",
    })
  })

  it("uses 21 days for a daily rate", () => {
    const pay = monthlyBasePln({ salaryMin: 800, salaryMax: 800, salaryCurrency: "PLN/day" })
    expect(pay).toMatchObject({ min: 800 * 21, note: "day" })
  })

  it("labels a guessed period instead of pretending the offer stated it", () => {
    const yearly = monthlyBasePln({ salaryMin: 180_000, salaryMax: 180_000, salaryCurrency: "PLN" })
    const hourly = monthlyBasePln({ salaryMin: 80, salaryMax: 80, salaryCurrency: "PLN" })
    expect(yearly).toMatchObject({ min: 15_000, note: "assumed-year" })
    expect(hourly).toMatchObject({ min: 80 * 168, note: "assumed-hour" })
  })

  it("stays empty when pay is missing and refuses an unknown currency", () => {
    expect(monthlyBasePln({ salaryMin: null, salaryMax: null, salaryCurrency: null })).toEqual({
      listed: false,
    })
    expect(monthlyBasePln({ salaryMin: 10_000, salaryMax: null, salaryCurrency: "SEK" })).toEqual({
      listed: true,
      converted: false,
      currency: "SEK",
    })
    expect(
      monthlyBasePln({ salaryMin: 4_000_000, salaryMax: 4_000_000, salaryCurrency: "USD/year" })
    ).toEqual({
      listed: true,
      converted: false,
      currency: "USD",
    })
  })

  it("uses the same FX table and hour assumption as the matching config", () => {
    expect(PLN_PER_UNIT).toEqual({ PLN: 1, EUR: 4.3, USD: 3.95, GBP: 5, CHF: 4.55 })
    expect(PLN_PER_UNIT).toEqual(DEFAULT_CONFIG.fx.toPln)
    expect(HOURS_PER_MONTH).toBe(168)
    expect(DAYS_PER_MONTH).toBe(21)
    expect(MONTHS_PER_YEAR).toBe(12)
    expect(HOURS_PER_MONTH).toBe(DEFAULT_CONFIG.hoursPerMonth)
  })
})

describe("place facts", () => {
  it("reads a Polish city and does not assume on-site", () => {
    expect(
      placeFacts({ locationText: "Kraków", countryCode: null, workplaceType: "UNKNOWN" })
    ).toMatchObject({
      inPoland: true,
      city: "Kraków",
      countryCode: "PL",
      workMode: "unknown",
    })
  })

  it("keeps Poland, the city, and hybrid when both are stated", () => {
    expect(
      placeFacts({ locationText: "Warsaw, Poland", countryCode: null, workplaceType: "HYBRID" })
    ).toMatchObject({ inPoland: true, city: "Warszawa", countryCode: "PL", workMode: "hybrid" })
  })

  it("marks a foreign city as abroad and leaves the work mode unknown", () => {
    expect(
      placeFacts({ locationText: "Berlin", countryCode: null, workplaceType: null })
    ).toMatchObject({
      inPoland: false,
      city: "Berlin",
      countryCode: "DE",
      workMode: "unknown",
    })
  })

  it("stays unknown when the offer says nothing", () => {
    expect(
      placeFacts({ locationText: "", countryCode: null, workplaceType: "UNKNOWN" })
    ).toMatchObject({
      inPoland: null,
      city: null,
      countryCode: null,
      workMode: "unknown",
    })
  })

  it("shows remote without guessing Poland", () => {
    expect(
      placeFacts({ locationText: "Remote", countryCode: null, workplaceType: "REMOTE" })
    ).toMatchObject({
      inPoland: null,
      city: null,
      countryCode: null,
      workMode: "remote",
    })
  })

  it("shows remote in Poland when the country is stated", () => {
    expect(
      placeFacts({ locationText: "Remote, Poland", countryCode: null, workplaceType: "UNKNOWN" })
    ).toMatchObject({ inPoland: true, city: null, workMode: "remote" })
  })
})

describe("offer filters and requirements", () => {
  const warsaw = placeFacts({
    locationText: "Warszawa",
    countryCode: "PL",
    workplaceType: "REMOTE",
  })
  const paid = monthlyBasePln({ salaryMin: 20_000, salaryMax: 24_000, salaryCurrency: "PLN" })

  it("keeps an offer whose monthly maximum reaches 30000 even when the minimum is lower", () => {
    const pay = monthlyBasePln({ salaryMin: 22_500, salaryMax: 34_500, salaryCurrency: "PLN" })
    expect(pay).toMatchObject({
      listed: true,
      converted: true,
      min: 22_500,
      max: 34_500,
      period: "month",
    })
    const place = placeFacts({
      locationText: "Warszawa",
      countryCode: "PL",
      workplaceType: "HYBRID",
    })
    expect(
      offerMatches(place, pay, { country: null, city: "", mode: "any", minMonthlyPln: 30_000 })
    ).toBe(true)
    expect(
      offerMatches(place, pay, { country: null, city: "", mode: "any", minMonthlyPln: 34_501 })
    ).toBe(false)
  })

  it("filters a country, city, work mode, and a monthly minimum", () => {
    expect(
      offerMatches(warsaw, paid, {
        country: "PL",
        city: "Warszawa",
        mode: "remote",
        minMonthlyPln: 18_000,
      })
    ).toBe(true)
    expect(offerMatches(warsaw, paid, { country: "DE", city: "", mode: "any" })).toBe(false)
    expect(
      offerMatches(
        warsaw,
        { listed: false },
        { country: null, city: "", mode: "any", minMonthlyPln: 10_000 }
      )
    ).toBe(false)
  })

  it("keeps offers in the country and remote offers open to it", () => {
    const at = (locationText: string, workplaceType = "UNKNOWN") =>
      placeFacts({ locationText, countryCode: null, workplaceType })
    const inCountry = (locationText: string, country: string, workplaceType?: string) =>
      offerMatches(
        at(locationText, workplaceType),
        { listed: false },
        { country, city: "", mode: "any" }
      )
    expect(inCountry("Kraków", "PL")).toBe(true)
    expect(inCountry("London, United Kingdom", "PL")).toBe(false)
    expect(inCountry("Toronto, Ontario, Canada", "CA")).toBe(true)
    expect(inCountry("Salt Lake City, UT", "US")).toBe(true)
    expect(inCountry("Remote - EMEA", "PL")).toBe(true)
    expect(inCountry("Remote - EMEA", "US")).toBe(false)
    expect(inCountry("Remote, Nigeria", "PL")).toBe(false)
    expect(inCountry("Remote", "US", "REMOTE")).toBe(true)
    expect(inCountry("Anywhere", "JP", "REMOTE")).toBe(true)
  })

  it("with remoteHere, keeps a remote offer stored with another country in that country", () => {
    // Headway on Ashby, 2026-11-03: location "Remote", addressCountry "United States".
    const stored = (countries: string[], locationText = "Remote", remoteRegions: string[] = []) =>
      placeFacts({
        locationText,
        countryCode: countries[0] ?? null,
        countries,
        remoteRegions,
        workplaceType: "REMOTE",
      })
    const inPoland = (place: ReturnType<typeof placeFacts>, remoteHere: boolean) =>
      offerMatches(place, { listed: false }, { country: "PL", city: "", mode: "any", remoteHere })
    expect(inPoland(stored(["US"]), false)).toBe(true)
    expect(inPoland(stored(["US"]), true)).toBe(false)
    // no country anywhere: still open to every country
    expect(inPoland(stored([]), true)).toBe(true)
    // a region that covers Poland, in the text or stored at ingest
    expect(inPoland(stored(["GB"], "Remote - EMEA"), true)).toBe(true)
    expect(inPoland(stored(["GB"], "Remote", ["EMEA"]), true)).toBe(true)
    expect(inPoland(stored(["US", "PL"]), true)).toBe(true)
  })

  it("canonicalises city aliases and counts cities from messy text", () => {
    expect(canonicalCity("cracow")).toBe("Kraków")
    expect(
      citiesFrom([
        { locationText: "Krakow", countryCode: null, workplaceType: "UNKNOWN" },
        { locationText: "Kraków, hybrid", countryCode: null, workplaceType: "HYBRID" },
        { locationText: "Remote", countryCode: null, workplaceType: "REMOTE" },
      ])
    ).toEqual([{ city: "Kraków", count: 2 }])
  })

  it("keeps a few requirements and leaves a prose blob alone", () => {
    expect(
      requirementExcerpt(
        "We build tools. Requirements: 5 years of Go; Kubernetes; Polish or English. Benefits: fruit"
      )
    ).toEqual(["5 years of Go", "Kubernetes", "Polish or English"])
    expect(requirementExcerpt("A short paragraph about the team and the product.")).toEqual([])
    expect(descriptionExcerpt("Short description.")).toBe("Short description.")
    expect(
      descriptionExcerpt("This is a long sentence without a stop ".repeat(10)).endsWith("…")
    ).toBe(true)
  })
})
