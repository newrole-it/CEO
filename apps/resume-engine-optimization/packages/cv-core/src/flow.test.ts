import { describe, expect, it } from "vitest"
import { syntheticCv } from "./fixtures"
import { cvFlow, LEAD } from "./flow"
import type { CvExperienceSection } from "./schema"

/** A CV whose profile and first job summary have several paragraphs. */
function withParagraphs() {
  const cv = syntheticCv(1)
  cv.sections[0] = { id: "profile", type: "text", title: "Profil", body: "a<br>b<br><br>c" }
  const jobs = cv.sections.find((section) => section.type === "experience") as CvExperienceSection
  jobs.items[0].summary = "one<br>two"
  return { cv, jobs }
}

describe("cvFlow paragraphs", () => {
  it("gives every paragraph of a text its own atom in print", () => {
    const { cv } = withParagraphs()
    const atoms = cvFlow(cv).filter((atom) => atom.sectionId === "profile")
    expect(atoms.map((atom) => atom.kind)).toEqual(["title", "text", "text", "text", "text"])
    expect(atoms.slice(1).map((atom) => atom.index)).toEqual([0, 1, 2, 3])
    expect(atoms.slice(1).map((atom) => atom.lead)).toEqual([LEAD.afterTitle, 0, 0, 0])
    expect(atoms.slice(1).map((atom) => atom.key)).toEqual([
      "profile:text:0",
      "profile:text:1",
      "profile:text:2",
      "profile:text:3",
    ])
    // the heading stays with the first paragraph only
    expect(atoms.map((atom) => atom.keepWithNext)).toEqual([true, false, false, false, false])
  })

  it("gives every paragraph of a job summary its own atom in print", () => {
    const { cv, jobs } = withParagraphs()
    const job = jobs.items[0]
    const atoms = cvFlow(cv).filter((atom) => atom.itemId === job.id)
    const summary = atoms.filter((atom) => atom.kind === "job-summary")
    expect(summary.map((atom) => atom.lead)).toEqual([LEAD.summary, 0])
    expect(summary.map((atom) => atom.index)).toEqual([0, 1])
    // the first bullet keeps its distance from the summary
    const bullet = atoms.find((atom) => atom.kind === "bullet")
    expect(bullet?.lead).toBe(LEAD.bulletAfterSummary)
  })

  it("keeps the tech line with the last summary paragraph when a job has no bullets", () => {
    const { cv, jobs } = withParagraphs()
    jobs.items[0].bullets = []
    jobs.items[0].tech = "<strong>Technologie:</strong> Node.js"
    const atoms = cvFlow(cv).filter((atom) => atom.itemId === jobs.items[0].id)
    expect(atoms.map((atom) => [atom.kind, atom.keepWithNext])).toEqual([
      ["job-head", true],
      ["job-summary", false],
      ["job-summary", true],
      ["tech", false],
    ])
  })

  it("keeps a text and a job summary as one field in the editor", () => {
    const { cv, jobs } = withParagraphs()
    const atoms = cvFlow(cv, { editing: true })
    const text = atoms.filter((atom) => atom.sectionId === "profile" && atom.kind === "text")
    expect(text.map((atom) => atom.key)).toEqual(["profile:text"])
    const summary = atoms.filter((atom) => atom.kind === "job-summary")
    expect(summary.map((atom) => atom.key)).toEqual([`${jobs.id}:${jobs.items[0].id}:summary`])
  })

  it("leaves a blank text out of print", () => {
    const { cv } = withParagraphs()
    cv.sections[0] = { id: "profile", type: "text", title: "Profil", body: "<br>" }
    expect(cvFlow(cv).some((atom) => atom.sectionId === "profile")).toBe(false)
  })
})
