import { describe, expect, it } from "vitest"
import { syntheticCv } from "./fixtures"
import type { CvContent, CvExperienceSection, CvSection } from "./schema"
import {
  applyTailoring,
  cvForModel,
  mentionsTerm,
  TailorReply,
  unverifiedNumbers,
  unverifiedTerms,
} from "./tailor"
import { cvPlainText } from "./text"

const base = (): CvContent => syntheticCv(3)
const evidence = (content: CvContent) => cvPlainText(content)

function reply(partial: Partial<TailorReply>): TailorReply {
  return { sections: [], changes: [], gaps: [], keywords: [], ...partial }
}

function tailor(content: CvContent, partial: Partial<TailorReply>, translateTo?: "pl" | "en") {
  const result = applyTailoring(content, reply(partial), {
    evidence: evidence(content),
    translateTo,
  })
  if (!result) throw new Error("not a valid CV")
  return result
}

const section = (content: CvContent, id: string): CvSection => {
  const found = content.sections.find((entry) => entry.id === id)
  if (!found) throw new Error(`no section ${id}`)
  return found
}
const experience = (content: CvContent) => section(content, "experience") as CvExperienceSection

describe("applyTailoring", () => {
  it("leaves the CV as it is when the model proposes nothing", () => {
    const content = base()
    expect(tailor(content, {}).content).toEqual(content)
  })

  it("never lets the model change identity: contact details, company, role, dates, school", () => {
    const content = base()
    const job = experience(content).items[0]
    const { content: result } = tailor(content, {
      sections: [
        {
          id: "experience",
          items: [
            {
              id: job.id,
              role: "CTO",
              dates: "2001 - 2030",
              summary: "Nowe podsumowanie.",
              // the reply schema has no such field, the merge must not care
              ...({ company: "Google" } as object),
            },
          ],
        },
        {
          id: "education",
          items: [{ id: "e1", degree: "Doktor", ...({ school: "MIT" } as object) }],
        },
      ],
    })
    const merged = experience(result).items[0]
    expect(merged.company).toBe(job.company)
    expect(merged.role).toBe(job.role)
    expect(merged.dates).toBe(job.dates)
    expect(merged.summary).toBe("Nowe podsumowanie.")
    expect(result.header.email).toBe(content.header.email)
    const school = section(result, "education")
    expect(school.type === "education" && school.items[0].school).toBe("Politechnika Przykładowa")
    expect(school.type === "education" && school.items[0].degree).toBe(
      "Magister inżynier, Informatyka"
    )
  })

  it("keeps every role, in its order, even when the reply leaves roles out or reorders them", () => {
    const content = base()
    const ids = experience(content).items.map((item) => item.id)
    const { content: result } = tailor(content, {
      sections: [{ id: "experience", items: [{ id: ids[2], summary: "Tylko ta." }] }],
    })
    expect(experience(result).items.map((item) => item.id)).toEqual(ids)
    expect(experience(result).items[2].summary).toBe("Tylko ta.")
  })

  it("orders sections as proposed and keeps the ones it did not mention, after them", () => {
    const content = base()
    const { content: result } = tailor(content, {
      sections: [{ id: "experience" }, { id: "profile" }],
    })
    const order = result.sections.map((entry) => entry.id)
    expect(order.slice(0, 2)).toEqual(["experience", "profile"])
    expect([...order].sort()).toEqual(content.sections.map((entry) => entry.id).sort())
  })

  it("ignores ids that are not in the CV and a section named twice", () => {
    const content = base()
    const { content: result } = tailor(content, {
      sections: [
        { id: "invented", body: "Nie ma mnie w CV." },
        { id: "profile", body: "Pierwszy." },
        { id: "profile", body: "Drugi." },
      ],
    })
    expect(result.sections.map((entry) => entry.id)).not.toContain("invented")
    const profile = section(result, "profile")
    expect(profile.type === "text" && profile.body).toBe("Pierwszy.")
  })

  it("hides a section instead of deleting it, but never the history of roles", () => {
    const content = base()
    const { content: result } = tailor(content, {
      sections: [
        { id: "projects", hide: true },
        { id: "experience", hide: true },
      ],
    })
    expect(section(result, "projects").hidden).toBe(true)
    expect(section(result, "experience").hidden).toBeFalsy()
  })

  it("drops skills and cards left out, but keeps them all when the reply names none", () => {
    const content = base()
    const { content: result } = tailor(content, {
      sections: [{ id: "skills", items: [{ id: "sk3" }, { id: "sk1" }] }, { id: "projects" }],
    })
    const skills = section(result, "skills")
    expect(skills.type === "skills" && skills.items.map((item) => item.id)).toEqual(["sk3", "sk1"])
    const cards = section(result, "projects")
    expect(cards.type === "cards" && cards.items.length).toBe(2)
  })

  it("keeps the old text of a field that gains a number the person's data does not have", () => {
    const content = base()
    const before = section(content, "profile")
    const result = tailor(content, {
      sections: [{ id: "profile", body: "Zwiększyłem przychody o 47%." }],
    })
    const after = section(result.content, "profile")
    expect(after.type === "text" && before.type === "text" && after.body === before.body).toBe(true)
    expect(result.notes.reverted).toBe(1)
  })

  it("drops only the bullet with a new number and keeps the rest", () => {
    const content = base()
    const job = experience(content).items[0]
    const result = tailor(content, {
      sections: [
        {
          id: "experience",
          items: [{ id: job.id, bullets: ["Skróciłem wdrożenia o 73%.", "Prowadziłem zespół."] }],
        },
      ],
    })
    expect(experience(result.content).items[0].bullets).toEqual(["Prowadziłem zespół."])
    expect(result.notes.reverted).toBe(1)
  })

  it("keeps the old bullets when nothing usable is proposed", () => {
    const content = base()
    const job = experience(content).items[0]
    const result = tailor(content, {
      sections: [{ id: "experience", items: [{ id: job.id, bullets: ["  ", "<b></b>"] }] }],
    })
    expect(experience(result.content).items[0].bullets).toEqual(job.bullets)
  })

  it("splits a summary into bullets and spaces the role as a full entry", () => {
    const content = syntheticCv(5)
    const job = experience(content).items[4]
    expect(job).toMatchObject({ bullets: [], compact: true })
    const result = tailor(content, {
      sections: [
        {
          id: "experience",
          items: [
            {
              id: job.id,
              summary: "Prowadziłem zespół programistów.",
              bullets: [
                "Wspierałem inżynierów w codziennej pracy.",
                "Dostarczałem funkcje produktu.",
              ],
            },
          ],
        },
      ],
    })
    expect(experience(result.content).items[4]).toMatchObject({
      summary: "Prowadziłem zespół programistów.",
      bullets: ["Wspierałem inżynierów w codziennej pracy.", "Dostarczałem funkcje produktu."],
      compact: false,
    })
  })

  it("keeps the whole summary when none of the bullets split from it lands", () => {
    const content = syntheticCv(5)
    const job = experience(content).items[4]
    const result = tailor(content, {
      sections: [
        {
          id: "experience",
          items: [
            {
              id: job.id,
              summary: "Prowadziłem zespół programistów.",
              bullets: ["Zespół urósł o 300%."],
            },
          ],
        },
      ],
    })
    expect(experience(result.content).items[4]).toMatchObject({
      summary: job.summary,
      bullets: [],
      compact: true,
    })
  })

  it("accepts numbers the CV already has, written differently", () => {
    const content = base()
    content.sections[0] = {
      id: "profile",
      type: "text",
      title: "Profil",
      body: "Zespół 1,5 tys. osób od 01.2019.",
    }
    const result = tailor(content, {
      sections: [{ id: "profile", body: "Od 2019 prowadzę zespół 1.5 tys. osób." }],
    })
    const profile = section(result.content, "profile")
    expect(profile.type === "text" && profile.body).toBe("Od 2019 prowadzę zespół 1.5 tys. osób.")
    expect(result.notes.reverted).toBe(0)
  })

  it("removes links the model added and keeps the person's own", () => {
    const content = base()
    content.sections[0] = {
      id: "profile",
      type: "text",
      title: "Profil",
      body: '<a href="https://moj.example/">Portfolio</a>',
    }
    const { content: result } = tailor(content, {
      sections: [
        {
          id: "profile",
          body: '<a href="https://moj.example/">Portfolio</a> i <a href="https://evil.example/x">to</a>',
        },
      ],
    })
    const profile = section(result, "profile")
    expect(profile.type === "text" && profile.body).toBe(
      '<a href="https://moj.example/">Portfolio</a> i to'
    )
  })

  it("strips markup that is not allowed in the CV", () => {
    const content = base()
    const { content: result } = tailor(content, {
      sections: [
        { id: "profile", body: '<script>alert(1)</script><b>Tekst</b><img src=x onerror="y">' },
      ],
    })
    const profile = section(result, "profile")
    expect(profile.type === "text" && profile.body).toBe("<strong>Tekst</strong>")
  })

  it("lists new tool names for the person to check", () => {
    const content = base()
    const result = tailor(content, {
      sections: [
        { id: "profile", body: "Buduję platformy na PostgreSQL i Terraform oraz w Kafka." },
      ],
    })
    expect(result.notes.unverified).toEqual(expect.arrayContaining(["Terraform", "Kafka"]))
    expect(result.notes.unverified).not.toContain("PostgreSQL")
  })

  it("carries the model's notes", () => {
    const result = tailor(base(), { changes: [" Ustawiłem zespół na początku. "], gaps: ["Go"] })
    expect(result.notes.changes).toEqual(["Ustawiłem zespół na początku."])
    expect(result.notes.gaps).toEqual(["Go"])
  })

  it("keeps the photo and consent, and returns null for nothing it cannot store", () => {
    const content = base()
    content.header.photo = "data:image/png;base64,AAAA"
    const { content: result } = tailor(content, { headline: "Nowy nagłówek" })
    expect(result.header.photo).toBe(content.header.photo)
    expect(result.header.headline).toBe("Nowy nagłówek")
    expect(result.consent).toBe(content.consent)
  })

  it("refuses a field that is too long rather than failing the whole CV", () => {
    const content = base()
    const result = tailor(content, { headline: "x".repeat(400) })
    expect(result.content.header.headline).toBe(content.header.headline)
    expect(result.notes.reverted).toBe(1)
  })

  describe("when translating", () => {
    it("takes titles, roles and degrees but not companies or schools", () => {
      const content = base()
      const job = experience(content).items[0]
      const { content: result } = tailor(
        content,
        {
          sections: [
            {
              id: "experience",
              title: "Experience",
              items: [{ id: job.id, role: "Developer", dates: job.dates.replace("–", "to") }],
            },
            { id: "education", title: "Education", items: [{ id: "e1", degree: "MSc" }] },
          ],
        },
        "en"
      )
      const merged = experience(result).items[0]
      expect(experience(result).title).toBe("Experience")
      expect(merged.role).toBe("Developer")
      expect(merged.company).toBe(job.company)
      expect(merged.dates).toBe(job.dates.replace("–", "to"))
      const school = section(result, "education")
      expect(school.type === "education" && school.items[0].degree).toBe("MSc")
      expect(school.type === "education" && school.items[0].school).toBe("Politechnika Przykładowa")
    })

    it("keeps dates whose digits changed", () => {
      const content = base()
      const job = experience(content).items[0]
      const { content: result } = tailor(
        content,
        { sections: [{ id: "experience", items: [{ id: job.id, dates: "2001 – 2030" }] }] },
        "en"
      )
      expect(experience(result).items[0].dates).toBe(job.dates)
    })

    it("switches the consent clause to the new language", () => {
      const { content: result } = tailor(base(), {}, "en")
      expect(result.consent).toContain("I consent")
    })
  })
})

