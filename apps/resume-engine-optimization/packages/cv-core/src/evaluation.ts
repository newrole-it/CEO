import { z } from "zod"
import { detectSeniority, normalizeLocation, normalizeTitle } from "@newrole/matching/normalization"
import { fold } from "@newrole/matching/text"
import { SENIORITY_RANK, SeniorityEnum, type Seniority } from "@newrole/matching/types"
import {
  GapLevel,
  GroupScore,
  MatchBand,
  MatchReport,
  MatchStatus,
  OfferAnalysis,
  RequirementKind,
} from "./match"
import { mentionsTerm } from "./terms"

/**
 * "Is it worth applying": one offer weighed against the person's general CV and profile before
 * they tailor a CV or apply. The structure follows career-ops (MIT; modes/_shared.md "Scoring
 * System", modes/oferta.md blocks A to G, lib/score-action.mjs): several dimensions, one overall
 * score, a decision read from bands, and hard stops that change the decision without changing the
 * number. Unlike career-ops, nothing here is a model's judgement: every dimension is computed by
 * code from inputs it keeps next to the score, and a dimension whose inputs are missing is
 * unknown (score null), never a mid-scale value.
 *
 * The weights, the points of each rule and the hard stops are ours; no source gives them. The
 * decision bands are the ones the match score already reads (./match, after the
 * job-description-analyzer skill): from 60 a good fit, 50 to 59 a stretch, under 50 under-qualified.
 */

export const EVALUATION_VERSION = 1

export const DimensionCode = z.enum(["requirements", "level", "pay", "workMode", "posting"])
export type DimensionCode = z.infer<typeof DimensionCode>

/** How much each dimension weighs in the overall score, in percent of the whole. */
export const WEIGHT: Record<DimensionCode, number> = {
  requirements: 45,
  level: 15,
  pay: 15,
  workMode: 10,
  posting: 15,
}

export const DIMENSIONS: DimensionCode[] = ["requirements", "level", "pay", "workMode", "posting"]

/** The overall score from which the decision is "apply", and from which it is "consider". */
export const DECISION_MIN = { apply: 60, consider: 50 }

/** unknown: the requirements could not be scored, so there is no overall score to read */
export const Decision = z.enum(["apply", "consider", "skip", "unknown"])
export type Decision = z.infer<typeof Decision>

/* ---------------------------------------------------------------- requirements */

/**
 * Why the requirements have no score. no-requirements: the offer was read and lists neither
 * required nor preferred items.
 */
export const RequirementsReason = z.enum([
  "scored",
  "no-model",
  "no-cv",
  "no-offer-text",
  "withheld",
  "offer-failed",
  "match-failed",
  "no-requirements",
])
export type RequirementsReason = z.infer<typeof RequirementsReason>

export const RequirementsDimension = z.object({
  /** The match score of ./match: required 70 %, preferred 30 % */
  score: z.number().nullable(),
  reason: RequirementsReason,
  band: MatchBand.nullable(),
  required: GroupScore.nullable(),
  preferred: GroupScore.nullable(),
})
export type RequirementsDimension = z.infer<typeof RequirementsDimension>

export function requirementsFit(
  report: MatchReport | null,
  missing: Exclude<RequirementsReason, "scored" | "no-requirements">
): RequirementsDimension {
  if (!report) return { score: null, reason: missing, band: null, required: null, preferred: null }
  return {
    score: report.score,
    reason: report.score == null ? "no-requirements" : "scored",
    band: report.band,
    required: report.groups.required,
    preferred: report.groups.preferred,
  }
}

/* ---------------------------------------------------------------- level */

/**
 * The ladder of @newrole/matching/types compares levels within one track only: it ranks
 * "principal" with "manager", which says nothing about whether a specialist fits a manager's role.
 */
const MANAGEMENT = new Set<Seniority>([
  "manager",
  "senior_manager",
  "head",
  "director",
  "vp",
  "c_level",
])

/** Points for the distance between the offer's level and the person's, in steps of the ladder. */
export const LEVEL_POINTS = { same: 100, oneStep: 70, twoSteps: 35, further: 0 }

