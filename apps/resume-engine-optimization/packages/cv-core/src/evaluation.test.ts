import { describe, expect, it } from "vitest"
import {
  buildEvaluation,
  decide,
  expectedPay,
  hardStops,
  levelFit,
  offerLevel,
  offerPay,
  overallScore,
  parseEvaluation,
  payFit,
  payPeriodFromText,
  postingFit,
  requiredGaps,
  workModeFit,
  WEIGHT,
  type EvaluationFacts,
  type HiringFacts,
} from "./evaluation"
import { buildMatchReport, type MatchReport, type OfferAnalysis } from "./match"

const analysis: OfferAnalysis = {
  role: "Builds the platform.",
  seniority: "Senior",
  requirements: [
    { id: "r1", text: "5 lat z Go", importance: "required", kind: "experience", keyword: "Go" },
    { id: "r2", text: "Kubernetes", importance: "required", kind: "tool", keyword: "Kubernetes" },
    { id: "r3", text: "Terraform", importance: "preferred", kind: "tool" },
  ],
  keywords: [],
  responsibilities: [],
  redFlags: [{ quote: "wear many hats", why: "Many roles in one." }],
  signals: [],
}

const EVIDENCE = "Pisałem usługi w Go przez 6 lat. Utrzymywałem klastry Kubernetes."

function report(reply: Parameters<typeof buildMatchReport>[1]["requirements"]): MatchReport {
  const built = buildMatchReport(
    analysis,
    { requirements: reply, strengths: [], emphasize: ["Zacznij od Go."], talkingPoints: [] },
    EVIDENCE
  )
  if (!built) throw new Error("no report")
  return built
}

const allMet = () =>
  report([
    { id: "r1", status: "met", evidence: "Pisałem usługi w Go przez 6 lat" },
    { id: "r2", status: "met", evidence: "Utrzymywałem klastry Kubernetes" },
    { id: "r3", status: "missing", gap: "minor", note: "Łatwo nadrobić." },
  ])

const hiring: HiringFacts = {
  score: 75,
  level: "high",
  signals: [{ code: "age", points: 15, n: 3 }],
}

const person: EvaluationFacts["person"] = {
  seniority: "senior",
  salaryFloor: 20000,
  salaryTarget: 25000,
  salaryCurrency: "PLN",
  salaryPeriod: "month",
  salaryContract: "b2b",
  remotePreference: "remote",
  homeCity: "Warszawa",
  locations: [],
  relocation: false,
}

const offer: EvaluationFacts["offer"] = {
  title: "Senior Platform Engineer",
  text: "Senior Platform Engineer\nWynagrodzenie: 22 000 - 27 000 PLN netto / mies.\nwear many hats",
  workplace: "REMOTE",
  location: "Polska",
  salaryMin: 22000,
  salaryMax: 27000,
  salaryCurrency: "PLN",
  hiring,
}

describe("offerLevel and levelFit", () => {
  it("takes the stated level only when the offer has its words, else reads the title", () => {
    expect(offerLevel({ title: "Platform Engineer", stated: "Senior", offerText: "" })).toBeNull()
    expect(
      offerLevel({ title: "Platform Engineer", stated: "Senior", offerText: "We seek a Senior." })
    ).toEqual({ level: "senior", source: "stated", quote: "Senior" })
    expect(offerLevel({ title: "Junior Tester", stated: "", offerText: "" })).toEqual({
      level: "junior",
      source: "title",
      quote: "Junior Tester",
    })
  })

  it("scores by the steps between the levels, and is unknown without either side", () => {
    const senior = offerLevel({ title: "Senior Engineer", stated: "", offerText: "" })
    expect(levelFit(senior, "senior")).toMatchObject({ score: 100, reason: "same", distance: 0 })
    expect(levelFit(senior, "mid")).toMatchObject({ score: 70, reason: "above", distance: 1 })
    expect(levelFit(senior, "principal")).toMatchObject({
      score: 35,
      reason: "below",
      distance: -2,
    })
    expect(levelFit(senior, "intern")).toMatchObject({ score: 0, reason: "above", distance: 3 })
    expect(levelFit(senior, null)).toMatchObject({ score: null, reason: "person-unknown" })
    expect(levelFit(null, "senior")).toMatchObject({ score: null, reason: "offer-unknown" })
  })

  it("does not compare a management level with a specialist one", () => {
    const manager = offerLevel({ title: "Senior Product Manager", stated: "", offerText: "" })
    expect(levelFit(manager, "senior")).toMatchObject({ score: null, reason: "track" })
    expect(levelFit(manager, "senior_manager")).toMatchObject({ score: 100, reason: "same" })
  })
})

