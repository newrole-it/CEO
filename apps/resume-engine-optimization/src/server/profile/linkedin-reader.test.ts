// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"
import {
  isDateLine,
  ownProfile,
  profileSlug,
  readProfile,
  sectionTarget,
  textOf,
} from "../../../../reo-extension/lib/linkedin.js"
import { documentFromSections } from "@newrole/profile/linkedin-audit"

const page = readFileSync(
  join(__dirname, "../../../../reo-extension/test/fixtures/linkedin-page.html"),
  "utf8"
)

describe("extension/lib/linkedin.js", () => {
  beforeEach(() => {
    document.body.innerHTML = page
  })

  it("knows a profile path from the rest of the site", () => {
    expect(profileSlug("/in/jan-kowalski/")).toBe("jan-kowalski")
    expect(profileSlug("/in/jan-kowalski")).toBe("jan-kowalski")
    expect(profileSlug("/in/me/")).toBe("me")
    expect(profileSlug("/in/jan-kowalski/details/experience/")).toBeNull()
    expect(profileSlug("/feed/")).toBeNull()
    expect(profileSlug("/jobs/view/123/")).toBeNull()
  })

  it("reads visible text once, one line per visible span", () => {
    const item = document.querySelector("#experience")!.closest("section")!.querySelector("li")!
    expect(textOf(item).split("\n")).toEqual([
      "Head of Engineering",
      "Acme · Full-time",
      "Jan 2021 - Present · 5 yrs 10 mos",
      "Warsaw, Poland · Hybrid",
    ])
    expect(isDateLine("Jan 2021 - Present · 5 yrs 10 mos")).toBe(true)
    expect(isDateLine("sty 2019 – gru 2020 · 2 lata")).toBe(true)
    expect(isDateLine("2010 - 2015")).toBe(true)
    expect(isDateLine("Built the payments platform for 40 banks.")).toBe(false)
  })

  it("reads the sections of the page, with grouped roles split per company", () => {
    const { sections, targets } = readProfile(document)
    expect(sections.name).toBe("Jan Kowalski")
    expect(sections.headline).toBe("Head of Engineering · Fintech")
    expect(sections.location).toBe("Warsaw, Mazowieckie, Poland")
    expect(sections.about).toBe(
      "I lead platform teams in fintech.\nResponsible for various things."
    )
    expect(sections.experience).toEqual([
      {
        title: "Head of Engineering",
        company: "Acme · Full-time",
        dates: "Jan 2021 - Present · 5 yrs 10 mos",
        location: "Warsaw, Poland · Hybrid",
        description:
          "Built the payments platform for 40 banks.\nKubernetes, TypeScript and +3 skills",
      },
      {
        title: "Senior Engineer",
        company: "Globex",
        dates: "Mar 2019 - Dec 2020 · 1 yr 10 mos",
        location: "Kraków, Poland",
        description: "Led the migration to Kubernetes.",
      },
      {
        title: "Engineer",
        company: "Globex",
        dates: "Jan 2018 - Feb 2019 · 1 yr 2 mos",
        location: "",
        description: "",
      },
    ])
    expect(sections.education).toEqual([
      {
        school: "Example University",
        degree: "Master's degree, Computer Science",
        dates: "2010 - 2015",
      },
    ])
    expect(sections.skills).toEqual(["Kubernetes", "TypeScript"])
    expect(sections.languages).toEqual(["Polish · Native or bilingual proficiency"])
    expect(sections.certifications).toEqual([])
    expect(targets.experience).toHaveLength(3)
    expect(sectionTarget(targets, "experience-2")?.textContent).toContain("Senior Engineer")
    expect(sectionTarget(targets, "about")?.id === "" || targets.about).toBeTruthy()
    expect(sectionTarget(targets, "headline")).toBe(
      document.querySelector("h1")!.closest("section")
    )
  })

  it("becomes the same document as the PDF import", () => {
    const { sections } = readProfile(document)
    const parsed = documentFromSections(sections)!
    expect(parsed.name).toBe("Jan Kowalski")
    expect(parsed.blocks.map((block) => block.id)).toEqual([
      "headline",
      "about",
      "experience-1",
      "experience-2",
      "experience-3",
      "education-1",
      "skills",
    ])
    const first = parsed.blocks.find((block) => block.id === "experience-1")!
    expect(first.parts.find((part) => part.field === "title")?.text).toBe("Head of Engineering")
    expect(first.parts.find((part) => part.field === "subtitle")?.text).toContain("Acme")
    expect(first.parts.find((part) => part.field === "body")?.text).toContain("40 banks")
    expect(parsed.blocks.find((block) => block.kind === "skills")?.parts[0].text).toBe(
      "Kubernetes · TypeScript"
    )
  })

  it("treats a page with edit controls, /in/me, or a known slug as the person's own", () => {
    expect(ownProfile(document, "/in/jan-kowalski/", null)).toBe(true)
    document.querySelector('a[aria-label="Edit intro"]')!.remove()
    expect(ownProfile(document, "/in/jan-kowalski/", null)).toBe(false)
    expect(ownProfile(document, "/in/jan-kowalski/", "jan-kowalski")).toBe(true)
    expect(ownProfile(document, "/in/me/", null)).toBe(true)
    expect(ownProfile(document, "/feed/", "jan-kowalski")).toBe(false)
    document.body.insertAdjacentHTML(
      "beforeend",
      '<main><button aria-label="Dodaj sekcję profilu">Dodaj sekcję profilu</button></main>'
    )
    document.querySelector("main")!.remove()
    expect(ownProfile(document, "/in/jan-kowalski/", null)).toBe(true)
  })
})
