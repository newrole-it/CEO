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

  it("rejects control characters that URL parsing strips into an off-site URL", () => {
    expect(new URL("/\t/evil.example/x", "http://127.0.0.1").host).toBe("evil.example")
    for (const value of [
      "/\t/evil.example/x",
      "/\n/evil.example",
      "/\r/evil.example",
      "/\u0000/evil.example",
      "/\u007f",
      "/%09/ok",
    ]) {
      const result = safeReturnTo(value)
      if (result) expect(new URL(result, "http://127.0.0.1").host).toBe("127.0.0.1")
      else expect(result).toBeNull()
    }
    expect(safeReturnTo("/\t/evil.example/x")).toBeNull()
    expect(safeReturnTo("/%09/ok")).toBe("/%09/ok")
  })
})
