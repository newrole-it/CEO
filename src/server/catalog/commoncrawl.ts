/**
 * Candidate boards from Common Crawl's URL index: which companies have a board on which platform,
 * read from the addresses Common Crawl archived ("kubo.traffit.com/…" is Traffit board "kubo").
 * Only the addresses are used, never the archived pages; every board is then checked on its own
 * platform by verify.ts under that platform's robots.txt, as any other candidate.
 *
 * Common Crawl's terms of use (commoncrawl.org/terms-of-use, read 2026-11-03) grant a limited
 * licence to use the service and ask users to respect third-party rights and not to disrupt the
 * servers. Its index server asks not to be overloaded and points to the index files for offline
 * use; it answered 504 to every query on 2026-11-03. So this reads the files from
 * data.commoncrawl.org: `cluster.idx` (104 MB for CC-MAIN-2026-43) names the first key of every
 * block of the sorted index, and only the blocks that hold a platform's addresses are fetched, one
 * at a time, by byte range.
 */
import { gunzipSync } from "zlib"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import type { SourceType } from "src/shared/schemas"

export const CC_DATA = "https://data.commoncrawl.org"
export const CC_LATEST = "CC-MAIN-2026-43"
const USER_AGENT = "NewRoleBot/0.1 (+https://newrole.it/bot)"
/** Pause between two block requests. */
const PAUSE_MS = 1000

/** A host in Common Crawl's key order: "kubo.traffit.com" → "com,traffit,kubo". */
export function surtHost(host: string): string {
  return host.toLowerCase().split(".").reverse().join(",")
}

export type ClusterLine = { key: string; file: string; offset: number; length: number }

/** "com,traffit,kubo)/career 20261005124020\tcdx-00123.gz\t250267\t251048\t2" */
export function parseClusterLine(line: string): ClusterLine | null {
  const [head, file, offset, length] = line.split("\t")
  if (!head || !file || !offset || !length) return null
  return { key: head.split(" ")[0], file, offset: Number(offset), length: Number(length) }
}

/**
 * The blocks that can hold keys starting with the prefix: the block where the prefix would begin
 * (its first key sorts before it) and every block whose first key starts with it.
 */
export function blocksForPrefix(index: ClusterLine[], prefix: string): ClusterLine[] {
  let low = 0
  let high = index.length - 1
  let start = 0
  while (low <= high) {
    const middle = (low + high) >> 1
    if (index[middle].key < prefix) {
      start = middle
      low = middle + 1
    } else high = middle - 1
  }
  const blocks: ClusterLine[] = []
  for (let at = start; at < index.length; at += 1) {
    const key = index[at].key
    if (at > start && !key.startsWith(prefix) && key > prefix) break
    blocks.push(index[at])
  }
  return blocks
}

type Platform = {
  provider: SourceType
  /** Key prefixes of the hosts the boards live on. */
  prefixes: string[]
  board: (url: URL) => string | null
  /**
   * Count only captures that answered 200. Greenhouse redirects a closed board to the company's
   * site: 406 of 411 boards the check found gone had only 3xx captures, all 25 that verified had a
   * 200 (CC-MAIN-2026-43). On Recruitee and Teamtailor a quarter of the boards that verified had
   * only redirects, so they keep them.
   */
  okOnly?: boolean
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/
const PATH_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/

/** The one label before a platform's domain, unless it is one of the platform's own hosts. */
function tenantLabel(host: string, domain: string, reserved: string[]): string | null {
  const suffix = `.${domain}`
  if (!host.endsWith(suffix)) return null
  const label = host.slice(0, -suffix.length)
  return SLUG.test(label) && !reserved.includes(label) ? label : null
}

function firstSegment(url: URL, reserved: string[]): string | null {
  const segment = decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] ?? "")
  return PATH_SLUG.test(segment) && !reserved.includes(segment.toLowerCase()) ? segment : null
}

const COMMON = [
  "www",
  "app",
  "api",
  "help",
  "support",
  "status",
  "blog",
  "docs",
  "cdn",
  "assets",
  "static",
  "mail",
]

