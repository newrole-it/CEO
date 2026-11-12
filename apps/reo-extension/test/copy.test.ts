import { describe, expect, it } from "vitest"
import { COPY, errorKey, localeOf, translator } from "../lib/copy.js"

describe("lib/copy.js", () => {
  it("has every key in every language", () => {
    const keys = Object.keys(COPY.pl).sort()
    for (const [locale, dictionary] of Object.entries(COPY)) {
      expect(Object.keys(dictionary).sort(), locale).toEqual(keys)
      expect(
        Object.values(dictionary).filter((text) => !String(text).trim()),
        locale
      ).toEqual([])
    }
  })

  it("keeps the same placeholders in every language", () => {
    const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    for (const [key, text] of Object.entries(COPY.pl)) {
      for (const dictionary of Object.values(COPY)) {
        expect(holes((dictionary as Record<string, string>)[key]), key).toEqual(holes(text))
      }
    }
  })

  it("fills placeholders", () => {
    expect(translator("pl")("fit.score", { n: 72 })).toBe("Dopasowanie: 72%")
    expect(translator("en")("fit.required", { met: 7, total: 9 })).toBe(
      "Required requirements met: 7 of 9"
    )
  })

  it("picks Polish for a Polish browser and English for any other", () => {
    expect(localeOf("pl-PL")).toBe("pl")
    expect(localeOf("en-GB")).toBe("en")
    expect(localeOf("de")).toBe("en")
    expect(localeOf(undefined)).toBe("en")
  })

  it("reads an unknown error code as a failed run", () => {
    expect(errorKey("no-base")).toBe("fit.err.no-base")
    expect(errorKey("HTTP 500")).toBe("fit.err.failed")
    expect(errorKey(undefined)).toBe("fit.err.failed")
  })
})
