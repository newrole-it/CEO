import { describe, expect, it } from "vitest"
import { offerText, profileOffer } from "./facts"
import { modelFromRows } from "./model"
import { poolTerms, rankCandidates, related, similarity, type Seed } from "./similar"
import type { OfferForScoring } from "./types"

function offer(
  id: string,
  partial: Partial<OfferForScoring> = {}
): OfferForScoring & {
  id: string
  url: string
  salaryLabel: string | null
} {
  return {
    id,
    title: "Senior Kotlin Developer",
    description: "Kotlin, Spring Boot, AWS. Fintech.",
    company: "Acme",
    locationText: "Warszawa",
    countryCode: "PL",
    workplaceType: "REMOTE",
    salaryMin: 25000,
    salaryMax: 30000,
    salaryCurrency: "PLN",
    seniorityLevel: "senior",
    employmentType: null,
    url: `https://example.com/${id}`,
    salaryLabel: null,
    ...partial,
  }
}

function seed(partial: Partial<OfferForScoring> = {}, aspects: Seed["aspects"] = []): Seed {
  const source = offer("seed", partial)
  return {
    jobId: "seed",
    title: source.title,
    company: source.company,
    companyId: "c-acme",
    offer: profileOffer(source),
    weight: 1,
    aspects,
    tagKeys: [],
  }
}

const candidates = [
  offer("same", { company: "Beta" }),
  offer("kotlin-hybrid", {
    title: "Kotlin Engineer",
    company: "Gamma",
    workplaceType: "HYBRID",
    salaryMin: null,
    salaryMax: null,
  }),
  offer("android", {
    title: "Android Developer",
    description: "Kotlin, Android",
    company: "Delta",
  }),
  offer("php", {
    title: "PHP Developer",
    description: "PHP, Laravel",
    company: "Eps",
    workplaceType: "ONSITE",
  }),
  offer("accountant", {
    title: "Accountant",
    description: "Excel",
    company: "Acme",
    workplaceType: "ONSITE",
    seniorityLevel: null,
  }),
  offer("same-dup", { company: "Beta", locationText: "Kraków" }),
]

describe("similar offers", () => {
  it("scores the closest offer highest and explains it", () => {
    const base = seed()
    const scores = candidates.map((item) => {
      const profile = profileOffer(item)
      return { id: item.id, ...similarity(base, profile, offerText(item)) }
    })
    const byId = Object.fromEntries(scores.map((item) => [item.id, item]))
    expect(byId.same.score).toBeGreaterThan(byId["kotlin-hybrid"].score)
    expect(byId["kotlin-hybrid"].score).toBeGreaterThan(byId.php.score)
    expect(byId.same.reasons.map((reason) => reason.pl)).toEqual(
      expect.arrayContaining(["Podobne stanowisko"])
    )
  })

  it("requires a real link to the seed", () => {
    const base = seed()
    expect(related(base, profileOffer(candidates[0]))).toBe(true)
    expect(related(base, profileOffer(candidates[4]))).toBe(false)
  })

  it("weights up the aspects the person said they liked", () => {
    const plain = seed()
    const remoteFan = seed({}, ["remote"])
    const candidate = profileOffer(
      offer("x", { title: "Java Developer", description: "Java", company: "Z" })
    )
    const text = offerText(offer("x"))
    expect(similarity(remoteFan, candidate, text).score).toBeGreaterThan(
      similarity(plain, candidate, text).score
    )
  })

  it("ranks, drops weak or duplicate offers and applies passes", () => {
    const now = new Date("2026-10-28T12:00:00Z")
    const model = modelFromRows({
      userId: 1,
      locale: "pl",
      now,
      rows: [
        {
          jobId: "old-android",
          verdict: "DISLIKE",
          aspects: [],
          tags: ["Android"],
          muted: [],
          updatedAt: now,
          offer: offer("old-android", {
            title: "Android Developer",
            description: "Android",
            company: "Delta",
          }),
        },
      ],
    })
    const ranked = rankCandidates({ seeds: [seed()], candidates, model, locale: "pl", limit: 10 })
    const ids = ranked.map((item) => item.id)
    expect(ids[0]).toBe("same")
    expect(ids).not.toContain("same-dup")
    expect(ids).not.toContain("accountant")
    const android = ranked.find((item) => item.id === "android")
    if (android) {
      expect(android.reasons.some((reason) => reason.startsWith("Podobne do odrzucon"))).toBe(true)
    }
    expect(ranked.every((item) => item.score >= 1 && item.score <= 100)).toBe(true)
    expect(ranked[0]).toMatchObject({ workplace: "remote", url: "https://example.com/same" })
  })

  it("narrows the pool with specific title words first", () => {
    const terms = poolTerms([seed({ title: "Senior Data Engineer" })])
    expect(terms.title[0]).toBe("data")
    expect(terms.title).toContain("engineer")
    expect(terms.title).not.toContain("senior")
  })
})
