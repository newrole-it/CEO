import { describe, expect, it } from "vitest"
import { buildProfileAudit, progressCopy } from "./audit"
import { demandFromOffers } from "./demand"
import {
  auditView,
  documentFromSections,
  LinkedInAuditBodySchema,
  readSummary,
  type ProfileSections,
} from "./linkedin-audit"
import { profileText } from "./linkedin"

const sections: ProfileSections = {
  name: "Jan Kowalski",
  headline: "Head of Engineering · Fintech",
  location: "Warsaw, Poland",
  about: "I lead platform teams in fintech.\nResponsible for various things.",
  experience: [
    {
      title: "Head of Engineering",
      company: "Acme · Full-time",
      dates: "Jan 2021 - Present · 5 yrs",
      location: "Warsaw, Poland · Hybrid",
      description: "Built the payments platform for 40 banks.",
    },
    {
      title: "Senior Engineer",
      company: "Globex",
      dates: "Mar 2019 - Dec 2020 · 1 yr 10 mos",
      location: "Kraków, Poland",
      description: "Led the migration to Kubernetes.",
    },
  ],
  education: [
    {
      school: "Example University",
      degree: "MSc, Computer Science",
      dates: "2010 - 2015",
    },
  ],
  skills: ["Kubernetes", "TypeScript"],
  certifications: [],
  languages: ["Polish"],
}

function offers(count: number, hit: number, text: string) {
  return Array.from({ length: count }, (_, index) => ({
    title: "Head of Engineering",
    descriptionText: index < hit ? text : "General engineering work.",
  }))
}

describe("LinkedIn profile audit from the extension", () => {
  it("cuts oversized input instead of refusing it", () => {
    const body = LinkedInAuditBodySchema.parse({
      sections: {
        ...sections,
        about: "x".repeat(5000),
        skills: Array.from({ length: 150 }, (_, index) => `skill ${index}`),
        experience: [{ ...sections.experience[0], description: "y".repeat(4000) }],
      },
    })
    expect(body.sections.about).toHaveLength(4000)
    expect(body.sections.skills).toHaveLength(100)
    expect(body.sections.experience[0].description).toHaveLength(3000)
    expect(body.force ?? null).toBeNull()
  })

  it("needs more than a name to make a document", () => {
    expect(
      documentFromSections({
        ...sections,
        headline: "",
        about: "",
        experience: [],
        education: [],
        skills: [],
        languages: [],
      })
    ).toBeNull()
    expect(documentFromSections(sections)?.blocks.map((block) => block.kind)).toEqual([
      "headline",
      "about",
      "experience",
      "experience",
      "education",
      "skills",
    ])
  })

  it("writes the comments in Polish and keeps the counts from the offers", async () => {
    const document = documentFromSections(sections)!
    const facts = demandFromOffers({
      roles: [{ phrase: "Head of Engineering", offers: offers(40, 20, "You own the budget.") }],
      profileText: profileText(document),
    })
    const audit = await buildProfileAudit({
      document,
      facts,
      llm: null,
      previousScore: 70,
      locale: "pl",
      language: "en",
    })
    const keywords = audit.annotations.find((item) => item.category === "keywords")
    expect(keywords?.why).toBe(
      "Oferty „Head of Engineering” w Twoich wynikach wspominają o tym: odpowiedzialność za budżet. To 50% przypadków (20 z 40), a w Twoim profilu tego nie ma."
    )
    expect(keywords?.rewrite).toContain("odpowiedzialność za budżet")
    const vague = audit.annotations.find((item) => item.category === "vague")
    expect(vague?.quote).toBe("Responsible for")
    expect(vague?.why).toMatch(/^To nazwa czynności/)
    expect(audit.summary).toMatch(/^Ocena profilu: \d+\. Uwag: \d+\. Frazy z Twoich ofert/)
    expect(progressCopy(audit.score, audit.previousScore, "pl")).toMatch(/audycie \(70\)/)

    const view = auditView(audit, document, new Date("2026-10-31T10:00:00Z"), true, "pl")
    expect(view.score).toBe(audit.score)
    expect(view.fresh).toBe(true)
    expect(view.auditedAt).toBe("2026-10-31T10:00:00.000Z")
    expect(view.notes[0]).toMatchObject({
      category: "keywords",
      label: "Brakujące słowa kluczowe",
      section: "Umiejętności",
    })
    // "Senior Engineer" names engineers, which the scope rule takes as a team; the head does not.
    const scope = view.notes.filter((note) => note.category === "seniority")
    expect(scope.map((note) => note.section)).toEqual(["Doświadczenie · Head of Engineering"])
    expect(scope[0].why).toMatch(/^Z tego wpisu nie widać poziomu roli/)
    expect(view.demand).toEqual([
      expect.objectContaining({ phrase: "odpowiedzialność za budżet", percent: 50 }),
    ])
    expect(view.read).toEqual(readSummary(document))
    expect(view.read).toEqual({
      name: true,
      headline: true,
      about: true,
      experience: 2,
      education: 1,
      skills: 2,
    })
  })

  it("keeps English as the default so the old callers read the same", async () => {
    const document = documentFromSections(sections)!
    const audit = await buildProfileAudit({ document, facts: [], llm: null, previousScore: null })
    expect(audit.summary).toMatch(/^Profile score \d+\. \d+ marks\. No saved search/)
    expect(auditView(audit, document, new Date(), false, "en").notes[0].label).toBe("Vague wording")
  })
})