describe("keywords", () => {
  it("says for each of the offer's terms whether the CV has it and whether the person's data backs it", () => {
    const content = base()
    const { notes } = tailor(content, {
      keywords: [
        { term: "PostgreSQL", evidence: "PostgreSQL" },
        { term: "zarządzanie zespołem", evidence: "Prowadziłem zespół programistów" },
        { term: "MongoDB", evidence: "MongoDB" },
        { term: "Terraform", evidence: "" },
      ],
      sections: [
        {
          id: "profile",
          body: "Zarządzam zespołami inżynierskimi i projektuję platformy na PostgreSQL.",
        },
        // the skill with MongoDB left out
        { id: "skills", items: [{ id: "sk1" }, { id: "sk2" }] },
      ],
    })
    expect(notes.keywords).toEqual([
      { term: "PostgreSQL", status: "kept" },
      { term: "zarządzanie zespołem", status: "added" },
      { term: "MongoDB", status: "unplaced" },
      { term: "Terraform", status: "missing" },
    ])
    expect(notes.unverified).toEqual([])
  })

  it("puts a term the CV gained without backing first among the things to check", () => {
    const content = base()
    const { notes } = tailor(content, {
      keywords: [{ term: "Kafka", evidence: "kolejki Kafka w projekcie A" }],
      sections: [{ id: "profile", body: "Projektuję platformy oparte na Kafka i Terraform." }],
    })
    expect(notes.keywords).toEqual([{ term: "Kafka", status: "added" }])
    expect(notes.unverified[0]).toBe("Kafka")
    expect(notes.unverified.filter((term) => term === "Kafka")).toHaveLength(1)
  })

  it("backs a term by the words quoted as evidence, also with the CV's markup", () => {
    const { notes } = tailor(base(), {
      keywords: [
        { term: "ad server", evidence: "<strong>Platforma:</strong> współtworzyłem system" },
      ],
      sections: [{ id: "profile", body: "Współtworzyłem ad server, który obsługuje duży ruch." }],
    })
    expect(notes.keywords).toEqual([{ term: "ad server", status: "added" }])
    expect(notes.unverified).toEqual([])
  })

  it("keeps the first 15 distinct terms", () => {
    const terms = Array.from({ length: 20 }, (_, index) => ({ term: `Narzędzie${index}` }))
    const { notes } = tailor(base(), {
      keywords: [{ term: "PostgreSQL" }, { term: "postgresql" }, ...terms],
    })
    expect(notes.keywords).toHaveLength(15)
    expect(notes.keywords?.filter((item) => item.term.toLowerCase() === "postgresql")).toHaveLength(
      1
    )
  })
})

