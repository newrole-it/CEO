import { INDEXING_NOTE } from "./store"

/** A started read with no finish after this is treated as stopped, not in progress. */
export const INDEX_STALE_MS = 3 * 60 * 1000
/** Gaps longer than this are a pause, not the crawl pace. */
export const PACE_GAP_CAP_MS = 10 * 60 * 1000

const SLOW_PROVIDERS = new Set(["CAREER_SITE", "SUCCESSFACTORS", "WORKDAY"])

export type ProgressBoard = {
  company: string
  provider: string
  boardId: string
  lastSuccessfulFetchAt: Date | null
  lastCheckedAt: Date | null
  nextCheckAt: Date | null
  indexComplete: boolean
  lastErrorCode: string | null
  fetchNote: string | null
  jobs: number
}

export type CrawlActivity = {
  company: string
  provider: string
  at: string
  jobs: number
  complete: boolean
  slow: boolean
}

export type CrawlSnapshot = {
  total: number
  fetched: number
  apiTotal: number
  apiFetched: number
  apiRemaining: number
  apiFailed: number
  careerTotal: number
  careerFetched: number
  careerRemaining: number
  failed: number
  continuesTomorrow: number
  percent: number
  etaSeconds: number | null
  paceSeconds: number | null
  phase: "reading" | "working" | "paused" | "idle" | "done"
  current: { company: string; provider: string; slow: boolean }[]
  last: { company: string; provider: string; at: string; jobs: number; complete: boolean; slow: boolean } | null
  recent: CrawlActivity[]
  failures: { company: string; provider: string; note: string }[]
  activeSearches: number
}

function slow(provider: string): boolean {
  return SLOW_PROVIDERS.has(provider)
}

function reading(board: ProgressBoard, now: Date): boolean {
  if (board.fetchNote !== INDEXING_NOTE || !board.lastCheckedAt) return false
  if (now.getTime() - board.lastCheckedAt.getTime() > INDEX_STALE_MS) return false
  if (board.lastSuccessfulFetchAt && board.lastSuccessfulFetchAt >= board.lastCheckedAt) return false
  return true
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Median gap between recent API-board finishes. Career sites are excluded because they are much slower. */
export function apiPaceMs(boards: ProgressBoard[], now: Date): number | null {
  const times = boards
    .filter((board) => !slow(board.provider) && board.lastSuccessfulFetchAt)
    .map((board) => board.lastSuccessfulFetchAt!.getTime())
    .sort((a, b) => a - b)
  const hour = times.filter((time) => now.getTime() - time <= 60 * 60 * 1000)
  const source = hour.length >= 4 ? hour : times.slice(-20)
  const gaps: number[] = []
  for (let index = 1; index < source.length; index += 1) {
    const gap = source[index] - source[index - 1]
    if (gap > 0 && gap <= PACE_GAP_CAP_MS) gaps.push(gap)
  }
  return median(gaps.slice(-15))
}

export function buildCrawlSnapshot(args: {
  now: Date
  boards: ProgressBoard[]
  activeSearches: number
}): CrawlSnapshot {
  const { now, boards, activeSearches } = args
  const fetchedBoards = boards.filter((board) => board.lastSuccessfulFetchAt)
  const api = boards.filter((board) => !slow(board.provider))
  const career = boards.filter((board) => slow(board.provider))
  const apiFetched = api.filter((board) => board.lastSuccessfulFetchAt).length
  const careerFetched = career.filter((board) => board.lastSuccessfulFetchAt).length
  const current = boards
    .filter((board) => reading(board, now))
    .sort((a, b) => b.lastCheckedAt!.getTime() - a.lastCheckedAt!.getTime())
    .map((board) => ({ company: board.company, provider: board.provider, slow: slow(board.provider) }))
  const recent = [...fetchedBoards]
    .sort((a, b) => b.lastSuccessfulFetchAt!.getTime() - a.lastSuccessfulFetchAt!.getTime())
    .slice(0, 12)
    .map((board) => ({
      company: board.company,
      provider: board.provider,
      at: board.lastSuccessfulFetchAt!.toISOString(),
      jobs: board.jobs,
      complete: board.indexComplete,
      slow: slow(board.provider),
    }))
  const failedBoards = boards.filter(
    (board) =>
      !board.lastSuccessfulFetchAt &&
      Boolean(board.lastErrorCode) &&
      board.fetchNote !== INDEXING_NOTE
  )
  const failures = failedBoards.slice(0, 8).map((board) => ({
    company: board.company,
    provider: board.provider,
    note: board.fetchNote || board.lastErrorCode || "",
  }))
  const continuesTomorrow = boards.filter(
    (board) =>
      board.lastSuccessfulFetchAt &&
      !board.indexComplete &&
      board.nextCheckAt &&
      board.nextCheckAt > now
  ).length
  const pace = apiPaceMs(boards, now)
  const apiRemaining = api.length - apiFetched
  const apiFailed = api.filter(
    (board) =>
      !board.lastSuccessfulFetchAt &&
      Boolean(board.lastErrorCode) &&
      board.fetchNote !== INDEXING_NOTE
  ).length
  const careerRemaining = career.length - careerFetched
  const lastAt = recent[0] ? new Date(recent[0].at).getTime() : 0
  const lastAge = lastAt ? now.getTime() - lastAt : Number.POSITIVE_INFINITY
  const fillingSlow = Boolean(recent[0]?.slow && !recent[0].complete && lastAge < 4 * 60 * 1000)
  const fresh = lastAge < 90_000
  const cleanRemaining = apiRemaining - apiFailed
  let phase: CrawlSnapshot["phase"] = "idle"
  if (current.length) phase = "reading"
  else if (apiRemaining === 0 && careerRemaining === 0 && continuesTomorrow === 0) phase = "done"
  else if (activeSearches > 0 && !fresh && !fillingSlow) phase = "paused"
  else if (fresh || fillingSlow) phase = "working"
  const total = boards.length
  const fetched = fetchedBoards.length
  return {
    total,
    fetched,
    apiTotal: api.length,
    apiFetched,
    apiRemaining,
    apiFailed,
    careerTotal: career.length,
    careerFetched,
    careerRemaining,
    failed: failedBoards.length,
    continuesTomorrow,
    percent: total ? Math.round((fetched / total) * 100) : 0,
    etaSeconds: cleanRemaining > 0 && pace ? Math.round((cleanRemaining * pace) / 1000) : null,
    paceSeconds: pace ? Math.round(pace / 1000) : null,
    phase,
    current,
    last: recent[0]
      ? {
          company: recent[0].company,
          provider: recent[0].provider,
          at: recent[0].at,
          jobs: recent[0].jobs,
          complete: recent[0].complete,
          slow: recent[0].slow,
        }
      : null,
    recent,
    failures,
    activeSearches,
  }
}
