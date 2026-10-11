import { describe, expect, it } from "vitest"
import { dedupeSavedSearches } from "./saved-searches"

const search = (
  id: string,
  phrase: string,
  locationHint: string | null,
  createdAt: string,
  newJobs = 0
) => ({ id, phrase, locationHint, createdAt, newJobs })

describe("dedupeSavedSearches", () => {
  it("keeps the newest search for the same query and location", () => {
    const chips = dedupeSavedSearches([
      search("old", "Head of Engineering", "Poland", "2026-10-10T18:09:56.000Z", 25),
      search("new", "Head of Engineering", "Poland", "2026-10-10T21:00:58.000Z", 227),
      search("warsaw", "Head of Engineering", "Warsaw", "2026-10-10T12:00:00.000Z", 4),
    ])
    expect(chips.map((chip) => chip.id)).toEqual(["new", "warsaw"])
    expect(chips[0]?.newJobs).toBe(227)
  })

  it("treats case and extra spaces as the same search", () => {
    const chips = dedupeSavedSearches([
      search("a", "  head   of engineering ", " poland ", "2026-10-09T00:00:00.000Z"),
      search("b", "Head of Engineering", "Poland", "2026-10-10T00:00:00.000Z"),
    ])
    expect(chips.map((chip) => chip.id)).toEqual(["b"])
  })

  it("returns at most five chips, most recent first", () => {
    const chips = dedupeSavedSearches(
      Array.from({ length: 8 }, (_, index) =>
        search(
          `s${index}`,
          `Role ${index}`,
          "Remote",
          `2026-10-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`
        )
      )
    )
    expect(chips.map((chip) => chip.id)).toEqual(["s7", "s6", "s5", "s4", "s3"])
  })

  it("keeps a blank location distinct from a named one", () => {
    const chips = dedupeSavedSearches([
      search("anywhere", "Data Engineer", null, "2026-10-10T00:00:00.000Z"),
      search("berlin", "Data Engineer", "Berlin", "2026-10-09T00:00:00.000Z"),
    ])
    expect(chips.map((chip) => chip.id)).toEqual(["anywhere", "berlin"])
  })
})
