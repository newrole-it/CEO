import db from "db"
import type { Prisma } from "@prisma/client"
import { gatherCv, type GatherDraft, type GatherSourceInput } from "@newrole/cv-engine/gather"
import type { LlmClient } from "@newrole/llm/common"
import { fold } from "@newrole/matching/text"
import { cvLocale } from "@newrole/cv-core/blank"
import { changesSize, keepPresent, ownChanges, type OwnChange } from "@newrole/cv-core/own-changes"
import { parseCvContent, type CvContent } from "@newrole/cv-core/schema"
import { cvPlainText } from "@newrole/cv-core/text"
import { companyWords, hasPhrase } from "src/server/gmail/allowlist"
import { createWritingClient } from "src/server/llm/writing"
import { candidateContext } from "src/server/profile/context"
import { CvError, type CvLanguage } from "./service"
import { appendVersion, contentHash, keepCurrentState, toStoredJson } from "./versions"

/**
 * "Zbierz wszystko do CV ogólnego" on the dashboard: what the person added by hand in their other
 * CVs, merged into one general CV by the model (@newrole/cv-engine/gather). A CV for an offer is
 * mostly the tailoring model's wording, so only the steps of its history that the person made
 * count (handSteps, @newrole/cv-core/own-changes). The draft is shown to the person and stored
 * only when they save it, as a version of its own, the state before kept.
 */

/** The most one call gives the model of the changes, in characters; more goes in a further call. */
export const MAX_GATHER_CHARS = 60_000
/** The most lines naming an offer's company that the draft lists. */
const MAX_WARNINGS = 8

export type GatherSource = {
  id: string
  title: string
  /** The offer it was written for; null for a general CV */
  company: string | null
  role: string | null
  language: CvLanguage
  /** How many changes of the person's own it holds */
  changes: number
}

export type GatherPreview = {
  /** Null when the person has no editable general CV to gather into */
  target: { id: string; title: string; language: CvLanguage } | null
  targets: { id: string; title: string; isDefault: boolean }[]
  sources: GatherSource[]
  skipped: { id: string; title: string; reason: "no-content" }[]
}

export type GatherResult = GatherDraft & {
  targetId: string
  /** The general CV's updatedAt the draft was made from, for saveGathered */
  updatedAt: string
  /** The other CVs the draft was made from, each as it was then, for saveGathered */
  sources: { id: string; hash: string }[]
  before: CvContent
  /** Lines of the draft, new to the general CV, that name a company a source was written for */
  warnings: string[]
}

type Collected = {
  target: { id: string; title: string; language: CvLanguage; content: CvContent; updatedAt: Date }
  targets: GatherPreview["targets"]
  sources: (GatherSource & { input: GatherSourceInput; hash: string })[]
  skipped: GatherPreview["skipped"]
}

/** Versions the model or a reset made: the step into one is not the person's writing. */
const MODEL_ORIGINS = new Set(["generated", "base"])
/** Versions that hold a state the person left: the step into one is theirs. */
const HAND_ORIGINS = new Set(["auto", "manual", "pdf", "gathered"])

type VersionMeta = {
  id: string
  documentId: string
  origin: string
  label: string | null
  contentHash: string
}

/**
 * The steps of a CV for an offer that were the person's own, as pairs of version ids (null is the
 * CV as it is now): from a version into the automatic, named or PDF version after it, and from
 * the newest version to now. A step into what the model generated is the model's. Steps up to the
 * newest "gathered" version for this general CV went into it already. Null when the model never
 * wrote this CV, so there is nothing to tell the person's writing from.
 */
function handSteps(
  versions: VersionMeta[],
  nowHash: string,
  targetId: string
): { before: string; after: string | null }[] | null {
  const written = versions.findIndex((version) => MODEL_ORIGINS.has(version.origin))
  if (written < 0) return null
  const start = Math.max(written, lastGathered(versions, targetId))
  const steps: { before: string; after: string | null }[] = []
  for (let index = start + 1; index < versions.length; index += 1) {
    const [before, after] = [versions[index - 1], versions[index]]
    if (!HAND_ORIGINS.has(after.origin) || after.contentHash === before.contentHash) continue
    steps.push({ before: before.id, after: after.id })
  }
  const last = versions[versions.length - 1]
  if (last.contentHash !== nowHash) steps.push({ before: last.id, after: null })
  return steps
}

