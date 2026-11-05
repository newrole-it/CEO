/**
 * Candidate boards from freehire's board catalog (github.com/strelov1/freehire, MIT licence).
 * The catalog lived in `sources/<provider>.yml` until freehire moved it into Postgres
 * (PR #2357, merged 2026-09-03); the parent commit of that merge is the last one with the files.
 * A row here is only a lead: nothing reaches the index before verify.ts checks it on the platform.
 * The licence notice is in sources/freehire-boards-NOTICE.md.
 */
import type { SourceType } from "@newrole/ats/schemas"

export const FREEHIRE_REPO = "strelov1/freehire"
export const FREEHIRE_COMMIT = "1d3d8028cba03182f7aef37c628d469fed5b514e"
export const FREEHIRE_ORIGIN = `freehire@${FREEHIRE_COMMIT.slice(0, 8)}`

/**
 * Files whose board ids mean the same thing to this app's adapters (checked 2026-11-03 against
 * the adapters' URL builders). Workday ids are converted (workdayBoardId). SmartRecruiters is left
 * out: its posting API stays off while api.smartrecruiters.com's robots.txt disallows other crawlers.
 */
export const FREEHIRE_FILES: Record<string, SourceType> = {
  greenhouse: "GREENHOUSE",
  ashby: "ASHBY",
  lever: "LEVER",
  workable: "WORKABLE",
  recruitee: "RECRUITEE",
  teamtailor: "TEAMTAILOR",
  personio: "PERSONIO",
  pinpoint: "PINPOINT",
  breezy: "BREEZY",
  bamboohr: "BAMBOOHR",
  workday: "WORKDAY",
}

/**
 * freehire keys a Workday board "tenant.wdN.myworkdayjobs.com/site"; this app keys it
 * "tenant/wdN/site" (career-site.ts). The site keeps its case: it is part of the URL. A board on
 * the shared wd1.myworkdaysite.com host has no tenant host to read and is skipped.
 */
export function workdayBoardId(board: string): string | null {
  const match = board
    .trim()
    .match(/^([a-z0-9_-]+)\.wd(\d+)\.myworkdayjobs\.com\/([A-Za-z0-9_-]+)\/?$/i)
  return match ? `${match[1].toLowerCase()}/wd${match[2]}/${match[3]}` : null
}

export function freehireFileUrl(file: string): string {
  return `https://raw.githubusercontent.com/${FREEHIRE_REPO}/${FREEHIRE_COMMIT}/sources/${file}.yml`
}

export type CandidateBoard = {
  provider: SourceType
  providerBoardId: string
  listedName: string
}

type RawEntry = { company?: string; board?: string; region?: string }

function unquote(value: string): string {
  const text = value.trim()
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    try {
      return JSON.parse(text) as string
    } catch {
      return text.slice(1, -1)
    }
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) {
    return text.slice(1, -1).replace(/''/g, "'")
  }
  return text
}

/** The files are a flat YAML list of `- company: … / board: … / region: …`. Nothing else is read. */
export function parseBoardYaml(text: string): RawEntry[] {
  const entries: RawEntry[] = []
  let current: RawEntry | null = null
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue
    const item = line.match(/^-\s+([a-z_]+):\s*(.*)$/)
    const field = line.match(/^\s+([a-z_]+):\s*(.*)$/)
    const match = item ?? field
    if (!match) continue
    if (item) {
      current = {}
      entries.push(current)
    }
    if (!current) continue
    const key = match[1] as keyof RawEntry
    if (key === "company" || key === "board" || key === "region") current[key] = unquote(match[2])
  }
  return entries
}

const DOTTED_IDS = new Set<SourceType>([
  "TEAMTAILOR",
  "PERSONIO",
  "ASHBY",
  "LEVER",
  "GREENHOUSE",
  "WORKABLE",
])

/** Slugs and hosts only: letters, digits, dot, dash, underscore. Teamtailor keys are careers hosts. */
const BOARD_ID = /^[a-z0-9][a-z0-9._-]{0,120}$/

export function candidateFrom(file: string, entry: RawEntry): CandidateBoard | null {
  const provider = FREEHIRE_FILES[file]
  if (!provider) return null
  const name = (entry.company || "").replace(/\s+/g, " ").trim()
  if (provider === "WORKDAY") {
    const id = workdayBoardId(entry.board || "")
    return id && name ? { provider, providerBoardId: id, listedName: name.slice(0, 200) } : null
  }
  const board = (entry.board || "").trim().toLowerCase()
  if (!board || !name || !BOARD_ID.test(board)) return null
  // On tenant-hosted platforms a dot would make the id a custom domain; on path-based ones
  // ("mistral.ai" on Ashby) it is an ordinary slug.
  if (board.includes(".") && !DOTTED_IDS.has(provider)) return null
  const region = (entry.region || "").trim().toLowerCase()
  const providerBoardId = provider === "LEVER" && region === "eu" ? `eu:${board}` : board
  return { provider, providerBoardId, listedName: name.slice(0, 200) }
}

export function candidatesFromYaml(file: string, text: string): CandidateBoard[] {
  const seen = new Set<string>()
  const out: CandidateBoard[] = []
  for (const entry of parseBoardYaml(text)) {
    const candidate = candidateFrom(file, entry)
    if (!candidate) continue
    const key = `${candidate.provider}:${candidate.providerBoardId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(candidate)
  }
  return out
}