describe("mentionsTerm", () => {
  it("finds Polish words with another ending", () => {
    expect(mentionsTerm("Zarządzałem zespołem pięciu osób.", "zarządzanie zespołem")).toBe(true)
    expect(mentionsTerm("Pracuję w Reactem i Kafką.", "React")).toBe(true)
  })

  it("needs a tool-shaped or short name whole", () => {
    expect(mentionsTerm("Postgres i Redis", "PostgreSQL")).toBe(false)
    expect(mentionsTerm("Pracowałem w Google.", "Go")).toBe(false)
    expect(mentionsTerm("Backend w Go i Node.js", "Go")).toBe(true)
    expect(mentionsTerm("Backend w Node.js", "node.js")).toBe(true)
    expect(mentionsTerm("C++ i C#", "C#")).toBe(true)
    expect(mentionsTerm("tylko C++", "C")).toBe(false)
    expect(mentionsTerm("CI/CD w GitLab", "CI/CD")).toBe(true)
  })

  it("does not take a different short word for the term", () => {
    expect(mentionsTerm("Chcę dotrzeć do klientów (reach).", "React")).toBe(false)
  })
})

describe("cvForModel", () => {
  it("gives the model no contact details, photo or hidden sections", () => {
    const content = base()
    content.header.photo = "data:image/png;base64,AAAA"
    content.sections[0] = { ...content.sections[0], hidden: true }
    const shown = JSON.stringify(cvForModel(content))
    expect(shown).not.toContain(content.header.email)
    expect(shown).not.toContain("base64")
    expect(shown).not.toContain('"profile"')
  })
})

