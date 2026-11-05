import { describe, expect, it } from "vitest"
import { profileOffer } from "./facts"
import {
  DELTA_CAP,
  IMPLICIT_WEIGHT,
  TAG_WEIGHT,
  clampDelta,
  modelFromRows,
  preferenceAdjustment,
  rowContributions,
  summarizeModel,
  type FeedbackRow,
} from "./model"
import type { OfferForScoring } from "./types"

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

function row(
  id: string,
  verdict: FeedbackRow["verdict"],
  partial: Partial<FeedbackRow> = {}
): FeedbackRow {
  return {
    jobId: id,
    verdict,
    aspects: [],
    tags: [],
    muted: [],
    updatedAt: now,
    offer: offer(id),
    ...partial,
  }
}

describe("row contributions", () => {
  it("learns a little from everything when nothing was picked", () => {
    const facts = profileOffer(offer("a"))
    const items = rowContributions({ aspects: [], tags: [], muted: [] }, facts)
    expect(items.length).toBe(facts.facts.length)
    expect(items.every((item) => item.weight === IMPLICIT_WEIGHT)).toBe(true)
  })

  it("learns picked tags fully, picked aspects partly, and nothing else", () => {
    const facts = profileOffer(offer("a"))
    const items = rowContributions({ aspects: ["remote"], tags: ["Kotlin"], muted: [] }, facts)
    const keys = Object.fromEntries(items.map((item) => [item.fact.key, item.weight]))
    expect(keys["skill:kotlin"]).toBe(TAG_WEIGHT)
    expect(keys["work:remote"]).toBeGreaterThan(0)
    expect(keys["skill:aws"]).toBeUndefined()
    expect(keys["company:acme"]).toBeUndefined()
  })

  it("never learns a muted key", () => {
    const facts = profileOffer(offer("a"))
    const items = rowContributions({ aspects: [], tags: [], muted: ["skill:kotlin"] }, facts)
    expect(items.some((item) => item.fact.key === "skill:kotlin")).toBe(false)
  })
})

describe("preference model", () => {
  it("turns likes into positive and passes into negative signals", () => {
    const model = modelFromRows({
      userId: 1,
      locale: "pl",
      now,
      rows: [
        row("a", "LIKE", { tags: ["Kotlin", "100% zdalnie"], aspects: ["stack", "remote"] }),
        row("b", "DISLIKE", {
          offer: offer("b", {
            title: "PHP Developer",
            description: "PHP, Laravel",
            company: "Other",
            workplaceType: "ONSITE",
            locationText: "Kraków",
          }),
          tags: ["PHP"],
        }),
      ],
    })
    const strength = (key: string) => model.signals.find((signal) => signal.key === key)?.strength
    expect(strength("skill:kotlin")).toBeGreaterThan(0.4)
    expect(strength("work:remote")).toBeGreaterThan(0.4)
    expect(strength("skill:php")).toBeLessThan(-0.4)
    expect(model.aspects.stack).toBeGreaterThan(0)
    expect(model.liked).toBe(1)
    expect(model.disliked).toBe(1)
    expect(model.decided.has("a") && model.decided.has("b")).toBe(true)
  })

  it("lets old feedback fade", () => {
    const old = modelFromRows({
      userId: 1,
      locale: "pl",
      now,
      rows: [row("a", "LIKE", { tags: ["Kotlin"], updatedAt: new Date("2026-04-01T00:00:00Z") })],
    })
    const fresh = modelFromRows({
      userId: 1,
      locale: "pl",
      now,
      rows: [row("a", "LIKE", { tags: ["Kotlin"] })],
    })
    const kotlin = (model: typeof old) =>
      model.signals.find((s) => s.key === "skill:kotlin")!.strength
    expect(kotlin(old)).toBeLessThan(kotlin(fresh))
  })

  it("adds profile signals that only fill gaps", () => {
    const model = modelFromRows({
      userId: 1,
      locale: "pl",
      now,
      rows: [row("a", "LIKE", { tags: ["Kotlin"] })],
      profile: {
        skills: ["Kotlin", "Rust"],
        industries: ["fintech"],
        seniority: "senior",
        remotePreference: "remote",
        homeCity: "Warszawa",
        locations: [],
      },
    })
    const kotlin = model.signals.filter((signal) => signal.key === "skill:kotlin")
    expect(kotlin).toHaveLength(1)
    expect(kotlin[0].source).toBe("feedback")
    expect(model.signals.find((signal) => signal.key === "skill:rust")?.source).toBe("profile")
  })
})

