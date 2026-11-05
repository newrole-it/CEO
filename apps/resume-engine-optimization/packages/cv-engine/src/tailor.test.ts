import { describe, expect, it } from "vitest"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import { letterSection } from "@newrole/cv-core/schema"
import { OFFER_TEXT_LIMIT } from "@newrole/cv-core/tailor"
import type { LlmClient } from "@newrole/llm/common"
import {
  coverLetterLanguage,
  tailorCv,
  tailoredCvLanguage,
  writeCoverLetter,
  type TailorOffer,
} from "./tailor"

type Call = { purpose: string; system: string; user: string; userId?: number }

function fakeLlm(...replies: unknown[]): LlmClient & { calls: Call[] } {
  const calls: Call[] = []
  return {
    model: "fake",
    calls,
    async completeJson(args) {
      calls.push({
        purpose: args.purpose,
        system: args.system,
        user: args.user,
        userId: args.userId,
      })
      const data = replies[Math.min(calls.length - 1, replies.length - 1)]
      if (data == null) return null
      return { data: args.schema.parse(data), tokenInput: 0, tokenOutput: 0, cached: false }
    },
    async completeText() {
      return null
    },
  }
}

const offer: TailorOffer = {
  company: "Acme",
  title: "Staff Engineer",
  location: "Warszawa",
  text: "Wymagamy Kubernetes i Go.",
  origin: "full",
}

const reply = {
  headline: "Platform Engineering Lead",
  sections: [{ id: "profile", body: "Buduję platformy dla dużych zespołów." }],
  changes: ["Ustawiłem profil pod platformy."],
  gaps: ["Go"],
}

describe("tailorCv", () => {
  it("merges the model's wording into the base CV and keeps the facts", async () => {
    const base = syntheticCv(2)
    const llm = fakeLlm(reply)
    const result = await tailorCv({
      llm,
      base: { content: base, language: "pl" },
      offer,
      language: "pl",
      context: "",
      userId: 7,
    })
    expect(result?.content.header.headline).toBe("Platform Engineering Lead")
    expect(result?.content.header.email).toBe(base.header.email)
    expect(result?.notes).toMatchObject({
      gaps: ["Go"],
      usedJobText: true,
      offerText: { origin: "full", chars: offer.text.length, note: false },
    })
    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]).toMatchObject({ purpose: "cv-tailor", userId: 7 })
    expect(llm.calls[0].user).toContain("<untrusted_job_text>\nWymagamy Kubernetes i Go.")
    expect(llm.calls[0].user).not.toMatch(/Attempt/)
    expect(llm.calls[0].system).not.toMatch(/This CV changes language/)
  })

  it("asks to translate when the language changes and names another attempt", async () => {
    const llm = fakeLlm(reply)
    await tailorCv({
      llm,
      base: { content: syntheticCv(2), language: "pl" },
      offer,
      language: "en",
      locale: "en",
      context: "",
      attempt: 3,
    })
    expect(llm.calls[0].system).toMatch(/This CV changes language/)
    expect(llm.calls[0].user).toContain('Language for "changes" and "gaps": en')
    expect(llm.calls[0].user).toMatch(/Attempt 3: the candidate asked for another take/)
  })

  it("reads at most OFFER_TEXT_LIMIT of the offer and keeps the candidate's note apart", async () => {
    const llm = fakeLlm(reply)
    const result = await tailorCv({
      llm,
      base: { content: syntheticCv(2), language: "pl" },
      offer: { ...offer, text: "x".repeat(OFFER_TEXT_LIMIT + 500) },
      language: "pl",
      context: "",
      note: "Podkreśl Kubernetes",
    })
    const sent = llm.calls[0].user.match(/x{100,}/g)?.join("") ?? ""
    expect(sent.length).toBe(OFFER_TEXT_LIMIT)
    expect(llm.calls[0].user).toContain("<untrusted_candidate_note>\nPodkreśl Kubernetes")
    expect(result?.notes.offerText?.note).toBe(true)
  })

  it("returns null when the model gives nothing usable", async () => {
    const base = { content: syntheticCv(2), language: "pl" as const }
    const none = await tailorCv({ llm: fakeLlm(null), base, offer, language: "pl", context: "" })
    expect(none).toBeNull()
  })
})

describe("writeCoverLetter", () => {
  it("lays the paragraphs out on the CV's sheet and flags facts the CV does not have", async () => {
    const llm = fakeLlm({
      paragraphs: [
        "Piszę w sprawie roli Staff Engineer.",
        "Skróciłem wdrożenia o 73% w Kubernetes.",
      ],
    })
    const cv = syntheticCv(1)
    const result = await writeCoverLetter({ llm, cv, offer, language: "pl", context: "" })
    const section = result ? letterSection(result.content) : null
    expect(section?.paragraphs[0]).toBe("Piszę w sprawie roli Staff Engineer.")
    expect(result?.content.header.name).toBe(cv.header.name)
    expect(result?.notes.unverified).toContain("73")
    expect(llm.calls[0]).toMatchObject({ purpose: "cover-letter" })
    expect(llm.calls[0].user).toMatch(/^Write in: Polish/)
  })

  it("returns null without a reply", async () => {
    const result = await writeCoverLetter({
      llm: fakeLlm(null),
      cv: syntheticCv(1),
      offer,
      language: "en",
      context: "",
    })
    expect(result).toBeNull()
  })
})

describe("the language of what is written", () => {
  it("keeps the CV's language once it has one, else follows the offer", () => {
    expect(tailoredCvLanguage({ existing: null, offer: "en" })).toBe("en")
    expect(tailoredCvLanguage({ existing: { language: "pl" }, offer: "en" })).toBe("pl")
    expect(tailoredCvLanguage({ requested: "pl", existing: { language: "en" }, offer: "en" })).toBe(
      "pl"
    )
  })

  it("writes a letter in the letter's language, else the tailored CV's, else the offer's", () => {
    expect(coverLetterLanguage({ letter: null, cv: null, offer: "pl" })).toBe("pl")
    expect(coverLetterLanguage({ letter: null, cv: { language: "en" }, offer: "pl" })).toBe("en")
    expect(
      coverLetterLanguage({ letter: { language: "pl" }, cv: { language: "en" }, offer: "en" })
    ).toBe("pl")
  })
})