export const LevelReason = z.enum([
  "same",
  "above",
  "below",
  /** One is a management level and the other is not: the ladder cannot compare them */
  "track",
  "offer-unknown",
  "person-unknown",
])
export type LevelReason = z.infer<typeof LevelReason>

export const LevelDimension = z.object({
  score: z.number().nullable(),
  reason: LevelReason,
  offer: SeniorityEnum.nullable(),
  /** stated: the level the offer's analysis quoted from its text. title: read from the title */
  offerSource: z.enum(["stated", "title"]).nullable(),
  /** The offer's words the level was read from */
  offerQuote: z.string(),
  /** The level in the person's profile */
  person: SeniorityEnum.nullable(),
  /** Steps from the person's level up to the offer's; negative when the offer is below */
  distance: z.number().nullable(),
})
export type LevelDimension = z.infer<typeof LevelDimension>

/**
 * The level an offer states. The analysis' "seniority" counts only when its words are in the
 * offer; otherwise the title is read by the rules of @newrole/matching. Null when neither names one.
 */
export function offerLevel(input: {
  title: string
  /** OfferAnalysis.seniority, or "" */
  stated: string
  offerText: string
}): { level: Seniority; source: "stated" | "title"; quote: string } | null {
  const stated = input.stated.trim()
  if (stated && mentionsTerm(`${input.title}\n${input.offerText}`, stated)) {
    const level = detectSeniority(normalizeTitle(stated))
    if (level) return { level, source: "stated", quote: stated }
  }
  const level = detectSeniority(normalizeTitle(input.title))
  return level ? { level, source: "title", quote: input.title.trim() } : null
}

export function levelFit(
  offer: ReturnType<typeof offerLevel>,
  person: string | null | undefined
): LevelDimension {
  const own = SeniorityEnum.safeParse(person)
  const base = {
    offer: offer?.level ?? null,
    offerSource: offer?.source ?? null,
    offerQuote: offer?.quote ?? "",
    person: own.success ? own.data : null,
  }
  if (!offer) return { ...base, score: null, reason: "offer-unknown", distance: null }
  if (!own.success) return { ...base, score: null, reason: "person-unknown", distance: null }
  if (MANAGEMENT.has(offer.level) !== MANAGEMENT.has(own.data)) {
    return { ...base, score: null, reason: "track", distance: null }
  }
  const distance = SENIORITY_RANK[offer.level] - SENIORITY_RANK[own.data]
  const steps = Math.abs(distance)
  const score =
    steps === 0
      ? LEVEL_POINTS.same
      : steps === 1
        ? LEVEL_POINTS.oneStep
        : steps === 2
          ? LEVEL_POINTS.twoSteps
          : LEVEL_POINTS.further
  return {
    ...base,
    score,
    reason: distance === 0 ? "same" : distance > 0 ? "above" : "below",
    distance,
  }
}

/* ---------------------------------------------------------------- pay */

export const PayPeriod = z.enum(["hour", "day", "month", "year"])
export type PayPeriod = z.infer<typeof PayPeriod>

export const OfferPay = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  currency: z.string().nullable(),
  /** Null when neither the offer's data nor the line of its text with the amount says */
  period: PayPeriod.nullable(),
  /** The line of the offer the period was read from; "" when it came with the offer's data */
  periodQuote: z.string(),
})
export type OfferPay = z.infer<typeof OfferPay>

const PERIOD_WORDS: [PayPeriod, RegExp][] = [
  [
    "hour",
    /\/\s*(h|hr|hour|godz|godzine)\b|\b(per hour|an hour|hourly|na godzine|za godzine|godzinow\w*)\b/,
  ],
  ["day", /\/\s*(d|day|dzien|md)\b|\b(per day|a day|daily|day rate|dziennie|za dzien|man-?day)\b/],
  [
    "month",
    /\/\s*(m|mo|month|mies|mc|msc|m-c)\b|\b(per month|a month|monthly|miesiecznie|mies|mth)\b/,
  ],
  [
    "year",
    /\/\s*(y|yr|year|rok)\b|\b(per year|a year|per annum|annual\w*|yearly|rocznie|roczn\w+)\b/,
  ],
]

/** "20 000", "20.000" and "20,000" as 20000, so an amount is found however it is grouped. */
const ungroup = (line: string) => line.replace(/(?<=\d)[\s .,](?=\d{3}(?!\d))/g, "")

