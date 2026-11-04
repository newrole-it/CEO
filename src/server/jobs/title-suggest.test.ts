import { describe, expect, it } from "vitest"
import { titleCore } from "./title-suggest"

describe("titleCore", () => {
  it("keeps the part of the title with the typed words, without a level word", () => {
    expect(titleCore("Head of Engineering, Rewards", ["head"])).toBe("Head of Engineering")
    expect(
      titleCore("Supply Chain Co-Founder / Head of Engineering (100 % remote) (m/f/d)", ["head"])
    ).toBe("Head of Engineering")
    expect(titleCore("Senior Software Engineer II", ["soft"])).toBe("Software Engineer")
    expect(titleCore("Engineering Manager - AI Payments App", ["eng"])).toBe("Engineering Manager")
  })

  it("keeps a slash inside one title and the signs some names end in", () => {
    expect(titleCore("AI / ML Engineer", ["ml"])).toBe("AI / ML Engineer")
    expect(titleCore("Senior C++", ["c++"])).toBe("C++")
  })

  it("is null when no part holds every typed word", () => {
    expect(titleCore("Head of Product", ["eng"])).toBeNull()
  })
})
