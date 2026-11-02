import { describe, expect, it } from "vitest"
import { languagesFromHeader, resolveLocale } from "./locale"

describe("interface language", () => {
  it("follows the person's own choice first", () => {
    expect(resolveLocale("en", "pl-PL,pl;q=0.9")).toBe("en")
    expect(resolveLocale("pl", "en-US")).toBe("pl")
  })

  it("follows a Polish browser, and English for every other language", () => {
    expect(resolveLocale(undefined, "pl-PL,pl;q=0.9,en-US;q=0.8")).toBe("pl")
    expect(resolveLocale(undefined, "en-GB,en;q=0.9")).toBe("en")
    expect(resolveLocale(undefined, "de-DE,de;q=0.9")).toBe("en")
    expect(resolveLocale(undefined, "de-DE,pl;q=0.8,en;q=0.5")).toBe("pl")
    expect(resolveLocale(undefined, null)).toBe("en")
  })

  it("orders languages by weight", () => {
    expect(languagesFromHeader("en;q=0.5, pl;q=0.9, *;q=0.1")).toEqual(["pl", "en"])
    expect(resolveLocale(undefined, "en;q=0.5, pl;q=0.9")).toBe("pl")
  })
})
