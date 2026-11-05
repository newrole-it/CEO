import { adapterFor, adapters, type LiveAts } from "@newrole/ats/adapters/registry"
import { detectBoard } from "@newrole/ats/boards"
import { findAtsMarkers, findCareersLinks } from "@newrole/ats/careers-detect"
import { readOfferSource, readOfferUrl } from "@newrole/ats/read"
import type { ListedJob } from "@newrole/ats/schemas"
import { createRobotsCache, politeGet } from "@newrole/offers/polite"
import { assertSafeUrl } from "@newrole/offers/url-safety"
import { labHttp } from "./http"

/**
 * What the lab's screens and its smoke run do: the same calls an app makes to @newrole/ats, with
 * timings and the shape of what came back, so a change to the engine shows at once.
 */

export const PROVIDERS = adapters.map((adapter) => adapter.sourceType).sort() as LiveAts[]

export type JobSummary = {
  title: string
  company: string | null
  location: string | null
  workplace: string
  url: string
  externalId: string | null
  descriptionChars: number
  salary: string | null
  needsHydration: boolean
}

export function summarize(job: ListedJob): JobSummary {
  const salary =
    job.salaryMin != null || job.salaryMax != null
      ? `${job.salaryMin ?? "?"}–${job.salaryMax ?? "?"} ${job.salaryCurrency ?? ""}`.trim()
      : null
  return {
    title: job.title,
    company: job.companyName ?? null,
    location: job.locationText ?? null,
    workplace: job.workplaceType ?? "UNKNOWN",
    url: job.originalUrl,
    externalId: job.externalId ?? null,
    descriptionChars: (job.descriptionText ?? "").length,
    salary,
    needsHydration: Boolean(job.needsHydration),
  }
}

/** Problems a listed offer should never have: what the index and the CV app rely on. */
export function jobProblems(job: ListedJob): string[] {
  const problems: string[] = []
  if (!job.title?.trim()) problems.push("no title")
  try {
    const url = new URL(job.originalUrl)
    if (url.protocol !== "https:" && url.protocol !== "http:") problems.push("url is not http(s)")
  } catch {
    problems.push("url does not parse")
  }
  if (!job.sourceType) problems.push("no sourceType")
  return problems
}

export type BoardRun = {
  provider: LiveAts
  boardId: string
  ms: number
  ok: boolean
  error: string | null
  count: number
  complete: boolean | null
  note: string | null
  companyName: string | null
  problems: string[]
  jobs: JobSummary[]
}

/** One board read live through its adapter, as the index reads it. */
export async function readBoard(
  provider: LiveAts,
  boardId: string,
  opts: { limit?: number } = {}
): Promise<BoardRun> {
  const started = Date.now()
  try {
    const listed = await adapterFor(provider).list(boardId.trim(), labHttp())
    const problems = listed.jobs.flatMap((job) =>
      jobProblems(job).map((problem) => `${job.title || job.originalUrl}: ${problem}`)
    )
    return {
      provider,
      boardId,
      ms: Date.now() - started,
      ok: true,
      error: null,
      count: listed.jobs.length,
      complete: listed.complete ?? null,
      note: listed.note ?? null,
      companyName: listed.companyName ?? null,
      problems,
      jobs: listed.jobs.slice(0, opts.limit ?? 50).map(summarize),
    }
  } catch (error) {
    return {
      provider,
      boardId,
      ms: Date.now() - started,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      count: 0,
      complete: null,
      note: null,
      companyName: null,
      problems: [],
      jobs: [],
    }
  }
}

export type LinkRun = {
  url: string
  ms: number
  status: string
  message: string
  from: string | null
  job: JobSummary | null
  /** The whole text, read again from the source the way newrole.it reads it for a CV */
  sourceChars: number | null
  textPreview: string
}

/** One offer from its link, then its whole text from the source: what Add offer in newrole.it does. */
export async function readLink(url: string): Promise<LinkRun> {
  const started = Date.now()
  const http = labHttp()
  const read = await readOfferUrl(url, { exact: true, http })
  if (read.status !== "listed") {
    return {
      url,
      ms: Date.now() - started,
      status: read.status,
      message: read.message,
      from: null,
      job: null,
      sourceChars: null,
      textPreview: "",
    }
  }
  const source = await readOfferSource(
    {
      title: read.job.title,
      company: read.job.companyName ?? read.boardCompany ?? "",
      originalUrl: read.job.originalUrl,
      sourceType: read.job.sourceType,
      sourceBoardId: read.job.sourceBoardId ?? null,
      externalId: read.job.externalId ?? null,
    },
    http
  ).catch(() => null)
  const text = source?.text || read.job.descriptionText || ""
  return {
    url,
    ms: Date.now() - started,
    status: read.status,
    message: read.message,
    from: read.provider ? `${read.from} (${read.provider})` : read.from,
    job: summarize(read.job),
    sourceChars: source ? source.text.length : null,
    textPreview: text.slice(0, 1500),
  }
}

export type CareersRun = {
  url: string
  ms: number
  ok: boolean
  error: string | null
  /** The link itself names a board */
  direct: { provider: string; boardId: string } | null
  markers: { provider: string; boardId: string }[]
  careersLinks: { url: string; text: string }[]
}

/** The boards a careers page links to or embeds, as the index's discovery finds them. */
export async function readCareers(raw: string): Promise<CareersRun> {
  const started = Date.now()
  let url: string
  try {
    url = assertSafeUrl(raw.trim()).toString()
  } catch (error) {
    return {
      url: raw,
      ms: 0,
      ok: false,
      error: error instanceof Error ? error.message : "Invalid URL",
      direct: null,
      markers: [],
      careersLinks: [],
    }
  }
  const board = detectBoard(url)
  const direct = board ? { provider: board.provider, boardId: board.boardId } : null
  const page = await politeGet(url, labHttp(), createRobotsCache())
  if (!page.ok) {
    return {
      url,
      ms: Date.now() - started,
      ok: false,
      error: page.reason,
      direct,
      markers: [],
      careersLinks: [],
    }
  }
  const html = page.response.body
  const at = page.response.url || url
  return {
    url,
    ms: Date.now() - started,
    ok: true,
    error: null,
    direct,
    markers: findAtsMarkers(html, at).map((marker) =>
      marker.kind === "board"
        ? { provider: marker.provider, boardId: marker.boardId }
        : { provider: `${marker.vendor} (link only)`, boardId: marker.url }
    ),
    careersLinks: findCareersLinks(html, at)
      .slice(0, 10)
      .map((link) => ({ url: link.url, text: link.text })),
  }
}
