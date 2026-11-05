import { describe, expect, it } from "vitest"
import { countryFromAcceptLanguage, profileCountry } from "./country"

describe("default search country", () => {
  it("comes from the profile's city or locations", () => {
    expect(profileCountry({ homeCity: "Warszawa", locations: [] })).toBe("PL")
    expect(profileCountry({ homeCity: null, locations: ["Remote", "Toronto, Ontario"] })).toBe("CA")
    expect(profileCountry({ homeCity: null, locations: ["Remote"] })).toBeNull()
    expect(profileCountry(null)).toBeNull()
  })

  it("comes from the browser's first language when there is no profile", () => {
    expect(countryFromAcceptLanguage("pl-PL,pl;q=0.9,en-US;q=0.8")).toBe("PL")
    expect(countryFromAcceptLanguage("pl,en-US;q=0.9")).toBe("PL")
    expect(countryFromAcceptLanguage("en-US,en;q=0.9")).toBe("US")
    expect(countryFromAcceptLanguage("de-DE")).toBe("DE")
    expect(countryFromAcceptLanguage("en")).toBeNull()
    expect(countryFromAcceptLanguage(null)).toBeNull()
  })
})