export const PLATFORMS: Platform[] = [
  {
    provider: "TRAFFIT",
    prefixes: ["com,traffit,"],
    board: (url) => tenantLabel(url.hostname, "traffit.com", [...COMMON, "panel", "pomoc", "e"]),
  },
  {
    provider: "WORKDAY",
    prefixes: ["com,myworkdayjobs,"],
    board: (url) => {
      const host = url.hostname.match(/^([a-z0-9_-]+)\.wd(\d+)\.myworkdayjobs\.com$/)
      if (!host) return null
      const segments = url.pathname.split("/").filter(Boolean)
      // A locale comes before the site in some links ("/en-US/Careers/job/...").
      const site = segments.find((segment) => !/^[a-z]{2}(-[A-Z]{2})?$/.test(segment))
      if (!site || !/^[A-Za-z0-9_-]+$/.test(site) || ["wday", "refreshFacet"].includes(site)) {
        return null
      }
      return `${host[1]}/wd${host[2]}/${site}`
    },
  },
  {
    provider: "TEAMTAILOR",
    prefixes: ["com,teamtailor,"],
    board: (url) => {
      const host = url.hostname
      const match = host.match(/^([a-z0-9][a-z0-9-]{0,62})(\.(na|eu))?\.teamtailor\.com$/)
      if (!match) return null
      const reserved = [
        ...COMMON,
        "career",
        "careers",
        "partners",
        "developer",
        "hub",
        "marketplace",
      ]
      return reserved.includes(match[1]) ? null : host
    },
  },
  {
    provider: "RECRUITEE",
    prefixes: ["com,recruitee,"],
    board: (url) => tenantLabel(url.hostname, "recruitee.com", [...COMMON, "careers", "partners"]),
  },
  {
    provider: "BREEZY",
    prefixes: ["hr,breezy,"],
    board: (url) => tenantLabel(url.hostname, "breezy.hr", [...COMMON, "marketing", "attachments"]),
  },
  {
    provider: "PINPOINT",
    prefixes: ["com,pinpointhq,"],
    board: (url) => tenantLabel(url.hostname, "pinpointhq.com", [...COMMON, "developers"]),
  },
  {
    provider: "PERSONIO",
    prefixes: ["de,personio,jobs,", "com,personio,jobs,"],
    board: (url) =>
      tenantLabel(url.hostname, "jobs.personio.de", COMMON) ??
      tenantLabel(url.hostname, "jobs.personio.com", COMMON),
  },
  {
    provider: "BAMBOOHR",
    prefixes: ["com,bamboohr,"],
    board: (url) =>
      /^\/(careers|jobs)\b/.test(url.pathname)
        ? tenantLabel(url.hostname, "bamboohr.com", [...COMMON, "partners", "marketplace"])
        : null,
  },
  {
    provider: "LEVER",
    prefixes: ["co,lever,jobs)/", "co,lever,eu,jobs)/"],
    board: (url) => {
      const slug = firstSegment(url, ["robots.txt", "favicon.ico"])
      if (!slug) return null
      if (url.hostname === "jobs.eu.lever.co") return `eu:${slug.toLowerCase()}`
      return url.hostname === "jobs.lever.co" ? slug.toLowerCase() : null
    },
  },
  {
    provider: "ASHBY",
    prefixes: ["com,ashbyhq,jobs)/"],
    board: (url) =>
      url.hostname === "jobs.ashbyhq.com"
        ? firstSegment(url, ["api", "robots.txt", "favicon.ico"])?.toLowerCase() ?? null
        : null,
  },
  {
    provider: "GREENHOUSE",
    prefixes: ["io,greenhouse,boards)/", "io,greenhouse,job-boards)/"],
    okOnly: true,
    board: (url) =>
      ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname)
        ? firstSegment(url, ["embed", "v1", "robots.txt", "favicon.ico"])?.toLowerCase() ?? null
        : null,
  },
  {
    provider: "WORKABLE",
    prefixes: ["com,workable,apply)/"],
    board: (url) =>
      url.hostname === "apply.workable.com"
        ? firstSegment(url, ["j", "api", "careers", "robots.txt", "favicon.ico"])?.toLowerCase() ??
          null
        : null,
  },
]

