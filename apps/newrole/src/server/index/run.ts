import db from "db"
import { decideFetch } from "@newrole/offers/source-policies"
import { loadSeedBoards, type SeedBoard } from "config/seed-boards"
import { listCareerSite } from "src/server/adapters/career-site"
import { adapterFor, type BoardList, type LiveAts } from "src/server/adapters/registry"
import type { HttpClient } from "src/server/security/safe-fetch"
import { createHttpClient } from "src/server/security/safe-fetch"
import { conditionalHttp, NotModifiedError } from "./conditional"
import { BOARD_RETRY_MS, nextCrawlAt, SOURCE_RETRY_MS } from "./schedule"
import {
  knownCanonicals,
  noteIndexFailure,
  noteIndexStart,
  noteUnchanged,
  storeBoardInventory,
} from "./store"

const CAREER = new Set<SeedBoard["provider"]>(["CAREER_SITE", "SUCCESSFACTORS", "WORKDAY"])

/** Pages fetched from one career host before the worker looks for a search again. */
export const CAREER_BATCH = 30

/** A board API that answered with an empty list says so in the note; that still proves the board. */
export function isEmptyBoardNote(note: string | undefined): boolean {
  return /no open jobs|has no open|empty jobs array/i.test(note || "")
}

/** A board API answers with its whole list unless the adapter reports a cap. */
export function settleApiList(listed: BoardList): BoardList {
  return {
    ...listed,
    complete: listed.complete !== false,
    listedCount: listed.jobs.length,
    coveredUrls: undefined,
  }
}

/** Seed boards read through a board API. Career sites have a daily page cap and stay local. */
export function isCareerProvider(provider: SeedBoard["provider"]): boolean {
  return CAREER.has(provider)
}

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
    // A due daily refresh is one or two API calls. A backfill is a 30-page batch, so it
    // goes after the refreshes; otherwise one large career site delays the whole catalog.
    const rank = (page: (typeof pages)[number] | undefined) => {
      if (!page?.lastSuccessfulFetchAt) return 0
      if (page.indexComplete) return 1
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
  const page = await noteIndexStart(board, now)
  // A 304 is recorded as an unchanged, complete crawl. After an unfinished crawl it would park
  // the board for a day with the inventory still half read, so validators go only after a full one.
  const wrapped = conditionalHttp(http, page.indexComplete ? page : {})
  const career = CAREER.has(board.provider)
  try {
    const listed = career
      ? await listCareerSite(board.boardId, wrapped.client, board.companyName, {
          detailBudget: CAREER_BATCH,
          knownUrls: await knownCanonicals(page.id),
        })
      : await adapterFor(board.provider as LiveAts).list(
          board.boardId,
          wrapped.client,
          board.companyName
        )
    const emptyBoard = !career && isEmptyBoardNote(listed.note)
    // Unproven is a failure in every case, whatever else the result says: storing it would
    // mark the board as successfully fetched.
    if (!listed.proven && !emptyBoard) {
      await noteIndexFailure(
        board,
        now,
        new Date(now.getTime() + (career ? SOURCE_RETRY_MS : BOARD_RETRY_MS)),
        listed.note || (career ? "Career page was not proven" : "Board was not proven")
      )
      return "failed"
    }
    if (career) {
      // A career result is complete only when the adapter says so; a partial read never closes.
      listed.complete = listed.complete === true
      listed.listedCount = listed.listedCount ?? listed.jobs.length
    } else {
      Object.assign(listed, settleApiList(listed))
    }
    if (!listed.complete) listed.coveredUrls = undefined
    const complete = listed.complete === true
    await storeBoardInventory({
      board,
      listed,
      now,
      etag: wrapped.state.etag,
      lastModified: wrapped.state.lastModified,
      nextCheckAt: nextCrawlAt(
        now,
        complete,
        listed.budgetExhausted === true,
        listed.jobs.length > 0
      ),
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
    await noteIndexFailure(board, now, new Date(now.getTime() + BOARD_RETRY_MS), message)
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