describe("pay", () => {
  it("reads the period from the line that holds the amount, and from nothing else", () => {
    expect(payPeriodFromText("Pensja: 22 000 - 27 000 PLN / mies.", [22000, 27000])).toEqual({
      period: "month",
      quote: "Pensja: 22 000 - 27 000 PLN / mies.",
    })
    expect(payPeriodFromText("€90k–110k per year", [90000, 110000])?.period).toBe("year")
    expect(payPeriodFromText("150 PLN/h + VAT", [150, null])?.period).toBe("hour")
    // the amount is there, the period is on another line
    expect(payPeriodFromText("22 000 PLN\nrozliczenie miesięcznie", [22000])).toBeNull()
    // another amount's line
    expect(payPeriodFromText("Budżet szkoleniowy 5000 PLN rocznie", [22000])).toBeNull()
    // two periods on one line
    expect(payPeriodFromText("22 000 PLN / mies. albo 150 PLN/h", [22000])).toBeNull()
    // 122000 is not 22000
    expect(payPeriodFromText("122 000 PLN rocznie", [22000])).toBeNull()
  })

  it("takes the period the currency carries", () => {
    expect(offerPay({ salaryMin: 150, salaryMax: 190, salaryCurrency: "PLN/hour" }, "")).toEqual({
      min: 150,
      max: 190,
      currency: "PLN",
      period: "hour",
      periodQuote: "",
    })
    expect(offerPay({ salaryMin: null, salaryMax: null, salaryCurrency: "PLN" }, "")).toBeNull()
  })

  const expected = expectedPay(person)
  const monthly = (min: number | null, max: number | null) =>
    payFit({ min, max, currency: "PLN", period: "month", periodQuote: "" }, expected)

  it("places the offer's range against the minimum and the target", () => {
    expect(monthly(22000, 27000)).toMatchObject({ score: 100, reason: "target" })
    expect(monthly(20000, 24000)).toMatchObject({ score: 80, reason: "meets" })
    expect(monthly(18000, 26000)).toMatchObject({ score: 60, reason: "straddle" })
    expect(monthly(15000, 19000)).toMatchObject({ score: 25, reason: "below" })
    expect(monthly(10000, 12000)).toMatchObject({ score: 0, reason: "far-below" })
    expect(monthly(null, 21000)).toMatchObject({ score: 80, reason: "meets" })
  })

  it("compares a yearly offer per month", () => {
    const fit = payFit(
      { min: 240000, max: 300000, currency: "PLN", period: "year", periodQuote: "" },
      expected
    )
    expect(fit).toMatchObject({ score: 100, reason: "target" })
    expect(fit.monthly).toEqual({ min: 20000, max: 25000, floor: 20000, target: 25000 })
  })

  it("with only a target, says how near the range comes", () => {
    const aim = expectedPay({ ...person, salaryFloor: null })
    const fit = (max: number) =>
      payFit({ min: null, max, currency: "PLN", period: "month", periodQuote: "" }, aim)
    expect(fit(25000)).toMatchObject({ score: 100, reason: "target" })
    expect(fit(21000)).toMatchObject({ score: 60, reason: "near-target" })
    expect(fit(15000)).toMatchObject({ score: 25, reason: "below" })
  })

  it("is unknown rather than guessed when the two cannot be compared", () => {
    expect(payFit(null, expected)).toMatchObject({ score: null, reason: "offer-undisclosed" })
    expect(monthly(22000, 27000).score).toBe(100)
    expect(
      payFit({ min: 1, max: 2, currency: "PLN", period: "month", periodQuote: "" }, null)
    ).toMatchObject({ score: null, reason: "no-expectation" })
    expect(
      payFit({ min: 5000, max: 6000, currency: "EUR", period: "month", periodQuote: "" }, expected)
    ).toMatchObject({ score: null, reason: "currency" })
    expect(
      payFit({ min: 22000, max: 27000, currency: "PLN", period: null, periodQuote: "" }, expected)
    ).toMatchObject({ score: null, reason: "period-unknown" })
    expect(
      payFit({ min: 150, max: 190, currency: "PLN", period: "hour", periodQuote: "" }, expected)
    ).toMatchObject({ score: null, reason: "period-differs" })
  })
})

