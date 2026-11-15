import { describe, expect, it } from "vitest"
import { syntheticCv } from "./fixtures"
import { changesSize, keepPresent, ownChanges } from "./own-changes"
import type { CvContent, CvExperienceSection, CvSkillsSection } from "./schema"

const clone = (cv: CvContent): CvContent => JSON.parse(JSON.stringify(cv))

const roles = (cv: CvContent) =>
  cv.sections.find((section): section is CvExperienceSection => section.type === "experience")!
const skills = (cv: CvContent) =>
  cv.sections.find((section): section is CvSkillsSection => section.type === "skills")!

const NEW_BULLET = "Wdrożyłem kolejkę zdarzeń opartą na Kafce dla zespołu płatności."

describe("ownChanges", () => {
  it("has no changes for identical CVs", () => {
    const cv = syntheticCv(3)
    expect(ownChanges(cv, clone(cv))).toEqual([])
    expect(changesSize([])).toBe(2)
  })

  it("reports a bullet added to a role", () => {
    const reference = syntheticCv(3)
    const now = clone(reference)
    roles(now).items[0].bullets.push(NEW_BULLET)
    const changes = ownChanges(now, reference)
    expect(changes).toEqual([
      {
        kind: "bullets",
        section: { id: "experience", type: "experience", title: "Doświadczenie zawodowe" },
        item: { id: "job1", label: "Przykładowa Firma 1 · Head of Engineering" },
        added: [NEW_BULLET],
      },
    ])
    expect(changesSize(changes)).toBe(JSON.stringify(changes).length)
  })

  it("reports a reworded bullet as added, and the old one not as removed", () => {
    const reference = syntheticCv(3)
    const now = clone(reference)
    roles(now).items[1].bullets[1] = "Odpowiadałem za architekturę platformy płatności."
    const changes = ownChanges(now, reference)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      kind: "bullets",
      added: ["Odpowiadałem za architekturę platformy płatności."],
    })
  })

  it("reports a changed summary and tech line with before and after", () => {
    const reference = syntheticCv(3)
    const now = clone(reference)
    const before = roles(reference).items[0]
    roles(now).items[0].summary = "Prowadziłem zespół ośmiu programistów."
    roles(now).items[0].tech = "<strong>Technologie:</strong> Node.js, PostgreSQL, Kafka"
    expect(ownChanges(now, reference)).toEqual([
      expect.objectContaining({
        kind: "field",
        field: "summary",
        before: before.summary,
        after: "Prowadziłem zespół ośmiu programistów.",
      }),
      expect.objectContaining({
        kind: "field",
        field: "tech",
        before: before.tech,
        after: "<strong>Technologie:</strong> Node.js, PostgreSQL, Kafka",
      }),
    ])
  })

  it("reports a changed skill text and section body", () => {
    const reference = syntheticCv(1)
    const now = clone(reference)
    skills(now).items[2].text = "Node.js, PostgreSQL, MongoDB, Kafka"
    const profile = now.sections[0]
    if (profile.type === "text") profile.body = "Kieruję zespołami inżynierskimi."
    const changes = ownChanges(now, reference)
    expect(changes).toEqual([
      expect.objectContaining({ kind: "field", field: "body", item: null }),
      expect.objectContaining({
        kind: "field",
        field: "text",
        item: { id: "sk3", label: "Backend i dane" },
        after: "Node.js, PostgreSQL, MongoDB, Kafka",
      }),
    ])
  })

  it("reports a new skill item and a new role as item changes", () => {
    const reference = syntheticCv(2)
    const now = clone(reference)
    const skill = { id: "skNew", label: "Chmura", text: "AWS, Terraform" }
    skills(now).items.push(skill)
    const role = {
      ...roles(reference).items[0],
      id: "jobNew",
      company: "Inna Spółka",
      role: "Staff Engineer",
    }
    roles(now).items.unshift(role)
    expect(ownChanges(now, reference)).toEqual([
      { kind: "item", section: expect.objectContaining({ id: "skills" }), item: skill },
      { kind: "item", section: expect.objectContaining({ id: "experience" }), item: role },
    ])
  })

  it("reports a new section as a section change", () => {
    const reference = syntheticCv(1)
    const now = clone(reference)
    const section = { id: "certs", type: "text" as const, title: "Certyfikaty", body: "AWS SA" }
    now.sections.push(section)
    expect(ownChanges(now, reference)).toEqual([{ kind: "section", section }])
  })

  it("does not report a removed bullet, role or section", () => {
    const longer = syntheticCv(3)
    const shorter = clone(longer)
    roles(shorter).items[0].bullets.pop()
    roles(shorter).items.pop()
    shorter.sections = shorter.sections.filter((section) => section.id !== "languages")
    expect(ownChanges(shorter, longer)).toEqual([])
  })

  it("never reports header, photo, theme, consent or hidden", () => {
    const reference = syntheticCv(1)
    const now = clone(reference)
    now.header.headline = "Staff Engineer"
    now.header.photoShape = "square"
    now.theme.accent = "#000000"
    now.consent = null
    now.sections[1].hidden = true
    now.sections[2].side = true
    expect(ownChanges(now, reference)).toEqual([])
  })

  it("skips what a hidden section holds", () => {
    const reference = syntheticCv(1)
    const now = clone(reference)
    skills(now).items[0].text = "zupełnie inny tekst"
    skills(now).hidden = true
    expect(ownChanges(now, reference)).toEqual([])
  })

  it("does not report bold added to an unchanged bullet", () => {
    const reference = syntheticCv(1)
    const now = clone(reference)
    const bullets = roles(now).items[0].bullets
    bullets[1] = bullets[1].replace("Odpowiadałem", "<strong>Odpowiadałem</strong>")
    bullets[2] = `  ${bullets[2].toUpperCase()}`
    expect(ownChanges(now, reference)).toEqual([])
  })

  it("matches sections and items by their names when ids differ", () => {
    const now = syntheticCv(2)
    const reference = clone(now)
    for (const section of reference.sections) {
      section.id = `x-${section.id}`
      if (section.type !== "text" && section.type !== "letter") {
        for (const item of section.items) item.id = `x-${item.id}`
      }
    }
    roles(now).items[1].bullets.push(NEW_BULLET)
    const changes = ownChanges(now, reference)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ kind: "bullets", item: { id: "job2" }, added: [NEW_BULLET] })
  })

  it("does not report an edit the reference already has", () => {
    // the reference is the newest generated version: what the model wrote is not the person's
    const generated = syntheticCv(2)
    roles(generated).items[0].bullets.push("Zdanie napisane przez model pod ofertę.")
    const now = clone(generated)
    roles(now).items[0].bullets.push(NEW_BULLET)
    const changes = ownChanges(now, generated)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ added: [NEW_BULLET] })
  })

  it("reports a second stint at the same company and role as a new role", () => {
    const reference = syntheticCv(2)
    const now = clone(reference)
    const stint = {
      ...roles(reference).items[0],
      id: "jobAgain",
      dates: "01.2025 – obecnie",
      bullets: [NEW_BULLET],
    }
    roles(now).items.unshift(stint)
    expect(ownChanges(now, reference)).toEqual([
      { kind: "item", section: expect.objectContaining({ id: "experience" }), item: stint },
    ])
  })

  it("matches each reference entry once when ids differ", () => {
    const now = syntheticCv(1)
    const reference = clone(now)
    for (const item of skills(reference).items) item.id = `x-${item.id}`
    const twin = { id: "skTwin", label: skills(now).items[0].label, text: "mentoring" }
    skills(now).items.push(twin)
    expect(ownChanges(now, reference)).toEqual([
      { kind: "item", section: expect.objectContaining({ id: "skills" }), item: twin },
    ])
  })
})

describe("keepPresent", () => {
  it("drops what the CV no longer says and keeps the rest", () => {
    const reference = syntheticCv(2)
    const edited = clone(reference)
    roles(edited).items[0].bullets.push(NEW_BULLET, "Punkt, który potem zniknął.")
    roles(edited).items[1].summary = "Opis, który potem zniknął."
    skills(edited).items.push({ id: "skNew", label: "Chmura", text: "AWS, Terraform" })
    const current = clone(reference)
    roles(current).items[0].bullets.push(`<strong>${NEW_BULLET}</strong>`)
    skills(current).items.push({ id: "skNew", label: "Chmura", text: "AWS, Terraform" })
    const kept = keepPresent(ownChanges(edited, reference), current)
    expect(kept).toEqual([
      expect.objectContaining({ kind: "item", item: expect.objectContaining({ id: "skNew" }) }),
      expect.objectContaining({ kind: "bullets", added: [NEW_BULLET] }),
    ])
  })
})