function lineHasAmount(line: string, amount: number): boolean {
  const whole = Math.round(amount)
  if (new RegExp(`(?<![\\d.,])${whole}(?![\\d])`).test(ungroup(line))) return true
  // "25k", "25 k"
  return whole % 1000 === 0 && new RegExp(`(?<![\\d.,])${whole / 1000}\\s?k\\b`, "i").test(line)
}

/**
 * The period of the offer's pay, read from the line of its text that holds one of the amounts.
 * Null when no such line names exactly one period: an amount is not turned into a monthly one by
 * its size.
 */
export function payPeriodFromText(
  offerText: string,
  amounts: (number | null)[]
): { period: PayPeriod; quote: string } | null {
  const wanted = amounts.filter((value): value is number => value != null && value > 0)
  if (!wanted.length) return null
  for (const line of offerText.split(/\n+/)) {
    if (!wanted.some((amount) => lineHasAmount(line, amount))) continue
    const folded = fold(line)
    const found = PERIOD_WORDS.filter(([, pattern]) => pattern.test(folded))
    if (found.length === 1) {
      return { period: found[0][0], quote: line.replace(/\s+/g, " ").trim().slice(0, 200) }
    }
  }
  return null
}

/**
 * The pay the offer's data states: Job.salaryMin, salaryMax and salaryCurrency, where the currency
 * may carry the period ("PLN/hour", @newrole/ats/payload). Null when it states no amount.
 */
export function offerPay(
  job: { salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null },
  offerText: string
): OfferPay | null {
  const amount = (value: number | null) =>
    value != null && Number.isFinite(value) && value > 0 ? value : null
  const min = amount(job.salaryMin)
  const max = amount(job.salaryMax)
  if (min == null && max == null) return null
  const [code, unit] = (job.salaryCurrency ?? "").trim().split("/")
  const stated = PayPeriod.safeParse(unit?.toLowerCase())
  const read = stated.success ? null : payPeriodFromText(offerText, [min, max])
  return {
    min,
    max,
    currency: code ? code.toUpperCase() : null,
    period: stated.success ? stated.data : (read?.period ?? null),
    periodQuote: read?.quote ?? "",
  }
}

export const ExpectedPay = z.object({
  /** The least the person takes */
  floor: z.number().nullable(),
  /** What they aim for */
  target: z.number().nullable(),
  currency: z.string().nullable(),
  period: z.enum(["month", "year"]),
  contract: z.string().nullable(),
})
export type ExpectedPay = z.infer<typeof ExpectedPay>

/** The profile's pay fields as the comparison reads them; null when it states no amount. */
export function expectedPay(profile: {
  salaryFloor: number | null
  salaryTarget: number | null
  salaryCurrency: string | null
  salaryPeriod: string | null
  salaryContract: string | null
}): ExpectedPay | null {
  const amount = (value: number | null) =>
    value != null && Number.isFinite(value) && value > 0 ? value : null
  const floor = amount(profile.salaryFloor)
  const target = amount(profile.salaryTarget)
  if (floor == null && target == null) return null
  return {
    floor,
    target,
    currency: profile.salaryCurrency?.trim().toUpperCase() || null,
    // the profile keeps monthly amounts unless it says "year" (@newrole/profile/salary)
    period: profile.salaryPeriod === "year" ? "year" : "month",
    contract: profile.salaryContract?.trim() || null,
  }
}

/**
 * Points for where the offer's range lies against the person's minimum and target. The cases are
 * the ones @newrole/profile/salary's scoreSalary tells apart; "near" is within a fifth below.
 */
export const PAY_POINTS = { target: 100, meets: 80, straddle: 60, near: 60, below: 25, farBelow: 0 }

/** The top of the offer's range under this share of the amount it is compared with is "far below". */
const NEAR_SHARE = 0.8

