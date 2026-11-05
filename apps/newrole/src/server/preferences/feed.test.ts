import { describe, expect, it } from "vitest"
import { scoreForFeed } from "./feed"
import { modelFromRows, type FeedbackRow } from "./model"
import type { Locale, OfferForScoring } from "./types"

const now = new Date("2026-10-28T12:00:00Z")

function offer(id: string, partial: Partial<OfferForScoring> = {}): OfferForScoring {
  return {
    id,
    title: "Kotlin Developer",
    description: "Kotlin, AWS. Fintech.",
    company: "Acme",
    locationText: "Remote",
    countryCode: "PL",
    workplaceType: "REMOTE",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    seniorityLevel: "senior",
    employmentType: null,
    ...partial,
  }
}

function liked(id: string): FeedbackRow {
  return {
    jobId: id,
    verdict: "LIKE",
    aspects: [],
    tags: ["Kotlin", "100% zdalnie"],
    muted: [],
    updatedAt: now,
    offer: offer(id),
  }
}

function feedReasons(modelLocale: Locale, pageLocale: Locale): string[] {
  // the model's locale comes from User.locale; the page's from the request
  const model = modelFromRows({
    userId: 1,
    locale: modelLocale,
    now,
    rows: [liked("a"), liked("b")],
  })
  const score = scoreForFeed({
    offer: offer("x", { company: "Delta" }),
    signals: null,
    profile: null,
    model,
    firstSeenAt: null,
    publishedAt: null,
    sourceKind: "company-site",
    provider: null,
    locale: pageLocale,
    now,
  })
  return score.reasons.filter((reason) => reason.origin === "feedback").map((reason) => reason.text)
}

describe("feed reasons", () => {
  it("speaks the page's language when the account's locale is English", () => {
    const reasons = feedReasons("en", "pl")
    expect(reasons.length).toBeGreaterThan(0)
    expect(reasons[0]).toMatch(/^Podobne do polubion/)
  })

  it("speaks English on an English page whatever the account says", () => {
    const reasons = feedReasons("pl", "en")
    expect(reasons.length).toBeGreaterThan(0)
    expect(reasons[0]).toMatch(/you liked/)
  })
})
