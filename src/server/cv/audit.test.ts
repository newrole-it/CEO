import { describe, expect, it } from "vitest"
import type { LlmClient } from "src/server/llm/client"
import { demandFromOffers } from "@newrole/profile/demand"
import { locateNote, openNotes } from "@newrole/cv-core/audit"
import type { CvContent } from "@newrole/cv-core/schema"
import { buildCvAudit, scoreNotes } from "./audit"

const content: CvContent = {
  version: 1,
  header: {
    name: "Ala Kot",
    headline: "Head of Engineering",
    location: "Warszawa",
    email: "ala@example.com",
    phone: "+48 600 100 200",
    links: [],
    photo: null,
  },
  sections: [
    { id: "s0", type: "text", title: "Profil", body: "Prowadzę zespoły od 2015 roku." },
    {
      id: "s1",
      type: "skills",
      title: "Kompetencje",
      items: [{ id: "k1", label: "Tech", text: "TypeScript, Node.js, Postgres" }],
    },
    {
      id: "s2",
      type: "experience",
      title: "Doświadczenie",
      items: [
        {
          id: "j1",
          company: "Acme",
          role: "Lead",
          dates: "2022 – obecnie",
          summary: "",
          bullets: ["Odpowiedzialny za różne projekty.", "Rozwój systemu płatności."],
          tech: "",
          compact: false,
        },
        {
          id: "j2",
          company: "Beta",
          role: "Developer",
          dates: "2015 – 2018",
          summary: "",
          bullets: ["Zespół 6 osób."],
          tech: "",
          compact: false,
        },
      ],
    },
  ],
  consent: null,
  theme: { accent: "#175c72" },
}

function llm(data: unknown): LlmClient {
  return {
    model: "test",
    async completeJson() {
      return { data, tokenInput: 1, tokenOutput: 1, cached: false }
    },
    async completeText() {
      return null
    },
  } as LlmClient
}

const offers = (count: number, hit: number, text: string) =>
  Array.from({ length: count }, (_, index) => ({
    title: "Head of Engineering",
    descriptionText: index < hit ? text : "General engineering work.",
  }))

const base = { language: "pl", locale: "pl", previousScore: null } as const