export const PayReason = z.enum([
  /** The top of the range reaches the target, and its bottom the minimum when there is one */
  "target",
  /** The whole range is at or above the minimum */
  "meets",
  /** The minimum lies inside the range */
  "straddle",
  /** No minimum given; the top of the range is within a fifth below the target */
  "near-target",
  /** The top of the range is below the minimum (or, with no minimum, well below the target) */
  "below",
  "far-below",
  "offer-undisclosed",
  "no-expectation",
  /** The offer and the profile name different currencies, or one names none: no rate is assumed */
  "currency",
  /** The offer gives an amount but nothing says for what period */
  "period-unknown",
  /** An hourly or daily rate against a monthly or yearly expectation: no hours are assumed */
  "period-differs",
])
export type PayReason = z.infer<typeof PayReason>

export const PayDimension = z.object({
  score: z.number().nullable(),
  reason: PayReason,
  offer: OfferPay.nullable(),
  expected: ExpectedPay.nullable(),
  /** Both sides per month in one currency, when they could be compared */
  monthly: z
    .object({
      min: z.number().nullable(),
      max: z.number().nullable(),
      floor: z.number().nullable(),
      target: z.number().nullable(),
    })
    .nullable(),
})
export type PayDimension = z.infer<typeof PayDimension>

/**
 * The offer's stated pay against the person's expected pay. They are compared only in the same
 * currency and over a month or a year (a year is twelve months); contract type and taxes are not
 * converted, and the interface says so. No market data.
 */
export function payFit(offer: OfferPay | null, expected: ExpectedPay | null): PayDimension {
  const unknown = (reason: PayReason): PayDimension => ({
    score: null,
    reason,
    offer,
    expected,
    monthly: null,
  })
  if (!offer) return unknown("offer-undisclosed")
  if (!expected) return unknown("no-expectation")
  if (!offer.currency || !expected.currency || offer.currency !== expected.currency) {
    return unknown("currency")
  }
  if (!offer.period) return unknown("period-unknown")
  if (offer.period === "hour" || offer.period === "day") return unknown("period-differs")
  const perMonth = (value: number | null, period: "month" | "year") =>
    value == null ? null : Math.round(period === "year" ? value / 12 : value)
  const monthly = {
    min: perMonth(offer.min, offer.period),
    max: perMonth(offer.max, offer.period),
    floor: perMonth(expected.floor, expected.period),
    target: perMonth(expected.target, expected.period),
  }
  const low = (monthly.min ?? monthly.max) as number
  const high = (monthly.max ?? monthly.min) as number
  const { floor, target } = monthly
  const scored = (reason: PayReason, score: number): PayDimension => ({
    score,
    reason,
    offer,
    expected,
    monthly,
  })
  if (floor != null) {
    if (high < floor * NEAR_SHARE) return scored("far-below", PAY_POINTS.farBelow)
    if (high < floor) return scored("below", PAY_POINTS.below)
    if (low < floor) return scored("straddle", PAY_POINTS.straddle)
    if (target != null && high >= target) return scored("target", PAY_POINTS.target)
    return scored("meets", PAY_POINTS.meets)
  }
  // only a target
  const aim = target as number
  if (high >= aim) return scored("target", PAY_POINTS.target)
  if (high >= aim * NEAR_SHARE) return scored("near-target", PAY_POINTS.near)
  return scored("below", PAY_POINTS.below)
}

/* ---------------------------------------------------------------- work mode and place */

export const OfferWorkMode = z.enum(["REMOTE", "HYBRID", "ONSITE", "UNKNOWN"])
export type OfferWorkMode = z.infer<typeof OfferWorkMode>

export const WorkPreference = z.enum(["remote", "hybrid", "onsite", "any"])
export type WorkPreference = z.infer<typeof WorkPreference>

/** Points for the offer's work mode against the preferred one: the same, the next one, the opposite. */
export const MODE_POINTS = { same: 100, adjacent: 50, opposite: 0 }

const MODE_ORDER: Record<Exclude<OfferWorkMode, "UNKNOWN">, number> = {
  REMOTE: 0,
  HYBRID: 1,
  ONSITE: 2,
}
const PREFERENCE_ORDER: Record<Exclude<WorkPreference, "any">, number> = {
  remote: 0,
  hybrid: 1,
  onsite: 2,
}

export const WorkModeReason = z.enum([
  "same",
  /** The person takes any mode */
  "any",
  /** Remote against hybrid, or hybrid against on-site */
  "adjacent",
  /** Remote against on-site */
  "opposite",
  /** The mode suits, but the office is in a city the person does not name and they do not relocate */
  "place",
  "offer-unknown",
  "no-preference",
])
export type WorkModeReason = z.infer<typeof WorkModeReason>

