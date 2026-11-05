import { describe, expect, it } from "vitest"
import { newJob, newSection } from "./blank"
import {
  insertBullet,
  insertItem,
  insertSection,
  moveBullet,
  moveItem,
  moveSection,
  removeBullet,
  removeItem,
  removeSection,
  updateBullet,
  updateHeader,
  updateItem,
  updateSection,
} from "./edit"
import { syntheticCv } from "./fixtures"
import { cvPdfFileName } from "./filename"
import { applyCvPatch } from "./patch"
import { CvContent, type CvExperienceSection, type CvSkillsSection } from "./schema"

const job = (cv: CvContent) => (cv.sections[2] as CvExperienceSection).items[0]

describe("editor edits", () => {
  it("keeps the original untouched and the result valid", () => {
    const cv = syntheticCv(2)
    const next = updateItem(cv, "experience", "job1", { company: "Nowa" })
    expect(job(next).company).toBe("Nowa")
    expect(job(cv).company).not.toBe("Nowa")
    expect(next.sections[0]).toBe(cv.sections[0])
    expect(CvContent.safeParse(next).success).toBe(true)
  })

  it("updates the header and sections", () => {
    const cv = syntheticCv(1)
    expect(updateHeader(cv, { name: "X" }).header.name).toBe("X")
    expect(updateHeader(cv, { name: "X" }).header.email).toBe(cv.header.email)
    expect(updateSection(cv, "profile", { title: "Y" }).sections[0].title).toBe("Y")
  })

  it("moves sections and stops at the ends", () => {
    const cv = syntheticCv(1)
    expect(
      moveSection(cv, "skills", -1)
        .sections.map((s) => s.id)
        .slice(0, 2)
    ).toEqual(["skills", "profile"])
    expect(moveSection(cv, "profile", -1).sections[0].id).toBe("profile")
    const last = cv.sections[cv.sections.length - 1].id
    expect(moveSection(cv, last, 1).sections[cv.sections.length - 1].id).toBe(last)
    expect(moveSection(cv, "missing", 1).sections).toEqual(cv.sections)
  })

  it("adds and removes sections", () => {
    const cv = syntheticCv(1)
    const section = newSection("text", "Nowa")
    expect(insertSection(cv, section, "profile").sections[1].id).toBe(section.id)
    expect(insertSection(cv, section).sections[cv.sections.length].id).toBe(section.id)
    expect(removeSection(cv, "profile").sections.some((s) => s.id === "profile")).toBe(false)
  })

  it("moves, adds and removes items", () => {
    const cv = syntheticCv(2)
    expect(
      (moveItem(cv, "experience", "job2", -1).sections[2] as CvExperienceSection).items[0].id
    ).toBe("job2")
    const added = newJob("pl")
    expect(
      (insertItem(cv, "experience", added, "job1").sections[2] as CvExperienceSection).items[1].id
    ).toBe(added.id)
    expect(
      (insertItem(cv, "experience", added).sections[2] as CvExperienceSection).items[2].id
    ).toBe(added.id)
    expect(
      (removeItem(cv, "skills", "sk1").sections[1] as CvSkillsSection).items.map((i) => i.id)
    ).toEqual(["sk2", "sk3"])
  })

  it("edits bullets by index", () => {
    const cv = syntheticCv(1)
    const original = job(cv).bullets
    expect(job(updateBullet(cv, "experience", "job1", 1, "x")).bullets[1]).toBe("x")
    expect(job(insertBullet(cv, "experience", "job1", 0, "x")).bullets).toEqual([
      original[0],
      "x",
      original[1],
      original[2],
    ])
    expect(job(insertBullet(cv, "experience", "job1", -1)).bullets[0]).toBe("")
    expect(job(removeBullet(cv, "experience", "job1", 0)).bullets).toEqual([
      original[1],
      original[2],
    ])
    expect(job(moveBullet(cv, "experience", "job1", 1, -1)).bullets).toEqual([
      original[1],
      original[0],
      original[2],
    ])
    expect(job(moveBullet(cv, "experience", "job1", 0, -1)).bullets).toEqual(original)
  })
})

describe("applyCvPatch", () => {
  it("merges a section and an item by id", () => {
    const cv = syntheticCv(1)
    const next = applyCvPatch(cv, { section: { id: "profile", title: "Profile" } })
    expect(next.sections[0]).toMatchObject({ id: "profile", title: "Profile", type: "text" })
    const item = applyCvPatch(cv, { item: { sectionId: "experience", id: "job1", role: "CTO" } })
    expect(job(item)).toMatchObject({ role: "CTO", company: job(cv).company })
  })

  it("adds new sections and items, and removes them", () => {
    const cv = syntheticCv(1)
    const added = applyCvPatch(cv, { section: { id: "new", type: "text", title: "T", body: "b" } })
    expect(added.sections[added.sections.length - 1].id).toBe("new")
    expect(CvContent.safeParse(added).success).toBe(true)
    const withItem = applyCvPatch(cv, {
      item: { sectionId: "skills", id: "sk9", label: "L", text: "t" },
    })
    expect((withItem.sections[1] as CvSkillsSection).items).toHaveLength(4)
    expect(applyCvPatch(cv, { remove: { sectionId: "profile" } }).sections).toHaveLength(
      cv.sections.length - 1
    )
    expect(
      (
        applyCvPatch(cv, { remove: { sectionId: "skills", itemId: "sk1" } })
          .sections[1] as CvSkillsSection
      ).items
    ).toHaveLength(2)
  })

  it("explains what is wrong", () => {
    const cv = syntheticCv(1)
    expect(() => applyCvPatch(cv, { section: { id: "nope", title: "x" } })).toThrow("nope")
    expect(() => applyCvPatch(cv, { section: { id: "profile", type: "skills" } })).toThrow(
      "cannot change type"
    )
    expect(() => applyCvPatch(cv, { item: { sectionId: "nope", id: "x" } })).toThrow("nope")
    expect(() => applyCvPatch(cv, { item: { sectionId: "profile", id: "x" } })).toThrow(
      "plain text"
    )
    expect(() => applyCvPatch(cv, { remove: { sectionId: "skills", itemId: "x" } })).toThrow(
      "No item"
    )
  })
})

describe("cvPdfFileName", () => {
  it("makes a safe ASCII name", () => {
    expect(cvPdfFileName("Rafał Testowy")).toBe("Rafal_Testowy_CV.pdf")
    expect(cvPdfFileName("Żółć Ąę")).toBe("Zolc_Ae_CV.pdf")
    expect(cvPdfFileName('../"x"\r\n')).toBe("x_CV.pdf")
    expect(cvPdfFileName("")).toBe("CV.pdf")
    expect(cvPdfFileName(null)).toBe("CV.pdf")
  })
})
