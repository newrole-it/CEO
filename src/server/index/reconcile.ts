/**
 * Brings offers stored before the gate and the country columns up to the same rules: each open
 * offer gets its countries and its intermediary mark, and one the gate refuses (not IT, no place,
 * a blocked country, a test post) closes. A board's next read does the same; this does it without waiting for that read.
 */
import db from "db"
import { boardCountry, resolveJobCountries, withBoardCountry } from "src/server/geo/countries"
import { boardIsTech, gateJob, type GateCounts } from "src/server/jobs/gate"
import { classifyTechRole } from "src/server/classify/role"
import { boardIsIntermediary, viaIntermediary } from "src/server/jobs/intermediary"

export type ReconcileSummary = {
  checked: number
  placed: number
  closed: number
  rejected: GateCounts
}

const OPEN = ["ACTIVE", "POSSIBLY_CLOSED"] as const

type Row = {
  id: string
  title: string
  originalUrl: string
  locationText: string | null
  workplaceType: string
  countries: string[]
  countrySource: string | null
  descriptionText: string
  company: { name: string }
}

type Board = { tech: boolean; intermediary: boolean }

async function settle(rows: Row[], board: Board, now: Date, summary: ReconcileSummary) {
  const places = rows.map((row) =>
    resolveJobCountries({
      locationText: row.locationText,
      workplaceType: row.workplaceType,
      // What an earlier read stored from the ATS's own fields stays a fact.
      structured: row.countrySource === "structured" ? row.countries : [],
    })
  )
  const lent = boardCountry(places)
  const closing: string[] = []
  for (const [index, row] of rows.entries()) {
    summary.checked += 1
    // A country an earlier read lent from the board's whole inventory stays: the offers that named
    // it may be closed by now ("IT System Engineer | Ismaning" lost DE that way, 2026-11-03).
    const earlier = row.countrySource === "board" ? row.countries[0] ?? null : null
    const place = withBoardCountry(places[index], lent ?? earlier)
    const reason = gateJob(row, place, { boardIsTech: board.tech })
    if (reason) {
      summary.rejected[reason] = (summary.rejected[reason] ?? 0) + 1
      closing.push(row.id)
      continue
    }
    // A stored verdict from an older classifier gives way to today's one; an undecided title keeps it.
    const verdict = classifyTechRole(row.title)
    await db.job.update({
      where: { id: row.id },
      data: {
        ...(verdict == null ? {} : { isTechRole: verdict }),
        countries: place.countries,
        countryCode: place.countries[0] ?? null,
        remoteRegions: place.remoteRegions,
        countrySource: place.source,
        viaIntermediary: viaIntermediary(row.descriptionText, board.intermediary),
      },
    })
    summary.placed += 1
  }
  for (let start = 0; start < closing.length; start += 1000) {
    const result = await db.job.updateMany({
      where: { id: { in: closing.slice(start, start + 1000) } },
      data: { status: "CLOSED", closedAt: now, lastVerifiedAt: now },
    })
    summary.closed += result.count
  }
}

const SELECT = {
  id: true,
  title: true,
  originalUrl: true,
  locationText: true,
  workplaceType: true,
  countries: true,
  countrySource: true,
  descriptionText: true,
} as const

function boardOf(rows: Row[], tech: boolean): Board {
  return {
    tech,
    intermediary: boardIsIntermediary(
      rows[0].company.name,
      rows.map((row) => row.descriptionText)
    ),
  }
}

export async function reconcileIndex(now = new Date()): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { checked: 0, placed: 0, closed: 0, rejected: {} }
  const pages = await db.careerPage.findMany({ select: { id: true } })
  for (const page of pages) {
    const rows = await db.job.findMany({
      where: { careerPageId: page.id, status: { in: [...OPEN] } },
      select: { ...SELECT, company: { select: { name: true } } },
    })
    if (!rows.length) continue
    // The board's whole open inventory decides whether undecided titles count as IT, as a read does.
    await settle(rows, boardOf(rows, boardIsTech(rows.map((row) => row.title))), now, summary)
  }
  const loose = await db.job.findMany({
    where: { careerPageId: null, status: { in: [...OPEN] } },
    select: { ...SELECT, company: { select: { name: true, isTech: true } } },
  })
  for (const row of loose) {
    await settle([row], boardOf([row], row.company.isTech === true), now, summary)
  }
  return summary
}
