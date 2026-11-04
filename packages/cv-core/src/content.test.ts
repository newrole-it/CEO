import { describe, expect, it } from "vitest"
import { blankCv, newSection } from "./blank"
import { syntheticCv } from "./fixtures"
import { contactLines, cvFlow, footerText, LEAD } from "./flow"
import { cvFromProfile } from "./from-profile"
import {
  CvContent,
  cvContentError,
  cvTooLongLimit,
  MAX_PHOTO_CHARS,
  parseCvContent,
  type CvExperienceSection,
} from "./schema"
import { cvPlainText } from "./text"

describe("schema", () => {
  it("accepts the templates and sanitizes rich fields on parse", () => {
    expect(CvContent.safeParse(blankCv("pl")).success).toBe(true)
    expect(CvContent.safeParse(blankCv("en")).success).toBe(true)
    const cv = syntheticCv(1)
    cv.sections[0] = { id: "p", type: "text", title: "T", body: "<script>x</script><b>ok</b>" }
    expect(parseCvContent(cv)?.sections[0]).toMatchObject({ body: "<strong>ok</strong>" })
  })

  it("rejects bad photos, links, ids and versions with a readable reason", () => {
    const base = syntheticCv(1)
    expect(
      cvContentError({ ...base, header: { ...base.header, photo: "https://x/y.png" } })
    ).toContain("photo")
    expect(
      cvContentError({
        ...base,
        header: { ...base.header, photo: `data:image/png;base64,${"A".repeat(MAX_PHOTO_CHARS)}` },
      })
    ).toContain("too large")
    expect(cvContentError({ ...base, header: { ...base.header, photoShape: "oval" } })).toContain(
      "photoShape"
    )
    expect(cvContentError({ ...base, header: { ...base.header, photoShape: "square" } })).toBeNull()
    expect(
      cvContentError({
        ...base,
        header: { ...base.header, links: [{ label: "x", url: "javascript:alert(1)" }] },
      })
    ).toContain("links")
    expect(cvContentError({ ...base, version: 2 })).toContain("version")
    expect(
      cvContentError({ ...base, sections: [{ id: "bad id!", type: "text", title: "T", body: "" }] })
    ).toContain("sections")
    expect(cvContentError(base)).toBeNull()
  })

  it("names the limit when a field is too long, and only then", () => {
    const base = syntheticCv(1)
    const long = { id: "p", type: "text", title: "T", body: "x".repeat(40_000) }
    expect(cvTooLongLimit({ ...base, sections: [long] })).toBeGreaterThan(0)
    expect(cvTooLongLimit({ ...base, version: 2 })).toBeNull()
    expect(cvTooLongLimit(base)).toBeNull()
  })

  it("builds a valid empty section of every type", () => {
    for (const type of ["text", "skills", "experience", "cards", "education"] as const) {
      expect(
        CvContent.safeParse({ ...blankCv("pl"), sections: [newSection(type, "T", "en")] }).success
      ).toBe(true)
    }
  })
})

