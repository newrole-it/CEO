import { describe, expect, it } from "vitest"
import { compactDiff, diffCv, diffText, hasChanges } from "./diff"
import { syntheticCv } from "./fixtures"

describe("diffText", () => {
  it("reports nothing for equal text", () => {
    const rows = diffText("a\nb", "a\nb")
    expect(hasChanges(rows)).toBe(false)
    expect(rows).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
    ])
  })

  it("finds added and removed lines", () => {
    expect(diffText("a\nb", "a\nc completely different")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "c completely different" },
    ])
  })

  it("marks the changed words of a reworded line", () => {
    const [row] = diffText(
      "Prowadziłem zespół pięciu osób w Warszawie",
      "Prowadziłem zespół ośmiu osób w Warszawie"
    )
    expect(row.kind).toBe("change")
    if (row.kind !== "change") return
    expect(row.before.filter((part) => part.changed).map((part) => part.text)).toEqual(["pięciu"])
    expect(row.after.filter((part) => part.changed).map((part) => part.text)).toEqual(["ośmiu"])
    expect(row.after.map((part) => part.text).join("")).toBe(
      "Prowadziłem zespół ośmiu osób w Warszawie"
    )
  })

  it("pairs a reworded line with its own replacement, not with whatever comes first", () => {
    const rows = diffText(
      "Budowałem platformę płatności dla sklepów",
      "Nowa linia bez związku z niczym\nBudowałem platformę płatności dla banków"
    )
    expect(rows.map((row) => row.kind).sort()).toEqual(["add", "change"])
  })

  it("handles a moved line as a removal and an addition", () => {
    const rows = diffText("a\nb\nc", "c\na\nb")
    expect(hasChanges(rows)).toBe(true)
    expect(rows.filter((row) => row.kind === "same")).toHaveLength(2)
  })

  it("handles empty sides", () => {
    expect(diffText("", "a")).toEqual([{ kind: "add", text: "a" }])
    expect(diffText("a", "")).toEqual([{ kind: "del", text: "a" }])
    expect(diffText("", "")).toEqual([])
  })
})

describe("compactDiff", () => {
  it("keeps one line of context around a change and counts the rest", () => {
    const before = ["1", "2", "3", "4", "5", "6"].join("\n")
    const after = ["1", "2", "3", "4", "5", "zmienione całkiem inaczej"].join("\n")
    expect(compactDiff(diffText(before, after))).toEqual([
      { kind: "gap", count: 4 },
      { kind: "same", text: "5" },
      { kind: "del", text: "6" },
      { kind: "add", text: "zmienione całkiem inaczej" },
    ])
  })

  it("shows nothing but a gap when nothing changed", () => {
    expect(compactDiff(diffText("a\nb", "a\nb"))).toEqual([{ kind: "gap", count: 2 }])
  })
})

describe("diffCv", () => {
  it("sees a change of text in a role", () => {
    const before = syntheticCv(2)
    const after = syntheticCv(2)
    after.header.headline = "Zupełnie inny nagłówek zawodowy"
    expect(hasChanges(diffCv(before, after))).toBe(true)
  })

  it("does not see a change of formatting alone", () => {
    const before = syntheticCv(1)
    const after = syntheticCv(1)
    after.sections[0] = { id: "profile", type: "text", title: "Profil", body: "Tekst" }
    before.sections[0] = {
      id: "profile",
      type: "text",
      title: "Profil",
      body: "<strong>Tekst</strong>",
    }
    expect(hasChanges(diffCv(before, after))).toBe(false)
  })

  it("shows a hidden section as gone", () => {
    const before = syntheticCv(1)
    const after = syntheticCv(1)
    after.sections[0] = { ...after.sections[0], hidden: true }
    expect(diffCv(before, after).some((row) => row.kind === "del")).toBe(true)
  })
})