/**
 * Where the office is against the person's cities. not-needed: a remote offer. unknown: the offer
 * or the profile names no city the rules know. relocation: another city, and the person relocates.
 */
export const PlaceCheck = z.enum(["match", "mismatch", "relocation", "unknown", "not-needed"])
export type PlaceCheck = z.infer<typeof PlaceCheck>

export const WorkModeDimension = z.object({
  score: z.number().nullable(),
  reason: WorkModeReason,
  offer: OfferWorkMode,
  offerLocation: z.string(),
  preference: WorkPreference.nullable(),
  /** The person's home city and the other places their profile lists */
  places: z.array(z.string()),
  relocation: z.boolean().nullable(),
  place: PlaceCheck,
})
export type WorkModeDimension = z.infer<typeof WorkModeDimension>

function placeCheck(
  offerLocation: string,
  places: string[],
  relocation: boolean | null
): PlaceCheck {
  const cities = (text: string) => normalizeLocation(text).cities.map((entry) => entry.city)
  const office = new Set(cities(offerLocation))
  const own = new Set(places.flatMap(cities))
  if (!office.size || !own.size) return "unknown"
  if ([...office].some((city) => own.has(city))) return "match"
  return relocation ? "relocation" : "mismatch"
}

/**
 * The offer's work mode (Job.workplaceType) against the profile's preference, and for an offer
 * with office days, the office's city against the person's. Cities are compared only when
 * @newrole/matching recognises one on both sides; a remote offer's countries are not checked.
 */
export function workModeFit(input: {
  offerMode: string | null | undefined
  offerLocation: string | null | undefined
  preference: string | null | undefined
  homeCity: string | null | undefined
  locations: string[]
  relocation: boolean | null | undefined
}): WorkModeDimension {
  const offer = OfferWorkMode.catch("UNKNOWN").parse(input.offerMode ?? "UNKNOWN")
  const preference = WorkPreference.safeParse(input.preference)
  const places = [
    ...new Set([input.homeCity ?? "", ...input.locations].map((p) => p.trim()).filter(Boolean)),
  ]
  const base = {
    offer,
    offerLocation: (input.offerLocation ?? "").trim(),
    preference: preference.success ? preference.data : null,
    places,
    relocation: input.relocation ?? null,
  }
  if (offer === "UNKNOWN") {
    return { ...base, score: null, reason: "offer-unknown", place: "unknown" }
  }
  if (!preference.success) {
    return { ...base, score: null, reason: "no-preference", place: "unknown" }
  }
  const place =
    offer === "REMOTE" ? "not-needed" : placeCheck(base.offerLocation, places, base.relocation)
  let reason: WorkModeReason = "any"
  let score = MODE_POINTS.same
  if (preference.data !== "any") {
    const steps = Math.abs(MODE_ORDER[offer] - PREFERENCE_ORDER[preference.data])
    reason = steps === 0 ? "same" : steps === 1 ? "adjacent" : "opposite"
    score =
      steps === 0 ? MODE_POINTS.same : steps === 1 ? MODE_POINTS.adjacent : MODE_POINTS.opposite
  }
  if (place === "mismatch" && score > 0) return { ...base, score: 0, reason: "place", place }
  return { ...base, score, reason, place }
}

/* ---------------------------------------------------------------- the posting */

/** src/shared/hiring-confidence.ts HiringConfidence, as the app counts it when the offer is read. */
export const HiringFacts = z.object({
  score: z.number(),
  level: z.enum(["high", "medium", "low"]),
  signals: z.array(
    z.object({ code: z.string(), points: z.number(), n: z.number().optional().catch(undefined) })
  ),
})
export type HiringFacts = z.infer<typeof HiringFacts>

/** Points off the hiring confidence for each red flag quoted from the offer, and how many count. */
export const RED_FLAG_POINTS = 10
export const RED_FLAGS_COUNTED = 3