describe("cvFlow", () => {
  it("reproduces the reference spacing and keeps titles with what follows", () => {
    const atoms = cvFlow(syntheticCv(2))
    expect(atoms[0]).toMatchObject({ kind: "header", lead: 0 })
    const title = atoms.find((atom) => atom.kind === "title")
    expect(title).toMatchObject({ lead: LEAD.title, keepWithNext: true })
    const heads = atoms.filter((atom) => atom.kind === "job-head")
    expect(heads[0]).toMatchObject({ lead: LEAD.afterTitle, keepWithNext: true })
    expect(heads[1]).toMatchObject({ lead: LEAD.jobAfterFull })
    expect(atoms[atoms.length - 1]).toMatchObject({ kind: "consent", lead: LEAD.consent })
  })

  it("keeps the last bullet with the tech line", () => {
    const atoms = cvFlow(syntheticCv(1))
    const techAt = atoms.findIndex((atom) => atom.kind === "tech")
    expect(atoms[techAt - 1]).toMatchObject({ kind: "bullet", keepWithNext: true })
    expect(atoms[techAt]).toMatchObject({ lead: LEAD.techAfterBullet })
  })

  it("pairs skills and cards into rows", () => {
    const atoms = cvFlow(syntheticCv(1))
    expect(atoms.filter((atom) => atom.kind === "skills").map((atom) => atom.itemIds)).toEqual([
      ["sk1", "sk2"],
      ["sk3"],
    ])
    expect(atoms.filter((atom) => atom.kind === "cards").map((atom) => atom.itemIds)).toEqual([
      ["c1", "c2"],
    ])
  })

  it("leaves blanks and hidden sections out of print but keeps them in the editor", () => {
    const cv = syntheticCv(1)
    const experience = cv.sections[2] as CvExperienceSection
    experience.items[0].bullets = ["", "ok"]
    experience.items[0].summary = ""
    cv.sections[0].hidden = true
    cv.sections[5] = { id: "languages", type: "text", title: "Języki", body: " " }
    const print = cvFlow(cv)
    expect(print.some((atom) => atom.sectionId === "profile")).toBe(false)
    expect(print.some((atom) => atom.sectionId === "languages")).toBe(false)
    expect(print.filter((atom) => atom.kind === "bullet").map((atom) => atom.index)).toEqual([1])
    expect(print.some((atom) => atom.kind === "job-summary")).toBe(false)

    const editing = cvFlow(cv, { editing: true })
    expect(editing.some((atom) => atom.sectionId === "languages" && atom.kind === "text")).toBe(
      true
    )
    expect(editing.filter((atom) => atom.kind === "bullet").map((atom) => atom.index)).toEqual([
      0, 1,
    ])
    const kept = cvFlow(cv, { editing: true, keep: new Set([`experience:job1:summary`]) })
    expect(kept.some((atom) => atom.kind === "job-summary")).toBe(true)
  })

  it("has unique keys", () => {
    const keys = cvFlow(syntheticCv(8), { editing: true }).map((atom) => atom.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("writes the footer and contact lines", () => {
    const cv = syntheticCv(1)
    expect(footerText(cv, 2, 3)).toBe("Anna Przykładowa · CV · 2/3")
    const { first, links } = contactLines(cv)
    expect(first.map((item) => item.kind)).toEqual(["location", "email", "phone"])
    expect(first[1].href).toBe("mailto:anna@example.com")
    expect(first[2].href).toBe("tel:+48600000000")
    expect(links).toHaveLength(1)
  })
})

describe("cvFromProfile", () => {
  const document = {
    name: "Anna Przykładowa",
    location: "Warszawa, Polska",
    blocks: [
      {
        kind: "headline" as const,
        parts: [{ field: "body" as const, text: "Head of Engineering" }],
      },
      {
        kind: "about" as const,
        parts: [{ field: "body" as const, text: "O mnie <b>tekst</b>\ndruga linia" }],
      },
      {
        kind: "skills" as const,
        parts: [{ field: "body" as const, text: "Node.js · PostgreSQL" }],
      },
      {
        kind: "experience" as const,
        parts: [
          { field: "title" as const, text: "CTO" },
          { field: "subtitle" as const, text: "Allegro · Jan 2020 - Present · Warszawa" },
          { field: "body" as const, text: "Opis roli.\n- pierwszy punkt\n- drugi punkt" },
        ],
      },
      {
        kind: "education" as const,
        parts: [
          { field: "title" as const, text: "Informatyka" },
          { field: "subtitle" as const, text: "Politechnika · 2010 - 2015" },
        ],
      },
    ],
  }

  it("maps the imported document and form details into the layout", () => {
    const cv = cvFromProfile({
      locale: "pl",
      name: "Inna Nazwa",
      email: "konto@example.com",
      document,
      profile: { languages: ["polski", "angielski"] },
      applicant: { phone: "+48 600", linkedinUrl: "https://www.linkedin.com/in/anna/" },
    })
    expect(cv.header).toMatchObject({
      name: "Anna Przykładowa",
      headline: "Head of Engineering",
      location: "Warszawa, Polska",
      email: "konto@example.com",
      phone: "+48 600",
      links: [{ label: "linkedin.com/in/anna", url: "https://www.linkedin.com/in/anna/" }],
    })
    expect(cv.sections.map((section) => section.type)).toEqual([
      "text",
      "skills",
      "experience",
      "education",
      "text",
    ])
    const about = cv.sections[0]
    // imported text is plain: markup in it is shown, not interpreted
    expect(about.type === "text" && about.body).toBe(
      "O mnie &lt;b&gt;tekst&lt;/b&gt;<br>druga linia"
    )
    const experience = cv.sections[2]
    if (experience.type !== "experience") throw new Error("expected experience")
    expect(experience.items[0]).toMatchObject({
      company: "Allegro",
      role: "CTO",
      dates: "Jan 2020 - Present",
      summary: "Opis roli.",
      bullets: ["pierwszy punkt", "drugi punkt"],
      compact: false,
    })
    const education = cv.sections[3]
    expect(education.type === "education" && education.items[0]).toMatchObject({
      school: "Politechnika",
      degree: "Informatyka",
      dates: "2010 - 2015",
    })
    expect(cv.consent).toContain("RODO")
  })

  it("falls back to the template when nothing is imported", () => {
    const cv = cvFromProfile({ locale: "en", name: "Jo", email: "jo@example.com" })
    expect(cv.header.name).toBe("Jo")
    expect(cv.sections.length).toBeGreaterThan(3)
    expect(CvContent.safeParse(cv).success).toBe(true)
  })
})

describe("cvPlainText", () => {
  it("reads as plain text without tags or hidden sections", () => {
    const cv = syntheticCv(1)
    cv.sections[1].hidden = true
    const text = cvPlainText(cv)
    expect(text).toContain("Anna Przykładowa")
    expect(text).toContain("Przykładowa Firma 1 · Head of Engineering")
    expect(text).toContain("- Platforma: współtworzyłem")
    expect(text).toContain("Technologie: Node.js")
    expect(text).not.toContain("<strong>")
    expect(text).not.toContain("KLUCZOWE KOMPETENCJE")
  })
})
