import { createHash } from "node:crypto"
import db, { type Prisma } from "db"
import {
  buildEvaluation,
  parseEvaluation,
  type Decision,
  type EvaluationFacts,
  type OfferEvaluation,
  type RequirementsReason,
} from "@newrole/cv-core/evaluation"
import type { StepReporter } from "@newrole/cv-core/progress"
import { cvPlainText } from "@newrole/cv-core/text"
import { readOfferFit } from "@newrole/cv-engine/evaluate"
import type { LlmClient } from "@newrole/llm/common"
import { asStringList } from "@newrole/profile/schema"
import { defaultCv, type CvDetail, type CvLanguage } from "src/server/cv/service"
import { loadTailorJob, type TailorJob } from "src/server/cv/tailor"
import { contentHash } from "src/server/cv/versions"
import { createWritingClient } from "src/server/llm/writing"
import { hiringConfidenceOf, hiringSelect } from "src/server/offers/hiring-confidence"
import { candidateContext } from "src/server/profile/context"
import type { HttpClient } from "src/server/security/safe-fetch"

/**
 * "Is it worth applying": one offer weighed against the person's general CV and profile before
 * they tailor a CV or apply. This module gathers the facts and keeps the result; the dimensions,
 * the score and the decision are code in @newrole/cv-core/evaluation, and the model's two steps
 * (reading the offer, checking the CV against it) are the ones tailoring uses
 * (@newrole/cv-engine/evaluate). Without a model the dimensions that need none are still
 * computed, and the requirements say why they have no score.
 *
 * One evaluation is kept per person and offer; a new one replaces it. With it are kept hashes of
 * what it was made against, so `stale` can say what changed since.
 */

export type EvaluationErrorCode = "job-not-found"

export class EvaluationError extends Error {
  constructor(readonly code: EvaluationErrorCode) {
    super(code)
    this.name = "EvaluationError"
  }
}

/** What changed since the evaluation was made; each is a reason to make it again. */
export type EvaluationStale = { cv: boolean; offer: boolean; profile: boolean }

export type EvaluationView = {
  jobId: string
  evaluation: OfferEvaluation
  evaluatedAt: Date
  /** The interface language its notes were written in */
  locale: string
  /** False when only rules ran: no model was configured */
  usedModel: boolean
  /** The CV it was made against, when that CV is still there */
  cv: { id: string; title: string } | null
  stale: EvaluationStale
}

/** The evaluation in short, for a card on the offer's page and for lists. */
export type EvaluationSummary = {
  jobId: string
  decision: Decision
  score: number | null
  evaluatedAt: Date
  stale: boolean
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")

const jobSelect = {
  ...hiringSelect,
  locationText: true,
  workplaceType: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
} as const

type Person = EvaluationFacts["person"]

/** The profile fields the dimensions read, and a hash of them with the person's own facts. */
async function personOf(userId: number): Promise<{ person: Person; hash: string }> {
  const [profile, facts] = await Promise.all([
    db.candidateProfile.findUnique({
      where: { userId },
      select: {
        seniority: true,
        salaryFloor: true,
        salaryTarget: true,
        salaryCurrency: true,
        salaryPeriod: true,
        salaryContract: true,
        remotePreference: true,
        homeCity: true,
        locations: true,
        relocation: true,
      },
    }),
    db.candidateFact.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { text: true },
    }),
  ])
  const person: Person = {
    seniority: profile?.seniority ?? null,
    salaryFloor: profile?.salaryFloor ?? null,
    salaryTarget: profile?.salaryTarget ?? null,
    salaryCurrency: profile?.salaryCurrency ?? null,
    salaryPeriod: profile?.salaryPeriod ?? null,
    salaryContract: profile?.salaryContract ?? null,
    remotePreference: profile?.remotePreference ?? null,
    homeCity: profile?.homeCity ?? null,
    locations: asStringList(profile?.locations),
    relocation: profile?.relocation ?? null,
  }
  return {
    person,
    hash: sha256(JSON.stringify({ person, facts: facts.map((fact) => fact.text) })),
  }
}