export const PostingDimension = z.object({
  score: z.number().nullable(),
  reason: z.enum(["scored", "closed"]),
  /** Null for a closed posting: the app gives it no hiring confidence */
  hiring: HiringFacts.nullable(),
  /** Quoted from the offer by its analysis; null when no model read the offer */
  redFlags: z.array(z.object({ quote: z.string(), why: z.string() })).nullable(),
  /** Points taken off for red flags */
  penalty: z.number(),
})
export type PostingDimension = z.infer<typeof PostingDimension>

/**
 * The posting itself: the hiring confidence the app already counts, less points for the red flags
 * the offer's analysis quoted from its text.
 */
export function postingFit(
  hiring: HiringFacts | null,
  analysis: OfferAnalysis | null
): PostingDimension {
  const redFlags = analysis ? analysis.redFlags : null
  if (!hiring) return { score: null, reason: "closed", hiring: null, redFlags, penalty: 0 }
  const penalty = Math.min(redFlags?.length ?? 0, RED_FLAGS_COUNTED) * RED_FLAG_POINTS
  return {
    score: Math.max(0, Math.min(100, hiring.score - penalty)),
    reason: "scored",
    hiring,
    redFlags,
    penalty,
  }
}

/* ---------------------------------------------------------------- overall, stops, gaps */

export const Dimensions = z.object({
  requirements: RequirementsDimension,
  level: LevelDimension,
  pay: PayDimension,
  workMode: WorkModeDimension,
  posting: PostingDimension,
})
export type Dimensions = z.infer<typeof Dimensions>

/**
 * The weighted mean of the dimensions that have a score; a dimension without one drops out and
 * the rest keep their proportions. `coverage` is the weight that was scored. Without the
 * requirements there is no overall score: the other four cannot say whether to apply.
 */
export function overallScore(dimensions: Dimensions): { score: number | null; coverage: number } {
  let sum = 0
  let weight = 0
  for (const code of DIMENSIONS) {
    const score = dimensions[code].score
    if (score == null) continue
    sum += score * WEIGHT[code]
    weight += WEIGHT[code]
  }
  if (dimensions.requirements.score == null || !weight) return { score: null, coverage: weight }
  return { score: Math.round(sum / weight), coverage: weight }
}

/**
 * What forces the decision whatever the score (career-ops: "A hard stop forces Skip ... Neither
 * changes the 1-5 number"). critical-gap: a required item is missing at the critical level.
 * closed: the posting is closed. pay-below-minimum: the top of the offer's range is under the
 * person's minimum. low-hiring-confidence: little says the company is hiring (career-ops sends a
 * suspicious posting to "Research first"). The last two only take "apply" down to "consider": pay
 * is compared without contract type, and hiring confidence is an estimate.
 */
export const StopCode = z.enum([
  "critical-gap",
  "closed",
  "pay-below-minimum",
  "low-hiring-confidence",
])
export type StopCode = z.infer<typeof StopCode>

export const Stop = z.object({ code: StopCode, effect: z.enum(["skip", "consider"]) })
export type Stop = z.infer<typeof Stop>

export const Gap = z.object({
  id: z.string(),
  text: z.string(),
  kind: RequirementKind,
  status: MatchStatus,
  level: GapLevel,
  /** The honest way to handle it, from the match; "" when the model gave none */
  note: z.string(),
  /** What the person's data shows of it, for a partial one */
  evidence: z.string(),
})
export type Gap = z.infer<typeof Gap>

const GAP_ORDER: GapLevel[] = ["critical", "major", "minor"]

/** The required items the person's data does not fully show, the most serious first. */
export function requiredGaps(report: MatchReport | null): Gap[] {
  return (report?.requirements ?? [])
    .filter((item) => item.importance === "required" && item.status !== "met")
    .map((item) => ({
      id: item.id,
      text: item.text,
      kind: item.kind,
      status: item.status,
      level: item.gap ?? "major",
      note: item.note,
      evidence: item.evidence,
    }))
    .sort(
      (a, b) =>
        GAP_ORDER.indexOf(a.level) - GAP_ORDER.indexOf(b.level) ||
        Number(a.status !== "missing") - Number(b.status !== "missing")
    )
}

