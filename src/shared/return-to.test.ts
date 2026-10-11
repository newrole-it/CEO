import { describe, expect, it } from "vitest"
import { safeReturnTo } from "./return-to"

describe("safeReturnTo", () => {
  it("keeps same-origin paths", () => {
    expect(safeReturnTo("/searches/abc")).toBe("/searches/abc")
    expect(safeReturnTo("/profile?returnTo=%2Fsearches%2Fabc")).toBe(
      "/profile?returnTo=%2Fsearches%2Fabc"
    )
  })

  it("rejects off-site targets", () => {
    expect(safeReturnTo("https://evil.example/searches")).toBeNull()
    expect(safeReturnTo("//evil.example")).toBeNull()
    expect(safeReturnTo("/\\evil")).toBeNull()
    expect(safeReturnTo("searches/abc")).toBeNull()
    expect(safeReturnTo(null)).toBeNull()
  })
})
