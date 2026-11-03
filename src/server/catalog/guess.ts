/**
 * Finding a company's board from its name alone: the slugs a company is likely to use on each
 * platform, each one checked on the platform the same way an imported board is.
 */
import db from "db"
import { createRobotsCache, type RobotsCache } from "src/server/discovery/polite-fetch"
import { createHttpClient, type HttpClient } from "src/server/security/safe-fetch"
import type { SourceType } from "src/shared/schemas"
import { checkCatalogBoard } from "./run"
import { verifyBoard } from "./verify"

export const GUESS_ORIGIN = "guess"

const GUESS_PROVIDERS: SourceType[] = [
  "GREENHOUSE",
  "LEVER",
  "ASHBY",
  "WORKABLE",
  "RECRUITEE",
  "TEAMTAILOR",
  "PERSONIO",
  "BREEZY",
  "PINPOINT",
]

const CORPORATE =
  /\b(inc|incorporated|llc|ltd|limited|plc|gmbh|ag|se|sa|s\.a|nv|bv|oy|ab|as|aps|spa|srl|sas|kg|co|corp|corporation|company|group|holding|holdings|sp z o ?o|spolka z ograniczona odpowiedzialnoscia)\b\.?/g

/** "Acme Robotics Sp. z o.o." → ["acmerobotics", "acme-robotics", "acme"]. At most three. */
export function slugCandidates(name: string): string[] {
  const folded = name
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .replace(CORPORATE, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!folded) return []
  const words = folded.split(" ").filter(Boolean)
  const out = [words.join(""), words.join("-"), words[0]]
  return [...new Set(out.filter((slug) => slug.length >= 2))].slice(0, 3)
}

export type GuessHit = {
  provider: SourceType
  boardId: string
  companyName: string
  itJobs: number
}

/** Every platform × slug that verifies as this company with IT offers. Adds the hits to the catalog. */
export async function guessBoards(
  name: string,
  deps: { http?: HttpClient; robots?: RobotsCache } = {}
): Promise<GuessHit[]> {
  const http = deps.http ?? createHttpClient()
  const robots = deps.robots ?? createRobotsCache()
  const slugs = slugCandidates(name)
  const checks = GUESS_PROVIDERS.map(async (provider) => {
    for (const slug of slugs) {
      const verdict = await verifyBoard(
        { provider, providerBoardId: slug, listedName: name },
        http,
        robots
      )
      if (verdict.status === "verified" && verdict.companyName) {
        return { provider, boardId: slug, companyName: verdict.companyName, itJobs: verdict.itJobs }
      }
    }
    return null
  })
  const hits = (await Promise.all(checks)).filter((hit): hit is GuessHit => Boolean(hit))
  for (const hit of hits) {
    const row = await db.catalogBoard.upsert({
      where: { provider_providerBoardId: { provider: hit.provider, providerBoardId: hit.boardId } },
      update: {},
      create: {
        provider: hit.provider,
        providerBoardId: hit.boardId,
        listedName: name,
        origin: GUESS_ORIGIN,
      },
    })
    await checkCatalogBoard(row, { http, robots })
  }
  return hits
}
