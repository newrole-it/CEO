import { afterEach, describe, expect, it } from "vitest"
import {
  extraPlace,
  blockedCountries,
  boardCountry,
  parseCountryList,
  resolveJobCountries,
  toCountryCode,
  withBoardCountry,
} from "./countries"

const saved = process.env.BLOCKED_COUNTRIES

afterEach(() => {
  if (saved == null) delete process.env.BLOCKED_COUNTRIES
  else process.env.BLOCKED_COUNTRIES = saved
})

describe("blocked countries", () => {
  it("blocks Russia and Belarus when the variable is unset", () => {
    delete process.env.BLOCKED_COUNTRIES
    expect([...blockedCountries()].sort()).toEqual(["BY", "RU"])
  })

  it("reads the list from the environment, and an empty value blocks nothing", () => {
    expect([...parseCountryList("ru, by;IR  kp xx1")].sort()).toEqual(["BY", "IR", "KP", "RU"])
    process.env.BLOCKED_COUNTRIES = ""
    expect(blockedCountries().size).toBe(0)
  })
})

describe("job countries", () => {
  it("reads ISO codes and names from ATS fields", () => {
    expect(toCountryCode("us")).toBe("US")
    expect(toCountryCode("United States")).toBe("US")
    expect(toCountryCode("Polska")).toBe("PL")
    expect(toCountryCode("MOS1")).toBeNull()
  })

  it("puts the ATS's own country first and marks where it came from", () => {
    const place = resolveJobCountries({ locationText: "Warszawa", structured: ["DE"] })
    expect(place.countries).toEqual(["DE", "PL"])
    expect(place.source).toBe("structured")
    const text = resolveJobCountries({ locationText: "Kraków, Poland" })
    expect(text.countries).toEqual(["PL"])
    expect(text.source).toBe("location")
  })

  it("drops blocked countries and remembers that the offer named one", () => {
    delete process.env.BLOCKED_COUNTRIES
    const place = resolveJobCountries({ locationText: "Moscow, Russia", structured: ["RU"] })
    expect(place.countries).toEqual([])
    expect(place.blocked).toEqual(["RU"])
    expect(withBoardCountry(place, "DE").countries).toEqual([])
  })

  it("lends a one-country board's country to offers that name none", () => {
    const placed = resolveJobCountries({ locationText: "Austin, Texas, United States" })
    const bare = resolveJobCountries({ locationText: "MOS1" })
    expect(boardCountry([placed, bare])).toBe("US")
    const lent = withBoardCountry(bare, "US")
    expect(lent.countries).toEqual(["US"])
    expect(lent.source).toBe("board")
    const second = resolveJobCountries({ locationText: "Berlin, Germany" })
    expect(boardCountry([placed, second, bare])).toBeNull()
  })
})

describe("places the location parser misses", () => {
  it("reads a code prefix, a large city, and region words", () => {
    expect(extraPlace("US-CA-Menlo Park").countries).toEqual(["US"])
    expect(extraPlace("Gurugram").countries).toEqual(["IN"])
    expect(extraPlace("Remote, U.S.").countries).toEqual(["US"])
    expect(extraPlace("Home based - EMEA").regions).toEqual(["EMEA"])
    expect(extraPlace("Remote, AMER").regions).toEqual(["AMERICAS"])
    expect(extraPlace("Hybrid")).toEqual({ countries: [], regions: [] })
  })

  it("leaves a city name two countries share unplaced", () => {
    expect(extraPlace("Valencia").countries).toEqual([])
  })
})