/** The index of the newest version that marks this CV as gathered into `targetId`; -1 without one. */
function lastGathered(versions: VersionMeta[], targetId: string): number {
  return versions.findLastIndex(
    (version) => version.origin === "gathered" && version.label === targetId
  )
}

/**
 * The general CV to gather into and what the person's other CVs add to it; null without one.
 * A CV for an offer gives the steps the person made in it by hand (handSteps), as far as it still
 * holds them. Any other CV is compared with the general CV itself, or with what it was when its
 * changes last went into that CV. Saving a draft marks each source (saveGathered), so the same
 * changes are not offered twice.
 */
async function collect(userId: number, targetId?: string): Promise<Collected | null> {
  // titles first: content carries the photo, and only the CVs that are read need it
  const rows = await db.cvDocument.findMany({
    where: { userId, docType: "CV" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      language: true,
      kind: true,
      isDefault: true,
      jobId: true,
      targetCompany: true,
      targetTitle: true,
      content: true,
      updatedAt: true,
    },
  })
  const parsed = rows.map((row) => ({ ...row, cv: parseCvContent(row.content) }))
  const forOffer = (row: (typeof parsed)[number]) => Boolean(row.jobId || row.targetCompany)
  const general = parsed.filter((row) => row.cv && row.kind === "EDITABLE" && !forOffer(row))
  const picked = targetId
    ? general.find((row) => row.id === targetId)
    : (general.find((row) => row.isDefault) ?? general[0])
  if (!picked?.cv) return null
  const target = {
    id: picked.id,
    title: picked.title,
    language: cvLocale(picked.language),
    content: picked.cv,
    updatedAt: picked.updatedAt,
  }
  const others = parsed.filter((row) => row.id !== picked.id)
  const metas: VersionMeta[] = await db.cvVersion.findMany({
    where: { documentId: { in: others.map((row) => row.id) } },
    orderBy: { number: "asc" },
    select: { id: true, documentId: true, origin: true, label: true, contentHash: true },
  })
  const versionsOf = (id: string) => metas.filter((meta) => meta.documentId === id)
  const hashOf = new Map(others.flatMap((row) => (row.cv ? [[row.id, contentHash(row.cv)]] : [])))
  const stepsOf = new Map(
    others.flatMap((row) => {
      if (!row.cv || !forOffer(row)) return []
      const steps = handSteps(versionsOf(row.id), hashOf.get(row.id) ?? "", target.id)
      return steps ? [[row.id, steps] as const] : []
    })
  )
  /** For a CV the model never wrote: the version it is compared with instead of the general CV */
  const markOf = new Map(
    others.flatMap((row) => {
      if (stepsOf.has(row.id)) return []
      const own = versionsOf(row.id)
      const mark = own[lastGathered(own, target.id)]
      return mark ? [[row.id, mark.id] as const] : []
    })
  )
  const wanted = new Set([
    ...markOf.values(),
    ...[...stepsOf.values()].flatMap((steps) =>
      steps.flatMap((step) => (step.after ? [step.before, step.after] : [step.before]))
    ),
  ])
  const stored = wanted.size
    ? await db.cvVersion.findMany({
        where: { id: { in: [...wanted] } },
        select: { id: true, content: true },
      })
    : []
  const contentOf = new Map(stored.map((row) => [row.id, parseCvContent(row.content)]))

  const sources: Collected["sources"] = []
  const skipped: Collected["skipped"] = []
  for (const row of others) {
    if (!row.cv) {
      skipped.push({ id: row.id, title: row.title, reason: "no-content" })
      continue
    }
    const now = row.cv
    const steps = stepsOf.get(row.id)
    let changes: OwnChange[]
    if (steps) {
      const seen = new Set<string>()
      changes = steps
        .flatMap((step) => {
          const before = contentOf.get(step.before)
          const after = step.after ? contentOf.get(step.after) : now
          return before && after ? keepPresent(ownChanges(after, before), now) : []
        })
        .filter((change) => {
          const key = JSON.stringify(change)
          return seen.has(key) ? false : Boolean(seen.add(key))
        })
    } else {
      // a CV the model never wrote: all of it is the person's
      const mark = markOf.get(row.id)
      changes = ownChanges(now, (mark ? contentOf.get(mark) : null) ?? target.content)
    }
    if (!changes.length) continue
    const head = {
      title: row.title,
      company: row.targetCompany,
      role: row.targetTitle,
      language: cvLocale(row.language),
    }
    sources.push({
      ...head,
      id: row.id,
      changes: changes.length,
      hash: hashOf.get(row.id) ?? "",
      input: { ...head, changes, text: cvPlainText(now) },
    })
  }
  return {
    target,
    targets: general.map((row) => ({ id: row.id, title: row.title, isDefault: row.isDefault })),
    sources,
    skipped,
  }
}

