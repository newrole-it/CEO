import db, { type Prisma } from "db"
import type { LlmClient } from "@newrole/llm/common"
import { cvLocale } from "@newrole/cv-core/blank"
import type { MatchReport, OfferAnalysis } from "@newrole/cv-core/match"
import { parseCvContent, type CvContent } from "@newrole/cv-core/schema"
import {
  buildInterviewPrep,
  parseInterviewPrep,
  type PrepReply,
} from "@newrole/cv-core/stories-prep"
import { parseTailorNotes } from "@newrole/cv-core/tailor"
import { cvPlainText } from "@newrole/cv-core/text"
import { draftInterviewPrep } from "@newrole/cv-engine/interview"
import { analyzeOffer, matchCv } from "@newrole/cv-engine/match"
import { takeSlot } from "src/server/auth/magic-link"
import { getRound } from "src/server/cv/match-rounds"
import { defaultCv } from "src/server/cv/service"
import { loadTailorJob } from "src/server/cv/tailor"
import { createWritingClient } from "src/server/llm/writing"
import { candidateContext } from "src/server/profile/context"
import { listStories } from "./stories"
import {
  INTERVIEW_LIMITS,
  InterviewError,
  type InterviewLocale,
  type InterviewPrepView,
} from "./types"

/**
 * Interview preparation for one offer (InterviewPrep): likely questions by who asks, which saved
 * story answers which requirement, the risks and what to ask them. It is made from what the
 * person already has (their copy of the offer's text, the CV written for it or their general CV,
 * the newest round of the match, the story bank) and the latest one is kept per person and
 * offer, so the page opens without a new model call. Contract for the web app and, later, MCP.
 */

const CONTEXT_CHARS = 12_000

function toView(
  row: { jobId: string; content: unknown; locale: string; updatedAt: Date },
  job: { company: string; title: string }
): InterviewPrepView | null {
  const content = parseInterviewPrep(row.content)
  if (!content) return null
  return {
    jobId: row.jobId,
    company: job.company,
    title: job.title,
    content,
    locale: cvLocale(row.locale),
    generatedAt: row.updatedAt,
  }
}

/** The stored preparation for this offer; null when none was made yet (or it no longer reads). */
export async function getInterviewPrep(
  userId: number,
  jobId: string
): Promise<InterviewPrepView | null> {
  const row = await db.interviewPrep.findUnique({
    where: { userId_jobId: { userId, jobId } },
    select: {
      jobId: true,
      content: true,
      locale: true,
      updatedAt: true,
      job: { select: { title: true, company: { select: { name: true } } } },
    },
  })
  return row ? toView(row, { company: row.job.company.name, title: row.job.title }) : null
}

/** The CV written for the offer with the newest round of its match, when there is one. */
async function tailoredFor(userId: number, jobId: string) {
  const document = await db.cvDocument.findFirst({
    where: { userId, jobId, docType: "CV" },
    select: { id: true, content: true, tailorNotes: true },
  })
  if (!document) return null
  const round = await getRound(userId, document.id)
  const match = (round?.notes ?? parseTailorNotes(document.tailorNotes))?.match ?? null
  return {
    content: parseCvContent(document.content),
    analysis: match?.analysis ?? null,
    report: match?.report ?? null,
    // a CV tailored before rounds were kept has its match in its notes: that is its first round
    round: match ? (round?.number ?? 1) : null,
  }
}

