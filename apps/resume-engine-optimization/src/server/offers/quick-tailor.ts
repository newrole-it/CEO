import { randomUUID } from "node:crypto"
import db from "db"
import type { MatchBand } from "@newrole/cv-core/match"
import type { StepUpdate } from "@newrole/cv-core/progress"
import { parseTailorNotes, type TailorNotes } from "@newrole/cv-core/tailor"
import { findJobByUrl } from "src/server/applications/service"
import { postingUrlCandidates } from "src/server/autofill/job-extract"
import { CvError, type CvLanguage } from "src/server/cv/service"
import { tailorCvForJob } from "src/server/cv/tailor"
import { progressReporter, readProgress } from "src/server/cv/tailor-progress"
import type { LlmClient } from "@newrole/llm/common"
import type { ReadOfferDeps } from "src/server/applications/read-offer"
import type { HttpClient } from "src/server/security/safe-fetch"
import { toApplyPath } from "src/shared/applications"
import { addOfferByLink, offerLink } from "./service"

/**
 * "Dopasuj CV" on the offer the person has open, from the Chrome extension: the offer is added to
 * theirs by its address and "Dostosuj CV" (src/server/cv/tailor.ts) runs for it from their default
 * CV, in the offer's language. The run goes on after the request that started it has answered;
 * the extension asks what it has done so far and, when it ends, gets the match in short and the
 * way to the editor. Runs are kept in memory, as their steps are (src/server/cv/tailor-progress.ts):
 * one process serves the app on the person's machine.
 */

const TTL_MS = 15 * 60 * 1000
/** Required requirements the person's data does not show, named in the panel */
const MAX_GAPS = 3

type Run = {
  runId: string
  state: "running" | "failed"
  /** A CvErrorCode, or "failed" for anything else */
  error: string | null
  touched: number
  done: Promise<void>
}

const globalStore = globalThis as typeof globalThis & { quickTailorRuns?: Map<string, Run> }

/** Survives dev hot reloads, so a run is not lost when a file changes. */
function runs(): Map<string, Run> {
  globalStore.quickTailorRuns ??= new Map()
  return globalStore.quickTailorRuns
}

const runKey = (userId: number, jobId: string) => `${userId}:${jobId}`

/** The offer's run; one that failed is forgotten after a while, so the panel offers a new start. */
function runOf(userId: number, jobId: string): Run | null {
  const key = runKey(userId, jobId)
  const run = runs().get(key)
  if (!run) return null
  if (run.state === "failed" && Date.now() - run.touched > TTL_MS) {
    runs().delete(key)
    return null
  }
  return run
}

export type FitSummary = {
  score: number | null
  band: MatchBand | null
  /** Requirements the offer marks as required */
  required: { met: number; partial: number; total: number }
  /** The first of them the person's data does not show, in the words of the offer's analysis */
  gaps: string[]
  critical: number
  /** Keywords found, before and after tailoring */
  ats: { before: number | null; after: number | null }
}

export type OfferFit = {
  /** Null when the person does not keep the offer at this address */
  offer: { jobId: string; company: string; title: string; path: string } | null
  /** The CV written for it; `summary` is null when its match was never scored */
  cv: { id: string; path: string; matchPath: string; summary: FitSummary | null } | null
  run: { state: "running" | "failed"; steps: StepUpdate[]; error: string | null } | null
}

export function fitSummary(notes: TailorNotes | null): FitSummary | null {
  const match = notes?.match
  if (!match) return null
  const report = match.report
  const required = report?.groups.required
  return {
    score: report?.score ?? null,
    band: report?.band ?? null,
    required: {
      met: required?.met ?? 0,
      partial: required?.partial ?? 0,
      total: required?.total ?? 0,
    },
    gaps: (report?.requirements ?? [])
      .filter((item) => item.importance === "required" && item.status === "missing")
      .map((item) => item.text)
      .slice(0, MAX_GAPS),
    critical: report?.critical ?? 0,
    ats: { before: match.ats.before.score, after: match.ats.after.score },
  }
}

