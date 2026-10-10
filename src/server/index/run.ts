import db from "db"
import { decideFetch } from "config/source-policies"
import { loadSeedBoards, type SeedBoard } from "config/seed-boards"
import { listCareerSite } from "src/server/adapters/career-site"
import { adapterFor, type LiveAts } from "src/server/adapters/registry"
import type { HttpClient } from "src/server/security/safe-fetch"
import { createHttpClient } from "src/server/security/safe-fetch"
import { conditionalHttp, NotModifiedError } from "./conditional"
import { nextCrawlAt } from "./schedule"
import {
  ensureCareerPage,
  knownCanonicals,
  noteIndexFailure,
  noteUnchanged,
  storeBoardInventory,
} from "./store"

const CAREER = new Set<SeedBoard["provider"]>(["CAREER_SITE", "SUCCESSFACTORS", "WORKDAY"])

/** Pages fetched from one career host before the worker looks for a search again. */
export const CAREER_BATCH = 30

export function boardIsIndexable(board: SeedBoard): boolean {
  try {
    const decision = decideFetch(new URL(board.apiUrl))
    return decision.allow && decision.state !== "link_only"
  } catch {
    return false
  }
}

export function indexableBoards(boards: SeedBoard[] = loadSeedBoards()): SeedBoard[] {
  return boards.filter(boardIsIndexable)
}

export async function nextDueBoard(now = new Date()): Promise<SeedBoard | null> {
  const boards = indexableBoards()
  const pages = await db.careerPage.findMany({
    select: {
      provider: true,
      providerBoardId: true,
      nextCheckAt: true,
      indexComplete: true,
      lastSuccessfulFetchAt: true,
    },
  })
  const byKey = new Map(
    pages
      .filter((page) => page.providerBoardId)
      .map((page) => [`${page.provider}:${page.providerBoardId}`, page])
  )
  const due = boards.filter((board) => {
    const page = byKey.get(`${board.provider}:${board.boardId}`)
    if (!page?.nextCheckAt) return true
    return page.nextCheckAt <= now
  })
  due.sort((a, b) => {
    const left = byKey.get(`${a.provider}:${a.boardId}`)
    const right = byKey.get(`${b.provider}:${b.boardId}`)
    const rank = (page: (typeof pages)[number] | undefined) => {
      if (!page?.lastSuccessfulFetchAt) return 0
      if (!page.indexComplete) return 1
      return 2
    }
    const delta = rank(left) - rank(right)
    if (delta !== 0) return delta
    const leftAt = left?.nextCheckAt?.getTime() ?? 0
    const rightAt = right?.nextCheckAt?.getTime() ?? 0
    return leftAt - rightAt
  })
  return due[0] ?? null
}

export async function indexBoard(
  board: SeedBoard,
  http: HttpClient = createHttpClient(),
  now = new Date()
): Promise<"indexed" | "unchanged" | "skipped" | "failed"> {
  if (!boardIsIndexable(board)) return "skipped"
  const page = await ensureCareerPage(board, board.companyName, now)
  const wrapped = conditionalHttp(http, page)
  try {
    const listed = CAREER.has(board.provider)
      ? await listCareerSite(board.boardId, wrapped.client, board.companyName, {
          detailBudget: CAREER_BATCH,
          knownUrls: await knownCanonicals(page.id),
        })
      : await adapterFor(board.provider as LiveAts).list(
          board.boardId,
          wrapped.client,
          board.companyName
        )
    if (CAREER.has(board.provider) && listed.complete == null) {
      listed.complete = listed.proven
      listed.listedCount = listed.listedCount ?? listed.jobs.length
      if (!listed.proven) {
        await noteIndexFailure(
          board,
          now,
          new Date(now.getTime() + 6 * 60 * 60 * 1000),
          listed.note || "Career page was not proven"
        )
        return "failed"
      }
    }
    if (!CAREER.has(board.provider)) {
      const emptyBoard = /no open jobs|has no open|empty jobs array/i.test(listed.note || "")
      listed.complete = listed.proven || emptyBoard
      listed.listedCount = listed.jobs.length
      listed.coveredUrls = undefined
      if (!listed.proven && listed.jobs.length === 0 && !emptyBoard) {
        await noteIndexFailure(
          board,
          now,
          new Date(now.getTime() + 15 * 60 * 1000),
          listed.note || "Board was not proven"
        )
        return "failed"
      }
    }
    const complete = listed.complete === true
    await storeBoardInventory({
      board,
      listed,
      now,
      etag: wrapped.state.etag,
      lastModified: wrapped.state.lastModified,
      nextCheckAt: nextCrawlAt(now, complete, listed.budgetExhausted === true),
    })
    console.log(
      `Indexed ${board.companyName}: stored ${listed.jobs.length}, listed ${
        listed.listedCount ?? listed.jobs.length
      }, complete ${complete}`
    )
    return "indexed"
  } catch (error) {
    if (error instanceof NotModifiedError) {
      await noteUnchanged({
        board,
        now,
        nextCheckAt: nextCrawlAt(now, true, false),
        etag: error.etag ?? wrapped.state.etag,
        lastModified: error.lastModified ?? wrapped.state.lastModified,
      })
      console.log(`Indexed ${board.companyName}: not modified`)
      return "unchanged"
    }
    const message = error instanceof Error ? error.message : "Index failed"
    await noteIndexFailure(board, now, new Date(now.getTime() + 15 * 60 * 1000), message)
    console.error(`Index ${board.companyName} failed`, message)
    return "failed"
  }
}

/** Boards that have never completed a fetch. A search tops these up; the worker does the rest. */
export async function boardsAwaitingIndex(limit: number): Promise<SeedBoard[]> {
  const boards = indexableBoards()
  const pages = await db.careerPage.findMany({
    where: { lastSuccessfulFetchAt: { not: null } },
    select: { provider: true, providerBoardId: true },
  })
  const done = new Set(pages.map((page) => `${page.provider}:${page.providerBoardId}`))
  return boards.filter((board) => !done.has(`${board.provider}:${board.boardId}`)).slice(0, limit)
}

/** One due board. Returns false when every allowed board is waiting for its next crawl. */
export async function indexNextDue(http?: HttpClient, now = new Date()): Promise<boolean> {
  const board = await nextDueBoard(now)
  if (!board) return false
  await indexBoard(board, http, now)
  return true
}
