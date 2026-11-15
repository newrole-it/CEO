import { describe, expect, it } from "vitest"
import {
  checkStoryDrafts,
  cleanStory,
  cleanThemes,
  missingParts,
  StoryDraftReply,
  unbackedFigures,
} from "./stories"

const EVIDENCE = `Jan Kowalski
DOŚWIADCZENIE
Acme · Senior Backend Engineer (2020 – 2023)
- Przeniosłem rozliczenia z monolitu do usług w Kotlinie i Kafce, bez przestoju.
- Skróciłem czas wdrożenia z 40 minut do 6 minut.
- Prowadziłem zespół 5 osób.`

const reply = (stories: unknown[]) => StoryDraftReply.parse({ stories })

const grounded = {
  title: "Migracja rozliczeń bez przestoju",
  source: "Acme · Senior Backend Engineer",
  evidence: "Przeniosłem rozliczenia z monolitu do usług w Kotlinie i Kafce, bez przestoju",
  situation: "Rozliczenia działały w monolicie.",
  task: "Miałem przenieść je do usług.",
  action: "Przeniosłem rozliczenia do usług w Kotlinie i Kafce.",
  result: "Migracja odbyła się bez przestoju.",
  resultEvidence: "bez przestoju",
  themes: ["migracja", "Migracja", "decyzja techniczna"],
  questions: ["Ile trwała migracja?"],
}

describe("checkStoryDrafts", () => {
  it("keeps a draft whose experience and result are in the person's data", () => {
    const { drafts, dropped } = checkStoryDrafts(reply([grounded]), EVIDENCE)
    expect(dropped).toBe(0)
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      title: "Migracja rozliczeń bez przestoju",
      source: "Acme · Senior Backend Engineer",
      result: "Migracja odbyła się bez przestoju.",
      reflection: "",
      themes: ["migracja", "decyzja techniczna"],
    })
    expect(drafts[0].checks.removed).toEqual([])
    expect(drafts[0].checks.questions).toEqual(["Ile trwała migracja?"])
  })

  it("drops a draft whose evidence is not in the data", () => {
    const invented = { ...grounded, evidence: "Zbudowałem platformę płatności dla banku" }
    expect(checkStoryDrafts(reply([invented]), EVIDENCE)).toEqual({ drafts: [], dropped: 1 })
  })

  it("takes out a sentence with a number the data does not have, and says which", () => {
    const draft = {
      ...grounded,
      action: "Przeniosłem rozliczenia do usług. Obsłużyłem przy tym 300 klientów.",
    }
    const { drafts } = checkStoryDrafts(reply([draft]), EVIDENCE)
    expect(drafts[0].action).toBe("Przeniosłem rozliczenia do usług.")
    expect(drafts[0].checks.removed).toEqual([{ part: "action", kind: "number", value: "300" }])
  })

  it("takes out a sentence naming a tool the data does not have", () => {
    const draft = {
      ...grounded,
      action: "Przeniosłem rozliczenia do usług. Postawiłem klaster na Kubernetes i gRPC.",
    }
    const { drafts } = checkStoryDrafts(reply([draft]), EVIDENCE)
    expect(drafts[0].action).toBe("Przeniosłem rozliczenia do usług.")
    expect(drafts[0].checks.removed.map((item) => item.value)).toContain("gRPC")
  })

  it("leaves the result empty when no fragment of the data states it", () => {
    const draft = {
      ...grounded,
      result: "Zespół pracował szybciej i klienci byli zadowoleni.",
      resultEvidence: "klienci byli zadowoleni",
    }
    const { drafts } = checkStoryDrafts(reply([draft]), EVIDENCE)
    expect(drafts[0].result).toBe("")
    expect(missingParts(drafts[0])).toEqual(["result", "reflection"])
  })

  it("never keeps a reflection the model wrote", () => {
    const draft = { ...grounded, reflection: "Nauczyłem się planować migracje." }
    const { drafts } = checkStoryDrafts(reply([draft]), EVIDENCE)
    expect(drafts[0].reflection).toBe("")
  })

  it("drops a draft whose title names what the data does not have", () => {
    const draft = { ...grounded, title: "Migracja 12 systemów do Kubernetes" }
    expect(checkStoryDrafts(reply([draft]), EVIDENCE).dropped).toBe(1)
  })

  it("drops a made-up source and keeps the story", () => {
    const draft = { ...grounded, source: "Globex · Head of Engineering" }
    expect(checkStoryDrafts(reply([draft]), EVIDENCE).drafts[0].source).toBe("")
  })

  it("skips a title that is already in the bank, and a repeat within the reply", () => {
    const bank = ["migracja rozliczeń, bez przestoju"]
    expect(checkStoryDrafts(reply([grounded]), EVIDENCE, bank).drafts).toEqual([])
    expect(checkStoryDrafts(reply([grounded, grounded]), EVIDENCE).drafts).toHaveLength(1)
  })

  it("drops a draft with nothing left after the check", () => {
    const draft = {
      ...grounded,
      situation: "W 2019 było 900 błędów.",
      action: "Wdrożyłem Terraform na 70 serwerach.",
    }
    expect(checkStoryDrafts(reply([draft]), EVIDENCE)).toEqual({ drafts: [], dropped: 1 })
  })

  it("reads a reply with broken parts as far as it can", () => {
    const parsed = StoryDraftReply.parse({ stories: [{ title: "T", themes: "x", questions: 3 }] })
    expect(parsed.stories[0]).toMatchObject({ title: "T", themes: [], questions: [] })
    expect(StoryDraftReply.parse({ stories: "none" }).stories).toEqual([])
  })
})

describe("stories", () => {
  it("cleans a story's fields", () => {
    const story = cleanStory({
      title: "  Tytuł \n z przerwą ",
      action: "Zrobiłem  to.\n\n\n\nPotem tamto.",
      themes: ["a", " A ", "", 4, "b"],
      source: undefined,
    })
    expect(story.title).toBe("Tytuł z przerwą")
    expect(story.action).toBe("Zrobiłem to.\n\nPotem tamto.")
    expect(story.themes).toEqual(["a", "b"])
    expect(story.source).toBe("")
    expect(cleanThemes("nope")).toEqual([])
  })

  it("names the numbers of a story that the person's data does not have", () => {
    const story = cleanStory({
      title: "x",
      action: "Skróciłem wdrożenie z 40 do 6 minut.",
      result: "Koszt spadł o 30 %.",
    })
    expect(unbackedFigures(story, EVIDENCE)).toEqual(["30"])
  })
})