describe("workModeFit", () => {
  const fit = (over: Partial<Parameters<typeof workModeFit>[0]>) =>
    workModeFit({
      offerMode: "REMOTE",
      offerLocation: "",
      preference: "remote",
      homeCity: "Warszawa",
      locations: [],
      relocation: false,
      ...over,
    })

  it("scores the mode against the preference", () => {
    expect(fit({})).toMatchObject({ score: 100, reason: "same", place: "not-needed" })
    expect(fit({ offerMode: "HYBRID", offerLocation: "Warsaw, Poland" })).toMatchObject({
      score: 50,
      reason: "adjacent",
      place: "match",
    })
    expect(fit({ offerMode: "ONSITE", offerLocation: "Warszawa" })).toMatchObject({
      score: 0,
      reason: "opposite",
    })
    expect(
      fit({ offerMode: "ONSITE", offerLocation: "Warszawa", preference: "any" })
    ).toMatchObject({ score: 100, reason: "any", place: "match" })
  })

  it("is unknown without the offer's mode or the person's preference", () => {
    expect(fit({ offerMode: "UNKNOWN" })).toMatchObject({ score: null, reason: "offer-unknown" })
    expect(fit({ preference: null })).toMatchObject({ score: null, reason: "no-preference" })
  })

  it("counts an office in another city only when both cities are known", () => {
    const office = { offerMode: "HYBRID", preference: "hybrid" }
    expect(fit({ ...office, offerLocation: "Kraków" })).toMatchObject({
      score: 0,
      reason: "place",
      place: "mismatch",
    })
    expect(fit({ ...office, offerLocation: "Kraków", relocation: true })).toMatchObject({
      score: 100,
      reason: "same",
      place: "relocation",
    })
    expect(fit({ ...office, offerLocation: "Kraków", locations: ["Cracow"] })).toMatchObject({
      score: 100,
      place: "match",
    })
    expect(fit({ ...office, offerLocation: "Polska" })).toMatchObject({
      score: 100,
      place: "unknown",
    })
    expect(fit({ ...office, offerLocation: "Kraków", homeCity: null })).toMatchObject({
      score: 100,
      place: "unknown",
    })
  })
})

describe("postingFit", () => {
  it("takes points off the hiring confidence for each red flag, three at most", () => {
    expect(postingFit(hiring, analysis)).toMatchObject({ score: 65, penalty: 10 })
    const flag = { quote: "q", why: "w" }
    expect(postingFit(hiring, { ...analysis, redFlags: [flag, flag, flag, flag] })).toMatchObject({
      score: 45,
      penalty: 30,
    })
  })

  it("keeps the red flags unknown when no model read the offer, and a closed posting unscored", () => {
    expect(postingFit(hiring, null)).toMatchObject({ score: 75, redFlags: null, penalty: 0 })
    expect(postingFit(null, analysis)).toMatchObject({ score: null, reason: "closed" })
  })
})