/** Board ids from index lines: "<key> <timestamp> {json with url and status}". */
export function boardsFromLines(lines: string[], platform: Platform): Set<string> {
  const boards = new Set<string>()
  for (const line of lines) {
    // "<key> <timestamp> <json>": the key is URL-encoded and has no space, but may hold "{".
    const json = line.slice(line.indexOf(" ", line.indexOf(" ") + 1) + 1)
    if (!json.startsWith("{")) continue
    let record: { url?: string; status?: string }
    try {
      record = JSON.parse(json)
    } catch {
      continue
    }
    // A redirect still names a board. A 403 does too: BambooHR answers 403 to Common Crawl's
    // crawler on every careers page (CC-MAIN-2026-43), while its board API answers this app. Other
    // errors say nothing about a live board.
    const status = Number(record.status ?? 0)
    if (!record.url || (status >= 400 && status !== 403)) continue
    if (platform.okOnly && (status < 200 || status >= 300)) continue
    let url: URL
    try {
      url = new URL(record.url)
    } catch {
      continue
    }
    const board = platform.board(url)
    if (board) boards.add(board)
  }
  return boards
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithRetry(url: string, headers: Record<string, string> = {}): Promise<Buffer> {
  let wait = 5_000
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, ...headers },
      signal: AbortSignal.timeout(300_000),
    })
    if (response.ok) return Buffer.from(await response.arrayBuffer())
    if (response.status !== 429 && response.status < 500) {
      throw new Error(`${url} answered ${response.status}`)
    }
    await sleep(wait)
    wait *= 2
  }
  throw new Error(`${url} kept failing`)
}

/** The block directory of one crawl, downloaded once and kept in the system temp folder. */
export async function loadClusterIndex(crawl: string): Promise<ClusterLine[]> {
  const folder = join(tmpdir(), "newrole-commoncrawl")
  const file = join(folder, `${crawl}-cluster.idx`)
  if (!existsSync(file)) {
    mkdirSync(folder, { recursive: true })
    writeFileSync(
      file,
      await fetchWithRetry(`${CC_DATA}/cc-index/collections/${crawl}/indexes/cluster.idx`)
    )
  }
  const lines: ClusterLine[] = []
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const parsed = parseClusterLine(line)
    if (parsed) lines.push(parsed)
  }
  return lines
}

async function readBlock(crawl: string, block: ClusterLine): Promise<string[]> {
  const body = await fetchWithRetry(
    `${CC_DATA}/cc-index/collections/${crawl}/indexes/${block.file}`,
    {
      Range: `bytes=${block.offset}-${block.offset + block.length - 1}`,
    }
  )
  return gunzipSync(body).toString("utf8").split("\n")
}

export type Discovery = { provider: SourceType; blocks: number; boards: string[] }

/** Board ids for each platform asked for, from one crawl. */
export async function discoverBoards(args: {
  crawl?: string
  providers?: SourceType[]
  onBlock?: (provider: SourceType, done: number, total: number) => void
}): Promise<Discovery[]> {
  const crawl = args.crawl ?? CC_LATEST
  const index = await loadClusterIndex(crawl)
  const chosen = PLATFORMS.filter(
    (platform) => !args.providers?.length || args.providers.includes(platform.provider)
  )
  const results: Discovery[] = []
  for (const platform of chosen) {
    const boards = new Set<string>()
    const blocks = platform.prefixes.flatMap((prefix) => blocksForPrefix(index, prefix))
    for (const [done, block] of blocks.entries()) {
      const lines = (await readBlock(crawl, block)).filter((line) =>
        platform.prefixes.some((prefix) => line.startsWith(prefix))
      )
      for (const board of boardsFromLines(lines, platform)) boards.add(board)
      args.onBlock?.(platform.provider, done + 1, blocks.length)
      await sleep(PAUSE_MS)
    }
    results.push({ provider: platform.provider, blocks: blocks.length, boards: [...boards].sort() })
  }
  return results
}
