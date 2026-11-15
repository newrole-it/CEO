import { describe, expect, it } from "vitest"
import { syntheticCv } from "./fixtures"
import { applyGather } from "./gather"
import type { CvContent, CvExperienceSection, CvSkillsSection } from "./schema"
import { cvPlainText } from "./text"

const roles = (cv: CvContent) =>
  cv.sections.find((section): section is CvExperienceSection => section.type === "experience")!
const skills = (cv: CvContent) =>
  cv.sections.find((section): section is CvSkillsSection => section.type === "skills")!

const first = syntheticCv(1).sections[0]
const PROFILE = first.type === "text" ? first.body : ""
const NEW_BULLET = "Wdrożyłem kolejkę zdarzeń opartą na Kafce dla zespołu płatności."

function ids(cv: CvContent): string[] {
  return cv.sections.flatMap((section) => [
    section.id,
    ...(section.type === "text" || section.type === "letter"
      ? []
      : section.items.map((item) => `${section.id}/${item.id}`)),
  ])
}

describe("applyGather", () => {
  const target = syntheticCv(3)
  const evidence = `${cvPlainText(target)}\n${NEW_BULLET}`

  it("merges a role's bullets and keeps company, role and dates", () => {
    const first = roles(target).items[0]
    const bullets = [...first.bullets, NEW_BULLET]
    const result = applyGather(
      target,
      [
        {
          id: "experience",
          items: [{ id: "job1", company: "Zmieniona", role: "Inna", dates: "2001", bullets }],
        },
      ],
      { evidence }
    )
    const role = roles(result!.content).items[0]
    expect(role.bullets).toEqual(bullets)
    expect(role).toMatchObject({ company: first.company, role: first.role, dates: first.dates })
    expect(result!.reverted).toBe(0)
    // the roles the reply did not name are as they were
    expect(roles(result!.content).items.slice(1)).toEqual(roles(target).items.slice(1))
  })

  it("keeps the items of a skills section the reply leaves out, in place", () => {
    const result = applyGather(
      target,
      [{ id: "skills", items: [{ id: "sk3", text: "Node.js, PostgreSQL, MongoDB, Kafka" }] }],
      { evidence }
    )
    const items = skills(result!.content).items
    expect(items.map((item) => item.id)).toEqual(["sk1", "sk2", "sk3"])
    expect(items[2].text).toBe("Node.js, PostgreSQL, MongoDB, Kafka")
    expect(items[0]).toEqual(skills(target).items[0])
  })

  it("appends an item without an id, or with an unknown one, under a new id", () => {
    const result = applyGather(
      target,
      [
        {
          id: "skills",
          items: [
            { label: "Chmura", text: "AWS, Terraform" },
            { id: "nope", label: "Dane", text: "dbt" },
          ],
        },
      ],
      { evidence }
    )
    const items = skills(result!.content).items
    expect(items).toHaveLength(5)
    expect(items[3]).toMatchObject({ label: "Chmura", text: "AWS, Terraform" })
    expect(items[4]).toMatchObject({ label: "Dane", text: "dbt" })
    expect(new Set(items.map((item) => item.id)).size).toBe(5)
    expect(items[4].id).not.toBe("nope")
  })

  it("appends a new role with its company, role and dates", () => {
    const result = applyGather(
      target,
      [
        {
          id: "experience",
          items: [
            {
              company: "Inna Spółka",
              role: "Staff Engineer",
              dates: "obecnie",
              summary: "Projektuję platformę danych.",
              bullets: [NEW_BULLET],
            },
          ],
        },
      ],
      { evidence }
    )
    const items = roles(result!.content).items
    expect(items).toHaveLength(4)
    expect(items[3]).toMatchObject({
      company: "Inna Spółka",
      role: "Staff Engineer",
      dates: "obecnie",
      summary: "Projektuję platformę danych.",
      bullets: [NEW_BULLET],
      tech: "",
      compact: false,
    })
  })

  it("appends a section without an id, and ignores one without type or title", () => {
    const result = applyGather(
      target,
      [
        { type: "text", title: "Certyfikaty", body: "AWS Solutions Architect" },
        { title: "Bez typu", body: "x" },
        { type: "text", body: "bez tytułu" },
      ],
      { evidence }
    )
    const sections = result!.content.sections
    expect(sections).toHaveLength(target.sections.length + 1)
    expect(sections[sections.length - 1]).toMatchObject({
      type: "text",
      title: "Certyfikaty",
      body: "AWS Solutions Architect",
    })
  })

  it("ignores an unknown section id and applies a repeated id once", () => {
    const result = applyGather(
      target,
      [
        { id: "ghost", body: "nic" },
        { id: "profile", body: `${PROFILE} Pierwsza wersja.` },
        { id: "profile", body: `${PROFILE} Druga wersja.` },
      ],
      { evidence }
    )
    const profile = result!.content.sections[0]
    expect(profile.type === "text" && profile.body).toBe(`${PROFILE} Pierwsza wersja.`)
    expect(result!.content.sections).toHaveLength(target.sections.length)
  })

  it("keeps every section id and item id of the target", () => {
    const result = applyGather(
      target,
      [
        { id: "skills", items: [{ id: "sk1", text: "rekrutacja" }] },
        { id: "experience", items: [{ id: "job2", summary: "Krótko." }] },
        { id: "projects", items: [{ id: "c2", body: "Produkt oparty na danych." }] },
      ],
      { evidence }
    )
    expect(ids(result!.content)).toEqual(ids(target))
  })

  it("keeps the old bullets when a new one adds a number the evidence lacks", () => {
    const first = roles(target).items[0]
    const result = applyGather(
      target,
      [
        {
          id: "experience",
          items: [{ id: "job1", bullets: [...first.bullets, "Skróciłem czas wdrożenia o 73%."] }],
        },
      ],
      { evidence }
    )
    expect(roles(result!.content).items[0].bullets).toEqual(first.bullets)
    expect(result!.reverted).toBe(1)
  })

  it("leaves header, consent, theme and hidden sections unchanged", () => {
    const hidden: CvContent = {
      ...target,
      sections: target.sections.map((section) =>
        section.id === "languages" ? { ...section, hidden: true } : section
      ),
    }
    const result = applyGather(hidden, [{ id: "profile", body: "Nowy profil." }], { evidence })
    const { content } = result!
    expect(content.header).toEqual(hidden.header)
    expect(content.consent).toBe(hidden.consent)
    expect(content.theme).toEqual(hidden.theme)
    expect(content.sections[content.sections.length - 1]).toEqual(
      hidden.sections[hidden.sections.length - 1]
    )
  })

  it("lists names the evidence does not have", () => {
    const result = applyGather(
      target,
      [{ id: "skills", items: [{ id: "sk3", text: "Node.js, PostgreSQL, MongoDB, Terraform" }] }],
      { evidence }
    )
    expect(result!.unverified).toContain("Terraform")
  })

  it("keeps a role's bullets when the reply returns fewer facts than the CV had", () => {
    const role = roles(target).items[0]
    const result = applyGather(
      target,
      [{ id: "experience", items: [{ id: "job1", bullets: [role.bullets[0]] }] }],
      { evidence }
    )
    expect(roles(result!.content).items[0].bullets).toEqual(role.bullets)
    expect(result!.kept).toBe(1)
    expect(result!.reverted).toBe(0)
  })

  it("accepts two bullets joined into one line that holds both", () => {
    const role = roles(target).items[0]
    const joined = `${role.bullets[1].replace(/\.$/, "")}, a także ${NEW_BULLET}`
    const bullets = [role.bullets[0], joined, role.bullets[2]]
    const result = applyGather(target, [{ id: "experience", items: [{ id: "job1", bullets }] }], {
      evidence,
    })
    expect(roles(result!.content).items[0].bullets).toEqual(bullets)
    expect(result!.kept).toBe(0)
  })

  it("keeps a skills line and a tech line that would lose one of their terms", () => {
    const result = applyGather(
      target,
      [
        { id: "skills", items: [{ id: "sk1", text: "Go" }] },
        {
          id: "experience",
          items: [{ id: "job1", tech: "<strong>Technologie:</strong> Node.js, Kafka" }],
        },
      ],
      { evidence }
    )
    expect(skills(result!.content).items[0].text).toBe(skills(target).items[0].text)
    expect(roles(result!.content).items[0].tech).toBe(roles(target).items[0].tech)
    expect(result!.kept).toBe(2)
  })

  it("keeps a text that would lose a number the CV has", () => {
    const withNumber: CvContent = {
      ...target,
      sections: target.sections.map((section) =>
        section.id === "profile" && section.type === "text"
          ? { ...section, body: "Prowadzę zespół 12 osób." }
          : section
      ),
    }
    const result = applyGather(
      withNumber,
      [{ id: "profile", body: "Prowadzę duży zespół inżynierów w firmie produktowej." }],
      { evidence }
    )
    const profile = result!.content.sections[0]
    expect(profile.type === "text" && profile.body).toBe("Prowadzę zespół 12 osób.")
    expect(result!.kept).toBe(1)
  })

  it("gives null when a role would hold 41 bullets", () => {
    const bullets = Array.from({ length: 41 }, (_, index) => `Punkt ${"i".repeat(index + 1)}.`)
    expect(
      applyGather(target, [{ id: "experience", items: [{ id: "job1", bullets }] }], { evidence })
    ).toBeNull()
  })
})