describe("CV audit", () => {
  it("works from the rules alone and says so", async () => {
    const audit = await buildCvAudit({ ...base, content, facts: [], llm: null })
    expect(audit.usedModel).toBe(false)
    expect(audit.notes.every((note) => note.rewrite === null)).toBe(true)
    const vague = audit.notes.find((note) => note.category === "vague" && note.anchor === "quote")
    expect(vague?.quote).toBe("Odpowiedzialny za")
    expect(audit.notes.some((note) => note.why.includes("Daty przeskakują z 2018 na 2022"))).toBe(
      true
    )
    expect(audit.summary).toMatch(/Uwag: \d+\./)
    expect(audit.score).toBe(scoreNotes(audit.notes))
    expect(openNotes(audit, content).length).toBe(audit.notes.length)
  })

  it("writes comments in the interface language", async () => {
    const audit = await buildCvAudit({ ...base, locale: "en", content, facts: [], llm: null })
    expect(audit.notes.some((note) => note.why.startsWith("The dates jump from 2018"))).toBe(true)
    expect(audit.summary).toMatch(/^Notes: \d+\./)
  })

  it("flags a role with no scope, a missing date, a placeholder and an empty contact", async () => {
    const holes: CvContent = {
      ...content,
      header: { ...content.header, phone: "" },
      sections: [
        ...content.sections.slice(0, 2),
        {
          id: "s2",
          type: "experience",
          title: "Doświadczenie",
          items: [
            {
              id: "j1",
              company: "Acme",
              role: "Lead",
              dates: "",
              summary: "",
              bullets: ["Skrócenie wdrożeń o [liczba] dni."],
              tech: "",
              compact: false,
            },
          ],
        },
      ],
    }
    const { notes } = await buildCvAudit({ ...base, content: holes, facts: [], llm: null })
    expect(notes.find((note) => note.field === "s2:j1:role")?.category).toBe("seniority")
    expect(notes.find((note) => note.field === "s2:j1:dates")?.anchor).toBe("empty")
    expect(notes.find((note) => note.field === "header:phone")?.anchor).toBe("empty")
    expect(notes.find((note) => note.quote === "[liczba]")?.severity).toBe(5)
  })

  it("does not call an offer phrase missing when the CV says it in Polish", () => {
    const facts = demandFromOffers({
      roles: [
        { phrase: "Head of Engineering", offers: offers(50, 31, "We need budget ownership.") },
      ],
      profileText: "Odpowiadałem za budżet działu.",
    })
    expect(facts.find((fact) => fact.id.endsWith(":budget-ownership"))?.qualifies).toBe(false)
  })

  it("keeps what the model got right and refuses invented text and numbers", async () => {
    const facts = demandFromOffers({
      roles: [
        { phrase: "Head of Engineering", offers: offers(50, 31, "We need budget ownership.") },
      ],
      profileText: "TypeScript",
    })
    const budget = facts.find((fact) => fact.id.endsWith(":budget-ownership"))!
    const audit = await buildCvAudit({
      ...base,
      content,
      facts,
      llm: llm({
        summary: "Wynik 100. Wszystko gra w 99% ofert.",
        notes: [
          {
            category: "vague",
            field: "s2:j1:bullet:1",
            quote: "Rozwój systemu płatności.",
            why: "To nazwa czynności, nie efekt.",
            rewrite: "Skróciłem rozliczenia w systemie płatności o [liczba] dni.",
            factId: null,
            severity: 4,
          },
          {
            category: "vague",
            field: "s2:j1:bullet:1",
            quote: "systemu",
            why: "Ta uwaga nachodzi na poprzednią, więc jest zbędna.",
            rewrite: null,
            severity: 3,
          },
          {
            category: "seniority",
            field: "s2:j2:role",
            quote: "Developer",
            why: "Tu nie widać zakresu tej roli.",
            rewrite: "Developer, zespół 40 osób",
            severity: 3,
          },
          {
            category: "vague",
            field: "s2:j1:company",
            quote: "not in the CV",
            why: "Cytat, którego nie ma w tekście.",
            rewrite: "pwned",
            severity: 5,
          },
          {
            category: "vague",
            field: "s9:nope",
            quote: "Acme",
            why: "Pole, którego nie ma w CV.",
            rewrite: "pwned",
            severity: 5,
          },
          {
            category: "gaps",
            field: "s2:j1:company",
            quote: "Acme",
            why: "Rekruterzy odrzucają 80% takich wpisów.",
            rewrite: null,
            severity: 5,
          },
          {
            category: "keywords",
            field: "s1:k1:text",
            quote: "TypeScript",
            why: "99 ofert tego chce.",
            rewrite: "TypeScript, budżet",
            factId: budget.id,
            severity: 1,
          },
          {
            category: "keywords",
            field: "s1:k1:text",
            quote: "Node.js",
            why: "Bez faktu.",
            rewrite: "Deno",
            factId: "missing",
            severity: 5,
          },
        ],
      }),
    })
    expect(audit.usedModel).toBe(true)
    expect(JSON.stringify(audit.notes)).not.toMatch(/pwned|80%|99|Deno|not in the CV/)
    expect(audit.summary).not.toMatch(/99%|Wynik 100/)

    const written = audit.notes.find((note) => note.field === "s2:j1:bullet:1")
    expect(written?.rewrite).toContain("[liczba]")
    expect(audit.notes.filter((note) => note.field === "s2:j1:bullet:1")).toHaveLength(1)

    const invented = audit.notes.find((note) => note.field === "s2:j2:role")
    expect(invented?.why).toBe("Tu nie widać zakresu tej roli.")
    expect(invented?.rewrite).toBeNull()

    const keyword = audit.notes.find((note) => note.factId === budget.id)
    expect(keyword?.severity).toBe(5)
    expect(keyword?.why).toContain("62% przypadków (31 z 50)")
    expect(keyword?.quote).toBe("TypeScript")

    for (const note of audit.notes) expect(locateNote(content, note)).not.toBeNull()

    // the model has spoken about the wording, so the generic rule remarks stay out
    expect(audit.notes.some((note) => note.why.startsWith("To nazwa czynności, a nie efekt"))).toBe(
      false
    )
    expect(audit.notes.some((note) => note.why.includes("Daty przeskakują"))).toBe(true)
  })

  it("uses the generic remarks when the model answered with nothing usable", async () => {
    const audit = await buildCvAudit({
      ...base,
      content,
      facts: [],
      llm: llm({ notes: [{ category: "vague", field: "nope", quote: "x", why: "y" }] }),
    })
    expect(audit.notes.some((note) => note.why.startsWith("To nazwa czynności, a nie efekt"))).toBe(
      true
    )
  })

  it("falls back to the rules when the model call fails", async () => {
    const failing = {
      model: "test",
      async completeJson() {
        throw new Error("down")
      },
    } as unknown as LlmClient
    const audit = await buildCvAudit({ ...base, content, facts: [], llm: failing })
    expect(audit.usedModel).toBe(false)
    expect(audit.notes.length).toBeGreaterThan(0)
  })

  it("carries skipped notes over to the next audit and keeps the previous score", async () => {
    const first = await buildCvAudit({ ...base, content, facts: [], llm: null })
    const skipped = first.notes[0].id
    const second = await buildCvAudit({
      ...base,
      content,
      facts: [],
      llm: null,
      previousScore: first.score,
      dismissed: [skipped, "gone"],
    })
    expect(second.notes[0].id).toBe(skipped)
    expect(second.dismissed).toEqual([skipped])
    expect(second.previousScore).toBe(first.score)
  })

  it("caps the notes so a CV does not drown in comments", async () => {
    const many: CvContent = {
      ...content,
      sections: [
        {
          id: "s2",
          type: "experience",
          title: "Doświadczenie",
          items: Array.from({ length: 30 }, (_, index) => ({
            id: `j${index}`,
            company: "Acme",
            role: "Lead",
            dates: "",
            summary: "",
            bullets: ["Odpowiedzialny za różne rzeczy."],
            tech: "",
            compact: false,
          })),
        },
      ],
    }
    const audit = await buildCvAudit({ ...base, content: many, facts: [], llm: null })
    expect(audit.notes.length).toBeLessThanOrEqual(12)
    expect(audit.notes[0].severity).toBeGreaterThanOrEqual(
      audit.notes[audit.notes.length - 1].severity
    )
  })
})