/** The CV the person sent with their application for this offer, when it is not the tailored one. */
async function applicationCv(userId: number, jobId: string): Promise<CvContent | null> {
  const application = await db.application.findFirst({
    where: { userId, jobId, cvDocumentId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { cvDocument: { select: { content: true, docType: true } } },
  })
  return application?.cvDocument?.docType === "CV"
    ? parseCvContent(application.cvDocument.content)
    : null
}

/** A model step that fails leaves its part to the rules; the preparation is still made. */
async function attempt<T>(step: string, work: () => Promise<T | null>): Promise<T | null> {
  try {
    return await work()
  } catch (error) {
    console.error(`[interview] ${step} failed: ${(error as Error).name}`)
    return null
  }
}

/**
 * Makes the preparation for one offer and stores it in place of the earlier one.
 *
 * Rules do the whole of it. A model, when one is configured, adds three things, each checked by
 * code: it reads the offer when no match has read it yet, checks the person's CV against its
 * requirements when no round has, and words the questions, the story mapping, a line for each
 * risk and the questions to ask (buildInterviewPrep says what of that stands).
 * `llm` is injectable for tests; null means no model. Throws InterviewError: "job-not-found",
 * or "limited" after too many runs with a model in an hour.
 */
export async function prepareInterview(
  userId: number,
  jobId: string,
  opts: { locale: InterviewLocale; llm?: LlmClient | null }
): Promise<InterviewPrepView> {
  const { locale } = opts
  const job = await loadTailorJob(jobId, undefined, userId)
  if (!job) throw new InterviewError("job-not-found", "This offer is not in the index.")
  const [record, tailored, stories, context] = await Promise.all([
    db.job.findUnique({
      where: { id: jobId },
      select: { salaryMin: true, salaryMax: true, workplaceType: true, employmentType: true },
    }),
    tailoredFor(userId, jobId),
    listStories(userId, { status: "saved" }),
    candidateContext(userId, CONTEXT_CHARS),
  ])
  const cv =
    tailored?.content ??
    (await applicationCv(userId, jobId)) ??
    (await defaultCv(userId))?.content ??
    null
  // what a claim about the person is checked against: the CV for this offer and their own data
  const evidence = [cv ? cvPlainText(cv) : "", context].filter(Boolean).join("\n")
  const offer = { company: job.company, title: job.title, text: job.text }
  const llm = opts.llm === undefined ? createWritingClient() : opts.llm
  // refused rather than made by rules: that would replace a preparation a model worded
  if (
    llm &&
    !(await takeSlot(INTERVIEW_LIMITS.prep.key(userId), INTERVIEW_LIMITS.prep.perHour, new Date()))
  )
    throw new InterviewError("limited", "Too many preparations in the last hour.")

  let analysis: OfferAnalysis | null = tailored?.analysis ?? null
  let report: MatchReport | null = tailored?.report ?? null
  let match: { kind: "round" | "fresh" | "none"; round: number | null } = report
    ? { kind: "round", round: tailored?.round ?? null }
    : { kind: "none", round: null }
  if (llm && !analysis && job.text)
    analysis = await attempt("offer analysis", () => analyzeOffer({ llm, offer, locale, userId }))
  if (llm && analysis && !report && cv) {
    const read = analysis
    report = await attempt("match", () =>
      matchCv({ llm, analysis: read, offer, cv, context, evidence, locale, userId })
    )
    if (report) match = { kind: "fresh", round: null }
  }
  let reply: PrepReply | null = null
  if (llm && analysis) {
    const read = analysis
    reply = await attempt("prep", () =>
      draftInterviewPrep({ llm, offer, analysis: read, report, stories, context, locale, userId })
    )
  }

  const content = buildInterviewPrep({
    analysis,
    report,
    match,
    stories,
    offerText: job.text,
    facts: {
      hasSalary: record?.salaryMin != null || record?.salaryMax != null,
      hasWorkMode: Boolean(record && record.workplaceType !== "UNKNOWN"),
      hasContract: Boolean(record?.employmentType?.trim()),
    },
    evidence,
    hasCv: Boolean(cv),
    reply,
    hasModel: Boolean(llm),
  })
  const data = {
    content: content as unknown as Prisma.InputJsonValue,
    reader: content.reader,
    locale,
  }
  const row = await db.interviewPrep.upsert({
    where: { userId_jobId: { userId, jobId } },
    create: { userId, jobId, ...data },
    update: data,
    select: { updatedAt: true },
  })
  return {
    jobId,
    company: job.company,
    title: job.title,
    content,
    locale,
    generatedAt: row.updatedAt,
  }
}