/** Whether "Zbierz wszystko" has a general CV to work on: a cheap question for the dashboard. */
export async function canGather(userId: number): Promise<boolean> {
  const row = await db.cvDocument.findFirst({
    where: { userId, docType: "CV", kind: "EDITABLE", jobId: null, targetCompany: null },
    select: { id: true },
  })
  return Boolean(row)
}

/** What "Zbierz wszystko" would work from; `targetId` picks a general CV other than the default. */
export async function gatherPreview(userId: number, targetId?: string): Promise<GatherPreview> {
  const found = await collect(userId, targetId)
  if (!found) return { target: null, targets: [], sources: [], skipped: [] }
  const { id, title, language } = found.target
  return {
    target: { id, title, language },
    targets: found.targets,
    sources: found.sources.map(({ input: _input, hash: _hash, ...source }) => source),
    skipped: found.skipped,
  }
}

/** The sources in groups one call can take: a group ends once it passes MAX_GATHER_CHARS. */
function batches(sources: GatherSourceInput[]): GatherSourceInput[][] {
  const out: GatherSourceInput[][] = []
  let size = 0
  for (const source of sources) {
    if (!out.length || size > MAX_GATHER_CHARS) {
      out.push([])
      size = 0
    }
    out[out.length - 1].push(source)
    size += changesSize(source.changes)
  }
  return out
}

const linesOf = (content: CvContent) =>
  cvPlainText(content)
    .split("\n")
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter(Boolean)

/** Lines the draft adds that name a company a source was written for, unless the CV named it before. */
function companyLines(before: CvContent, after: CvContent, companies: string[]): string[] {
  const had = fold(cvPlainText(before))
  const phrases = [...new Set(companies.map((name) => companyWords(name)))].filter(
    (phrase) => phrase && !hasPhrase(had, phrase)
  )
  if (!phrases.length) return []
  const known = new Set(linesOf(before))
  const lines = linesOf(after).filter(
    (line) => !known.has(line) && phrases.some((phrase) => hasPhrase(fold(line), phrase))
  )
  return [...new Set(lines)].slice(0, MAX_WARNINGS)
}

/**
 * The general CV with the person's changes merged in, not stored. `llm` is injectable for tests.
 * Throws CvError: not-found, no-changes, llm-unavailable, llm-failed.
 */
export async function draftGather(input: {
  userId: number
  targetId: string
  /** The language of the notes for the person */
  locale: CvLanguage
  llm?: LlmClient | null
}): Promise<GatherResult> {
  const { userId } = input
  const found = await collect(userId, input.targetId)
  if (!found) throw new CvError("not-found", "CV not found.")
  if (!found.sources.length) throw new CvError("no-changes", "No other CV adds anything.")
  const llm = input.llm === undefined ? createWritingClient() : input.llm
  if (!llm) throw new CvError("llm-unavailable", "No model is configured.")
  const { target } = found
  const context = await candidateContext(userId)
  // each call merges into what the one before made, so the draft holds every source
  const draft: GatherDraft = {
    content: target.content,
    notes: [],
    reverted: 0,
    kept: 0,
    unverified: [],
  }
  for (const sources of batches(found.sources.map((source) => source.input))) {
    const step = await gatherCv({
      llm,
      cv: draft.content,
      language: target.language,
      locale: input.locale,
      sources,
      context,
      userId,
    })
    if (!step) throw new CvError("llm-failed", "The model did not return a usable CV.")
    draft.content = step.content
    draft.notes.push(...step.notes)
    draft.reverted += step.reverted
    draft.kept += step.kept
    draft.unverified = [...new Set([...draft.unverified, ...step.unverified])]
  }
  const companies = found.sources.flatMap((source) => (source.company ? [source.company] : []))
  return {
    ...draft,
    targetId: target.id,
    updatedAt: target.updatedAt.toISOString(),
    sources: found.sources.map(({ id, hash }) => ({ id, hash })),
    before: target.content,
    warnings: companyLines(target.content, draft.content, companies),
  }
}