describe("unverifiedTerms", () => {
  it("finds tool-shaped words anywhere and names inside a sentence", () => {
    const found = unverifiedTerms(["Pisałem w C# i Node.js. Znam Kafka oraz K8s."], "")
    expect(found).toEqual(expect.arrayContaining(["C#", "Node.js", "Kafka", "K8s"]))
  })

  it("ignores ordinary words at the start of a sentence", () => {
    expect(unverifiedTerms(["Prowadziłem zespół. Budowałem systemy."], "")).toEqual([])
  })

  it("matches evidence regardless of case and reports each term once", () => {
    expect(unverifiedTerms(["Znam Kafka, a Kafka to podstawa."], "")).toEqual(["Kafka"])
    expect(unverifiedTerms(["Znam Kafka."], "kafka, redis")).toEqual([])
  })

  it("knows a Polish name in any of its forms", () => {
    expect(unverifiedTerms(["Pracowałem w Przykładowej Firmie."], "Przykładowa Firma 1")).toEqual(
      []
    )
    expect(unverifiedTerms(["Pracowałem w Przykładowej Firmie."], "Inna Spółka")).toEqual([
      "Przykładowej",
      "Firmie",
    ])
  })

  it("wants a tool's exact name, not something like it", () => {
    expect(unverifiedTerms(["Znam K8s."], "K8 i K9")).toEqual(["K8s"])
  })

  it("checks only tool-shaped words in a translation, where every word is new", () => {
    expect(
      unverifiedTerms(["I led the Platform team with Kubernetes and AWS."], "", {
        translated: true,
      })
    ).toEqual(["AWS"])
  })
})

describe("unverifiedNumbers", () => {
  it("lists numbers the evidence does not have", () => {
    expect(unverifiedNumbers(["Zespół 12 osób, od 2019, 47% więcej."], "2019 12")).toEqual(["47"])
  })
})
