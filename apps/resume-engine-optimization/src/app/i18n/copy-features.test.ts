import { describe, expect, it } from "vitest"
import { featuresContent } from "./copy-features"

const shape = (locale: "pl" | "en") =>
  featuresContent(locale).sections.map((section) => ({
    id: section.id,
    where: section.where?.href ?? null,
    groups: section.groups.map((group) => group.items.map((item) => item.id ?? null)),
  }))

describe("features page content", () => {
  it("has the same sections, groups and items in Polish and English", () => {
    expect(shape("en")).toEqual(shape("pl"))
  })

  it("gives every section and anchored item a unique id", () => {
    const ids = featuresContent("pl").sections.flatMap((section) => [
      section.id,
      ...section.groups.flatMap((group) => group.items.flatMap((item) => item.id ?? [])),
    ])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("keeps the anchors other screens link to", () => {
    const ids = new Set(
      featuresContent("pl").sections.flatMap((section) => [
        section.id,
        ...section.groups.flatMap((group) => group.items.flatMap((item) => item.id ?? [])),
      ])
    )
    // CvEditorBackend.routes.guide (src/app/cv/backend.ts) and the extension's popup (lib/popup.js)
    expect(ids).toContain("cv-editor")
    expect(ids).toContain("extension")
  })
})