/**
 * Marks each source as gathered into the general CV: a version of the source as it is, whose
 * label is that CV's id (collect reads it). A source that changed after the draft read it gets
 * no mark, so all of its changes are offered again rather than the new ones lost.
 */
async function markGathered(
  tx: Prisma.TransactionClient,
  userId: number,
  targetId: string,
  sources: { id: string; hash: string }[]
) {
  const ids = [...new Set(sources.map((source) => source.id))].filter((id) => id !== targetId)
  if (!ids.length) return
  const rows = await tx.cvDocument.findMany({
    where: { id: { in: ids }, userId, docType: "CV" },
    select: { id: true, content: true, language: true },
  })
  for (const row of rows) {
    const content = parseCvContent(row.content)
    const read = sources.find((source) => source.id === row.id)?.hash
    if (!content || contentHash(content) !== read) continue
    await appendVersion(tx, {
      documentId: row.id,
      content,
      language: row.language,
      origin: "gathered",
      label: targetId,
    })
  }
}

/** Section ids and item ids, to check that nothing left the CV. */
function idsOf(content: CvContent): string[] {
  return content.sections.flatMap((section) => [
    section.id,
    ...(section.type === "text" || section.type === "letter"
      ? []
      : section.items.map((item) => `${section.id}/${item.id}`)),
  ])
}

/**
 * Stores a draft the person accepted: the state before is kept in the history and the result is
 * a version of its own ("merged"). `number` is null when the CV already had this content.
 * The sources are marked as gathered, also when the draft changed nothing.
 * Throws CvError: not-found, conflict (the CV changed since the draft), invalid-content.
 */
export async function saveGathered(input: {
  userId: number
  targetId: string
  updatedAt: string
  /** GatherResult.sources: the CVs the draft was made from, to mark as gathered */
  sources: { id: string; hash: string }[]
  content: unknown
}): Promise<{ cvId: string; number: number | null }> {
  const { userId, targetId } = input
  return db.$transaction(async (tx) => {
    const row = await tx.cvDocument.findFirst({
      // a general CV only: a CV for an offer is a source, never what is gathered into
      where: {
        id: targetId,
        userId,
        kind: "EDITABLE",
        docType: "CV",
        jobId: null,
        targetCompany: null,
      },
      select: { id: true, content: true, language: true, updatedAt: true },
    })
    const current = parseCvContent(row?.content)
    if (!row || !current) throw new CvError("not-found", "CV not found.")
    if (row.updatedAt.toISOString() !== input.updatedAt) {
      throw new CvError("conflict", "This CV was changed after the draft was made.")
    }
    const content = parseCvContent(input.content)
    if (!content) throw new CvError("invalid-content", "The draft is not a valid CV.")
    const kept = new Set(idsOf(content))
    if (idsOf(current).some((id) => !kept.has(id))) {
      throw new CvError("invalid-content", "The draft lacks a part of the CV.")
    }
    await markGathered(tx, userId, row.id, input.sources)
    if (contentHash(current) === contentHash(content)) return { cvId: row.id, number: null }
    await keepCurrentState(tx, row)
    await tx.cvDocument.update({
      where: { id: row.id },
      data: {
        content: toStoredJson(content),
        versionCheckedAt: new Date(),
        // the stored PDF no longer matches; cvPdf renders a new one on demand
        pdf: null,
        pdfName: null,
        pdfUpdatedAt: null,
      },
      select: { id: true },
    })
    const version = await appendVersion(tx, {
      documentId: row.id,
      content,
      language: row.language,
      origin: "merged",
    })
    return { cvId: row.id, number: version.number }
  })
}