const cvHashOf = (cv: CvDetail | null) => (cv?.content ? contentHash(cv.content) : null)

function toView(
  row: {
    jobId: string
    result: unknown
    evaluatedAt: Date
    locale: string
    usedModel: boolean
  },
  cv: { id: string; title: string } | null,
  stale: EvaluationStale
): EvaluationView | null {
  const evaluation = parseEvaluation(row.result)
  if (!evaluation) return null
  return {
    jobId: row.jobId,
    evaluation,
    evaluatedAt: row.evaluatedAt,
    locale: row.locale,
    usedModel: row.usedModel,
    cv,
    stale,
  }
}

/** The columns an evaluation is kept in (OfferEvaluation without its user and offer). */
export type StoredFields = {
  decision: Decision
  score: number | null
  result: Prisma.InputJsonValue
  locale: CvLanguage
  usedModel: boolean
  cvId: string | null
  cvHash: string | null
  offerHash: string
  offerOrigin: string
  profileHash: string
  evaluatedAt: Date
}

/**
 * Weighs the offer now and keeps nothing: what `evaluateOffer` does before it stores. `person`
 * replaces the profile-based person side (a search's filters); `profileHash` still comes from the
 * profile. Throws EvaluationError("job-not-found") for an offer that is not in the index.
 */
export async function computeEvaluation(
  userId: number,
  jobId: string,
  options: {
    locale: CvLanguage
    llm?: LlmClient | null
    http?: HttpClient
    /** Told about steps "offer" and "match" as they run (src/server/cv/tailor-progress.ts) */
    onStep?: StepReporter
    person?: Person
  }
): Promise<{
  evaluation: OfferEvaluation
  usedModel: boolean
  stored: StoredFields
  cv: { id: string; title: string } | null
}> {
  const { locale, onStep } = options
  const [row, offer] = await Promise.all([
    db.job.findUnique({ where: { id: jobId }, select: jobSelect }),
    loadTailorJob(jobId, { http: options.http }, userId),
  ])
  if (!row || !offer) throw new EvaluationError("job-not-found")
  const [application, cv, { person: profilePerson, hash: profileHash }] = await Promise.all([
    db.application.findFirst({
      where: { userId, jobId },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    }),
    defaultCv(userId),
    personOf(userId),
  ])
  const hiring = await hiringConfidenceOf(row, application?.status ?? null)
  const llm = options.llm === undefined ? createWritingClient() : options.llm

  let missing: Exclude<RequirementsReason, "scored" | "no-requirements"> = "no-model"
  let fit: Awaited<ReturnType<typeof readOfferFit>> | null = null
  if (offer.withheld) missing = "withheld"
  else if (!offer.text.trim()) missing = "no-offer-text"
  else if (!cv?.content) missing = "no-cv"
  else if (llm) {
    const context = await candidateContext(userId)
    fit = await readOfferFit({
      llm,
      offer: { company: offer.company, title: offer.title, text: offer.text },
      cv: cv.content,
      context,
      // as tailoring checks it: the CV's own text and everything else the person has said
      evidence: `${cvPlainText(cv.content)}\n${context}`,
      locale,
      userId,
      onStep,
    })
    if (fit.failed) missing = fit.failed === "offer" ? "offer-failed" : "match-failed"
  }
  if (!fit) {
    onStep?.({ step: "offer", state: "skipped" })
    onStep?.({ step: "match", state: "skipped" })
  }

  const evaluation = buildEvaluation({
    offer: {
      title: offer.title,
      text: offer.text,
      workplace: row.workplaceType,
      location: row.locationText,
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      salaryCurrency: row.salaryCurrency,
      hiring,
    },
    person: options.person ?? profilePerson,
    analysis: fit?.analysis ?? null,
    report: fit?.report ?? null,
    missing,
  })

  const evaluatedAt = new Date()
  const stored: StoredFields = {
    decision: evaluation.decision,
    score: evaluation.score,
    // a stored JSON value: without the undefined keys optional fields leave behind
    result: JSON.parse(JSON.stringify(evaluation)),
    locale,
    usedModel: Boolean(fit),
    cvId: cv?.id ?? null,
    cvHash: cvHashOf(cv),
    offerHash: sha256(offer.text),
    offerOrigin: offer.origin,
    profileHash,
    evaluatedAt,
  }
  return {
    evaluation,
    usedModel: stored.usedModel,
    stored,
    cv: cv ? { id: cv.id, title: cv.title } : null,
  }
}

