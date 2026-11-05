import { describe, expect, it } from "vitest"
import { humanStyle } from "./human-style"

describe("humanStyle", () => {
  it("gives the rules for the languages asked for", () => {
    expect(humanStyle(["pl"])).toContain("Natural Polish")
    expect(humanStyle(["pl"])).not.toContain("Natural English")
    expect(humanStyle(["en"])).toContain("Natural English")
    expect(humanStyle(["en"])).not.toContain("Natural Polish")
    expect(humanStyle(["pl", "en", "pl"])).toContain("Natural Polish")
    expect(humanStyle(["pl", "en"])).toContain("Natural English")
  })

  it("falls back to English and always keeps the facts rule", () => {
    expect(humanStyle([])).toContain("Natural English")
    expect(humanStyle(["pl"])).toContain("Never add a detail, example, number or opinion")
  })
})
