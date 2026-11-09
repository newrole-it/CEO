import { describe, expect, it } from "vitest"
import { syntheticCv, syntheticLetter } from "./fixtures"
import { cvFlow } from "./flow"
import { parseCvContent, type CvContent } from "./schema"
import { PAGE_MM } from "./styles"
import {
  CV_TEMPLATES,
  DEFAULT_TEMPLATE,
  documentTemplate,
  onAccent,
  sectionOnSide,
  templateClass,
  TEMPLATES_CSS,
} from "./templates"

function withTemplate(content: CvContent, template: string): CvContent {
  return { ...content, theme: { ...content.theme, template } }
}

describe("CV_TEMPLATES", () => {
  it("has unique ids that the schema stores", () => {
    const ids = CV_TEMPLATES.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(DEFAULT_TEMPLATE)
    for (const id of ids) {
      expect(parseCvContent(withTemplate(syntheticCv(1), id))?.theme.template).toBe(id)
    }
  })

  it("scopes every rule under its own class, so one template cannot restyle another", () => {
    for (const template of CV_TEMPLATES) {
      const scope = `.cv-doc.${templateClass(template)}`
      const selectors = template.css
        .replace(/\{[^}]*\}/g, "\n")
        .split(/[\n,]/)
        .map((selector) => selector.trim())
        .filter(Boolean)
      for (const selector of selectors) expect(selector.startsWith(scope)).toBe(true)
    }
  })

  it("offers valid accents and an SVG preview", () => {
    for (const template of CV_TEMPLATES) {
      expect(template.accents.length).toBeGreaterThan(0)
      for (const accent of template.accents) expect(accent).toMatch(/^#[0-9a-f]{6}$/)
      expect(template.preview.trim().startsWith("<svg")).toBe(true)
      expect(template.preview).not.toMatch(/<script|on\w+=/i)
    }
  })

  it("keeps the columns of a two-column template inside the A4 sheet", () => {
    for (const template of CV_TEMPLATES) {
      const columns = "columns" in template ? template.columns : null
      if (!columns) continue
      const { main, side } = columns
      expect(side.left + side.width).toBeLessThanOrEqual(main.left)
      expect(main.left + main.width).toBeLessThanOrEqual(PAGE_MM.width)
      expect(TEMPLATES_CSS).toContain(`.cv-doc.${templateClass(template)} .cv-page__side`)
    }
  })
})

describe("documentTemplate", () => {
  it("reads an unset or removed template as the classic look", () => {
    expect(documentTemplate(syntheticCv(1)).id).toBe("classic")
    expect(documentTemplate(withTemplate(syntheticCv(1), "gone-template")).id).toBe("classic")
    expect(documentTemplate(withTemplate(syntheticCv(1), "band")).id).toBe("band")
  })

  it("draws a cover letter in a two-column template as one column", () => {
    expect(documentTemplate(withTemplate(syntheticLetter(), "sidebar")).id).toBe("classic")
    expect(documentTemplate(withTemplate(syntheticLetter(), "band")).id).toBe("band")
  })
})

describe("cvFlow with a two-column template", () => {
  it("leaves every atom in the main column of a one-column template", () => {
    expect(cvFlow(withTemplate(syntheticCv(2), "band")).some((atom) => atom.side)).toBe(false)
    expect(cvFlow(syntheticCv(2)).some((atom) => atom.kind === "contact")).toBe(false)
  })

  it("puts the contact details, skills and languages on the side and keeps each column's order", () => {
    const content = withTemplate(syntheticCv(2), "sidebar")
    const atoms = cvFlow(content)
    const side = atoms.filter((atom) => atom.side)
    expect(side[0].kind).toBe("contact")
    const sideSections = new Set(side.map((atom) => atom.sectionId).filter(Boolean))
    const titles = content.sections
      .filter((section) => sideSections.has(section.id))
      .map((section) => section.title)
    expect(titles).toEqual(["Kluczowe kompetencje", "Języki"])
    const main = atoms.filter((atom) => !atom.side)
    expect(main[0].kind).toBe("header")
    expect(main.some((atom) => atom.kind === "job-head")).toBe(true)
  })

  it("follows the person's choice over the default", () => {
    const content = withTemplate(syntheticCv(1), "sidebar")
    const skills = content.sections.find((section) => section.type === "skills")!
    const education = content.sections.find((section) => section.type === "education")!
    expect(sectionOnSide(skills)).toBe(true)
    expect(sectionOnSide({ ...skills, side: false })).toBe(false)
    expect(sectionOnSide({ ...education, side: true })).toBe(true)
    const moved: CvContent = {
      ...content,
      sections: content.sections.map((section) =>
        section.id === education.id ? { ...section, side: true } : section
      ),
    }
    const eduAtoms = cvFlow(moved).filter((atom) => atom.sectionId === education.id)
    expect(eduAtoms.length).toBeGreaterThan(0)
    expect(eduAtoms.every((atom) => atom.side)).toBe(true)
  })
})

describe("onAccent", () => {
  it("is white on a dark accent and ink on a light one", () => {
    expect(onAccent("#175c72")).toBe("#ffffff")
    expect(onAccent("#1f3a93")).toBe("#ffffff")
    expect(onAccent("#f5d90a")).toBe("#172333")
    expect(onAccent("#ffffff")).toBe("#172333")
  })
})