export function hardStops(dimensions: Dimensions, gaps: Gap[]): Stop[] {
  const stops: Stop[] = []
  if (gaps.some((gap) => gap.level === "critical" && gap.status === "missing")) {
    stops.push({ code: "critical-gap", effect: "skip" })
  }
  if (dimensions.posting.reason === "closed") stops.push({ code: "closed", effect: "skip" })
  const pay = dimensions.pay
  if ((pay.reason === "below" || pay.reason === "far-below") && pay.expected?.floor != null) {
    stops.push({ code: "pay-below-minimum", effect: "consider" })
  }
  if (dimensions.posting.hiring?.level === "low") {
    stops.push({ code: "low-hiring-confidence", effect: "consider" })
  }
  return stops
}

/** The decision the score's band gives, then what the hard stops make of it. */
export function decide(score: number | null, stops: Stop[]): Decision {
  if (stops.some((stop) => stop.effect === "skip")) return "skip"
  if (score == null) return "unknown"
  if (score < DECISION_MIN.consider) return "skip"
  if (score < DECISION_MIN.apply) return "consider"
  return stops.length ? "consider" : "apply"
}

/* ---------------------------------------------------------------- the whole evaluation */

export const OfferEvaluation = z.object({
  version: z.literal(EVALUATION_VERSION),
  decision: Decision,
  /** 0 to 100; null when the requirements could not be scored */
  score: z.number().nullable(),
  /** The weight of the dimensions that were scored, 0 to 100 */
  coverage: z.number(),
  dimensions: Dimensions,
  stops: z.array(Stop),
  gaps: z.array(Gap),
  /** What to lead with: both lists come from the match, the strengths with evidence code found */
  lead: z.object({
    emphasize: z.array(z.string()),
    strengths: z.array(z.object({ title: z.string(), why: z.string(), evidence: z.string() })),
  }),
  /** Null when no model read the offer */
  analysis: OfferAnalysis.nullable(),
  /** Null when the requirements were not checked */
  report: MatchReport.nullable(),
})
export type OfferEvaluation = z.infer<typeof OfferEvaluation>

/** Everything the dimensions read, gathered by the caller. */
export type EvaluationFacts = {
  offer: {
    title: string
    /** The offer's text as a model may read it; "" when there is none */
    text: string
    workplace: string | null
    location: string | null
    salaryMin: number | null
    salaryMax: number | null
    salaryCurrency: string | null
    /** Null for a closed posting */
    hiring: HiringFacts | null
  }
  person: {
    seniority: string | null
    salaryFloor: number | null
    salaryTarget: number | null
    salaryCurrency: string | null
    salaryPeriod: string | null
    salaryContract: string | null
    remotePreference: string | null
    homeCity: string | null
    locations: string[]
    relocation: boolean | null
  }
  analysis: OfferAnalysis | null
  report: MatchReport | null
  /** Why there is no report, when there is none */
  missing: Exclude<RequirementsReason, "scored" | "no-requirements">
}

export function buildEvaluation(facts: EvaluationFacts): OfferEvaluation {
  const { offer, person, analysis, report } = facts
  const dimensions: Dimensions = {
    requirements: requirementsFit(report, facts.missing),
    level: levelFit(
      offerLevel({ title: offer.title, stated: analysis?.seniority ?? "", offerText: offer.text }),
      person.seniority
    ),
    pay: payFit(offerPay(offer, offer.text), expectedPay(person)),
    workMode: workModeFit({
      offerMode: offer.workplace,
      offerLocation: offer.location,
      preference: person.remotePreference,
      homeCity: person.homeCity,
      locations: person.locations,
      relocation: person.relocation,
    }),
    posting: postingFit(offer.hiring, analysis),
  }
  const gaps = requiredGaps(report)
  const stops = hardStops(dimensions, gaps)
  const { score, coverage } = overallScore(dimensions)
  return {
    version: EVALUATION_VERSION,
    decision: decide(score, stops),
    score,
    coverage,
    dimensions,
    stops,
    gaps,
    lead: { emphasize: report?.emphasize ?? [], strengths: report?.strengths ?? [] },
    analysis,
    report,
  }
}

/** A stored evaluation; null when it is of another version or no longer reads. */
export function parseEvaluation(value: unknown): OfferEvaluation | null {
  const parsed = OfferEvaluation.safeParse(value)
  return parsed.success ? parsed.data : null
}