/** The offer at this address, when the person keeps it or has a CV written for it. */
async function ownOffer(
  userId: number,
  page: { url: string; jobId?: string | null }
): Promise<{ id: string; title: string; company: string } | null> {
  const ids: string[] = []
  if (page.jobId) ids.push(page.jobId)
  else {
    const url = offerLink(page.url)
    for (const candidate of url ? postingUrlCandidates(url) : []) {
      const job = await findJobByUrl(candidate).catch(() => null)
      if (job) ids.push(job.id)
    }
  }
  for (const jobId of new Set(ids)) {
    const [kept, written] = await Promise.all([
      db.userOffer.findUnique({ where: { userId_jobId: { userId, jobId } }, select: { id: true } }),
      db.cvDocument.findFirst({ where: { userId, jobId }, select: { id: true } }),
    ])
    if (!kept && !written) continue
    const job = await db.job.findUnique({
      where: { id: jobId },
      select: { id: true, title: true, company: { select: { name: true } } },
    })
    if (job) return { id: job.id, title: job.title, company: job.company.name }
  }
  return null
}

/** What the extension shows on an open offer: is it the person's, its CV and match, its run. */
export async function offerFit(
  userId: number,
  page: { url: string; jobId?: string | null }
): Promise<OfferFit> {
  const job = await ownOffer(userId, page)
  if (!job) return { offer: null, cv: null, run: null }
  const cv = await db.cvDocument.findFirst({
    where: { userId, jobId: job.id, docType: "CV" },
    select: { id: true, tailorNotes: true },
  })
  const run = runOf(userId, job.id)
  return {
    offer: { jobId: job.id, company: job.company, title: job.title, path: `/offers/${job.id}` },
    cv: cv
      ? {
          id: cv.id,
          path: `/cv/${cv.id}`,
          matchPath: `/offers/${job.id}/match`,
          summary: fitSummary(parseTailorNotes(cv.tailorNotes)),
        }
      : null,
    run: run
      ? {
          state: run.state,
          steps: readProgress(userId, run.runId)?.steps ?? [],
          error: run.error,
        }
      : null,
  }
}

export type QuickTailorStart =
  | { kind: "invalid" }
  /** The page needs the person's check before it becomes an offer; `path` opens that in the app */
  | { kind: "draft"; path: string; company: string | null; title: string | null }
  /** started: a run began. running: one was already going. ready: the offer has its CV. */
  | { kind: "started" | "running" | "ready"; jobId: string }

/**
 * Adds the offer behind the address and starts tailoring for it, unless a CV for it exists or a
 * run is going: a second click, or a second tab, never writes the CV twice. `llm`, `http` and
 * `read` are injectable for tests.
 */
export async function startQuickTailor(input: {
  userId: number
  url: string
  /** The language of the notes for the person: the extension's interface language */
  locale: CvLanguage
  llm?: LlmClient | null
  http?: HttpClient
  read?: ReadOfferDeps
}): Promise<QuickTailorStart> {
  const { userId, locale } = input
  const check = await addOfferByLink(userId, input.url, input.read)
  if (check.kind === "invalid") return { kind: "invalid" }
  if (check.kind === "draft") {
    return {
      kind: "draft",
      path: toApplyPath(check.url),
      company: check.facts?.company ?? null,
      title: check.facts?.title ?? null,
    }
  }
  const jobId = check.jobId
  if (runOf(userId, jobId)?.state === "running") return { kind: "running", jobId }
  const written = await db.cvDocument.findFirst({
    where: { userId, jobId, docType: "CV" },
    select: { id: true },
  })
  if (written) return { kind: "ready", jobId }

  const key = runKey(userId, jobId)
  const runId = randomUUID()
  const done = tailorCvForJob({
    userId,
    jobId,
    locale,
    llm: input.llm,
    http: input.http,
    onStep: progressReporter(userId, runId),
  }).then(
    () => {
      runs().delete(key)
    },
    (error: unknown) => {
      const code = error instanceof CvError ? error.code : "failed"
      if (code === "failed")
        console.error("[quick-tailor] run failed", error instanceof Error ? error.message : error)
      const run = runs().get(key)
      if (run?.runId === runId)
        runs().set(key, { ...run, state: "failed", error: code, touched: Date.now() })
    }
  )
  runs().set(key, { runId, state: "running", error: null, touched: Date.now(), done })
  return { kind: "started", jobId }
}

/** Resolves when the offer's run has ended, either way; at once when there is none. For tests. */
export async function quickTailorSettled(userId: number, jobId: string): Promise<void> {
  await runs().get(runKey(userId, jobId))?.done
}