describe("preference adjustment", () => {
  const model = modelFromRows({
    userId: 1,
    locale: "pl",
    now,
    rows: [
      row("a", "LIKE", { tags: ["Kotlin", "100% zdalnie"] }),
      row("b", "LIKE", { offer: offer("b", { title: "Senior Kotlin Engineer", company: "Beta" }) }),
      row("c", "DISLIKE", {
        offer: offer("c", {
          title: "PHP Developer",
          description: "PHP",
          company: "Gamma",
          workplaceType: "ONSITE",
          locationText: "Kraków",
        }),
        tags: ["PHP", "Stacjonarnie"],
      }),
    ],
  })

  it("lifts a similar offer and explains why in Polish and English", () => {
    const result = preferenceAdjustment(model, offer("x", { company: "Delta" }))
    expect(result.delta).toBeGreaterThan(0)
    expect(result.delta).toBeLessThanOrEqual(DELTA_CAP)
    expect(result.reasons[0]).toMatch(/^Podobne do polubion/)
    expect(result.reasons[0]).toContain("Kotlin")
    expect(result.reasonsI18n[0].en).toMatch(/you liked/)
    expect(result.signs[0]).toBe(1)
  })

  it("sinks an offer like the ones passed on", () => {
    const result = preferenceAdjustment(
      model,
      offer("y", {
        title: "PHP Developer",
        description: "PHP",
        company: "Zeta",
        workplaceType: "ONSITE",
        locationText: "Kraków",
      })
    )
    expect(result.delta).toBeLessThan(0)
    expect(result.delta).toBeGreaterThanOrEqual(-DELTA_CAP)
    expect(result.reasons[0]).toMatch(/^Podobne do odrzucon/)
    expect(result.signs[0]).toBe(-1)
  })

  it("leaves an unrelated offer alone", () => {
    const result = preferenceAdjustment(
      model,
      offer("z", {
        title: "Accountant",
        description: "",
        company: "Omega",
        workplaceType: "UNKNOWN",
        locationText: "",
        seniorityLevel: null,
      })
    )
    expect(result).toEqual({ delta: 0, reasons: [], reasonsI18n: [], signs: [] })
  })

  it("stays within ±12 however much feedback piles up", () => {
    const rows = Array.from({ length: 80 }, (_, i) =>
      row(`l${i}`, "APPLIED", {
        tags: ["Kotlin", "AWS", "100% zdalnie", "fintech", "Acme"],
        aspects: ["stack", "remote", "company"],
      })
    )
    const heavy = modelFromRows({ userId: 1, locale: "en", now, rows })
    const result = preferenceAdjustment(heavy, offer("q"))
    expect(result.delta).toBeGreaterThanOrEqual(DELTA_CAP - 1)
    expect(result.delta).toBeLessThanOrEqual(DELTA_CAP)
    expect(result.reasons[0]).toMatch(/^Like offers you liked/)
    const negative = modelFromRows({
      userId: 1,
      locale: "pl",
      now,
      rows: rows.map((item) => ({ ...item, verdict: "DISLIKE" as const })),
    })
    const down = preferenceAdjustment(negative, offer("q")).delta
    expect(down).toBeLessThanOrEqual(-8)
    expect(down).toBeGreaterThanOrEqual(-DELTA_CAP)
  })

  it("is deterministic", () => {
    const a = preferenceAdjustment(model, offer("x", { company: "Delta" }))
    const b = preferenceAdjustment(model, offer("x", { company: "Delta" }))
    expect(a).toEqual(b)
  })

  it("clamps any number into the band", () => {
    expect(clampDelta(40)).toBe(12)
    expect(clampDelta(-40)).toBe(-12)
    expect(clampDelta(Number.NaN)).toBe(0)
    expect(Object.is(clampDelta(-0.2), 0)).toBe(true)
  })
})

describe("taste summary", () => {
  it("lists liked and passed tags with counts and offers", () => {
    const model = modelFromRows({
      userId: 1,
      locale: "pl",
      now,
      rows: [
        row("a", "LIKE", { tags: ["Kotlin", "100% zdalnie"] }),
        row("b", "LIKE", { tags: ["Kotlin"] }),
        row("c", "DISLIKE", {
          offer: offer("c", { title: "PHP Developer", description: "PHP" }),
          tags: ["PHP"],
        }),
      ],
    })
    const summary = summarizeModel(model, "pl", ["skill:java"])
    const kotlin = summary.taste.find((item) => item.key === "skill:kotlin")!
    expect(kotlin).toMatchObject({
      aspect: "stack",
      tag: "Kotlin",
      sign: 1,
      count: 2,
      removable: true,
    })
    expect(kotlin.jobIds).toEqual(["a", "b"])
    const php = summary.dislikes.find((item) => item.key === "skill:php")!
    expect(php).toMatchObject({ sign: -1, count: 1, jobIds: ["c"] })
    expect(summary.text).toMatch(/^Lubisz: /)
    expect(summary.text).toContain("Kotlin")
    expect(summary.muted).toEqual(["skill:java"])
  })

  it("has no text before any feedback", () => {
    const summary = summarizeModel(modelFromRows({ userId: 1, locale: "en", now, rows: [] }))
    expect(summary.text).toBeNull()
    expect(summary.taste).toEqual([])
  })
})
