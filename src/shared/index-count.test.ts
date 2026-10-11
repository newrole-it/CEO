import { describe, expect, it } from "vitest"
import { indexBigNumber, indexCountLabel } from "./index-count"

describe("index count", () => {
  it("rounds down to the thousand and does not invent a larger number", () => {
    expect(indexCountLabel(15234, "pl").strong).toBe("Ponad 15 tys.")
    expect(indexCountLabel(1999, "en").strong).toBe("Over 1,000")
    expect(indexCountLabel(999, "pl").strong).toBe("999")
    expect(indexBigNumber(800, "en")).toBe("800")
  })
})