/**
 * Evaluates the offer now and keeps the result in place of the one before. `locale` is the
 * language of the model's notes: the person's interface language. `llm` null runs the rules only;
 * left out, the app's writing client is used when a model is configured. `llm` and `http` are
 * injectable for tests. Throws EvaluationError("job-not-found") for an offer that is not in the index.
 */
export async function evaluateOffer(
  userId: number,
  jobId: string,
  options: {
    locale: CvLanguage
    llm?: LlmClient | null
    http?: HttpClient
    /** Told about steps "offer" and "match" as they run (src/server/cv/tailor-progress.ts) */
    onStep?: StepReporter
  }
): Promise<EvaluationView> {
  const { evaluation, usedModel, stored, cv } = await computeEvaluation(userId, jobId, options)
  await db.offerEvaluation.upsert({
    where: { userId_jobId: { userId, jobId } },
    create: { userId, jobId, ...stored },
    update: stored,
  })
  return {
    jobId,
    evaluation,
    evaluatedAt: stored.evaluatedAt,
    locale: stored.locale,
    usedModel,
    cv,
    stale: { cv: false, offer: false, profile: false },
  }
}

/**
 * Has the offer's text changed? Read without the network: the person's own copy, else what the
 * index keeps. An evaluation made from the whole text read at its source cannot be compared with
 * the index's excerpt, so without a copy of the person's own it counts as unchanged.
 */
function offerChanged(
  stored: { offerHash: string; offerOrigin: string },
  current: TailorJob | null
): boolean {
  if (!current) return false
  if (current.origin !== "full" && stored.offerOrigin === "full") return false
  return sha256(current.text) !== stored.offerHash
}

async function staleOf(
  userId: number,
  stored: {
    jobId: string
    cvId: string | null
    cvHash: string | null
    offerHash: string
    offerOrigin: string
    profileHash: string
  }
): Promise<{ stale: EvaluationStale; cv: CvDetail | null }> {
  const [cv, offer, { hash }] = await Promise.all([
    defaultCv(userId),
    loadTailorJob(stored.jobId, undefined, userId),
    personOf(userId),
  ])
  return {
    cv,
    stale: {
      cv: (cv?.id ?? null) !== stored.cvId || cvHashOf(cv) !== stored.cvHash,
      offer: offerChanged(stored, offer),
      profile: hash !== stored.profileHash,
    },
  }
}

/**
 * The evaluation kept for the offer, with what changed since it was made. Null when there is none
 * or it was kept by a version of the evaluation that no longer reads.
 */
export async function getEvaluation(userId: number, jobId: string): Promise<EvaluationView | null> {
  const row = await db.offerEvaluation.findUnique({ where: { userId_jobId: { userId, jobId } } })
  if (!row) return null
  const { stale, cv } = await staleOf(userId, row)
  // the CV it was made against: the default one when that has not changed, else by its id
  const against =
    row.cvId == null
      ? null
      : cv?.id === row.cvId
        ? { id: cv.id, title: cv.title }
        : await db.cvDocument.findFirst({
            where: { id: row.cvId, userId },
            select: { id: true, title: true },
          })
  return toView(row, against, stale)
}

/** The decision and the score alone. Null as for getEvaluation. */
export async function evaluationSummary(
  userId: number,
  jobId: string
): Promise<EvaluationSummary | null> {
  const view = await getEvaluation(userId, jobId)
  if (!view) return null
  return {
    jobId,
    decision: view.evaluation.decision,
    score: view.evaluation.score,
    evaluatedAt: view.evaluatedAt,
    stale: view.stale.cv || view.stale.offer || view.stale.profile,
  }
}

/** Whether a model is configured, so the page can say what an evaluation will and will not hold. */
export function evaluationModelAvailable(): boolean {
  return createWritingClient() !== null
}