describe("buildEvaluation", () => {
  const facts = (over: Partial<EvaluationFacts> = {}): EvaluationFacts => ({
    offer,
    person,
    analysis,
    report: allMet(),
    missing: "no-model",
    ...over,
  })

  it("weighs the dimensions into one score and reads the decision from it", () => {
    const evaluation = buildEvaluation(facts())
    const { dimensions } = evaluation
    expect(dimensions.requirements).toMatchObject({ score: 70, reason: "scored" })
    expect(dimensions.level.score).toBe(100)
    expect(dimensions.pay).toMatchObject({ score: 100, reason: "target" })
    expect(dimensions.pay.offer?.periodQuote).toContain("netto / mies.")
    expect(dimensions.workMode.score).toBe(100)
    expect(dimensions.posting.score).toBe(65)
    // (70×45 + 100×15 + 100×15 + 100×10 + 65×15) / 100
    expect(evaluation.score).toBe(81)
    expect(evaluation.coverage).toBe(100)
    expect(evaluation.decision).toBe("apply")
    expect(evaluation.stops).toEqual([])
    expect(evaluation.lead.emphasize).toEqual(["Zacznij od Go."])
    expect(parseEvaluation(JSON.parse(JSON.stringify(evaluation)))).toEqual(evaluation)
  })

  it("leaves an unknown dimension out instead of giving it a middle value", () => {
    const evaluation = buildEvaluation(
      facts({
        person: { ...person, salaryFloor: null, salaryTarget: null, seniority: null },
      })
    )
    expect(evaluation.dimensions.pay.score).toBeNull()
    expect(evaluation.dimensions.level.score).toBeNull()
    expect(evaluation.coverage).toBe(WEIGHT.requirements + WEIGHT.workMode + WEIGHT.posting)
    // (70×45 + 100×10 + 65×15) / 70
    expect(evaluation.score).toBe(73)
  })

  it("has no overall score and no decision without the requirements", () => {
    const evaluation = buildEvaluation(facts({ analysis: null, report: null }))
    expect(evaluation.dimensions.requirements).toMatchObject({ score: null, reason: "no-model" })
    expect(evaluation.dimensions.level).toMatchObject({ score: 100, offerSource: "title" })
    expect(evaluation.dimensions.posting.redFlags).toBeNull()
    expect(evaluation.score).toBeNull()
    expect(evaluation.coverage).toBe(55)
    expect(evaluation.decision).toBe("unknown")
  })

  it("a critical gap on a required item forces skip and leaves the number alone", () => {
    const withGap = report([
      { id: "r1", status: "met", evidence: "Pisałem usługi w Go przez 6 lat" },
      { id: "r2", status: "missing", gap: "critical", note: "Nie ma jak tego obejść." },
      { id: "r3", status: "missing" },
    ])
    const evaluation = buildEvaluation(facts({ report: withGap }))
    const plain = overallScore(evaluation.dimensions)
    expect(evaluation.score).toBe(plain.score)
    expect(evaluation.stops).toEqual([{ code: "critical-gap", effect: "skip" }])
    expect(evaluation.decision).toBe("skip")
    expect(evaluation.gaps).toEqual([
      {
        id: "r2",
        text: "Kubernetes",
        kind: "tool",
        status: "missing",
        level: "critical",
        note: "Nie ma jak tego obejść.",
        evidence: "",
      },
    ])
  })

  it("pay under the minimum and low hiring confidence take apply down to consider", () => {
    const lowPay = buildEvaluation(
      facts({ offer: { ...offer, salaryMin: 15000, salaryMax: 19000, text: "19 000 PLN / mies." } })
    )
    expect(lowPay.stops).toEqual([{ code: "pay-below-minimum", effect: "consider" }])
    expect(lowPay.score).toBeGreaterThanOrEqual(60)
    expect(lowPay.decision).toBe("consider")

    const ghost = buildEvaluation(
      facts({ offer: { ...offer, hiring: { score: 30, level: "low", signals: [] } } })
    )
    expect(ghost.stops).toEqual([{ code: "low-hiring-confidence", effect: "consider" }])
    expect(ghost.decision).toBe("consider")
  })

  it("a closed posting is skip even when nothing else is known", () => {
    const evaluation = buildEvaluation(
      facts({ analysis: null, report: null, offer: { ...offer, hiring: null } })
    )
    expect(evaluation.score).toBeNull()
    expect(evaluation.decision).toBe("skip")
  })
})

describe("decide, requiredGaps and hardStops", () => {
  it("reads the bands: from 60 apply, from 50 consider, below skip", () => {
    expect(decide(60, [])).toBe("apply")
    expect(decide(59, [])).toBe("consider")
    expect(decide(50, [])).toBe("consider")
    expect(decide(49, [])).toBe("skip")
    expect(decide(null, [])).toBe("unknown")
    expect(decide(49, [{ code: "low-hiring-confidence", effect: "consider" }])).toBe("skip")
    expect(decide(null, [{ code: "pay-below-minimum", effect: "consider" }])).toBe("unknown")
  })

  it("lists unmet required items, critical and missing first, and never preferred ones", () => {
    const gaps = requiredGaps(
      report([
        { id: "r1", status: "partial", evidence: "Pisałem usługi w Go", gap: "major" },
        { id: "r2", status: "missing", gap: "critical" },
        { id: "r3", status: "missing", gap: "critical" },
      ])
    )
    expect(gaps.map((gap) => [gap.id, gap.level, gap.status])).toEqual([
      ["r2", "critical", "missing"],
      ["r1", "major", "partial"],
    ])
    expect(requiredGaps(null)).toEqual([])
  })

  it("a critical gap that is only partial does not stop", () => {
    const evaluation = buildEvaluation({
      offer,
      person,
      analysis,
      missing: "no-model",
      report: report([
        { id: "r1", status: "partial", evidence: "Pisałem usługi w Go", gap: "critical" },
        { id: "r2", status: "met", evidence: "Utrzymywałem klastry Kubernetes" },
      ]),
    })
    expect(hardStops(evaluation.dimensions, evaluation.gaps)).toEqual([])
  })
})
