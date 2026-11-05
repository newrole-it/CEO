import { createHash } from "node:crypto"
import { z } from "zod"
import type { BoardList } from "src/server/adapters/types"
import { excerpt } from "src/server/crawler/hygiene"
import { listedJobSchema, sourceTypeSchema, type ListedJob } from "src/shared/schemas"

/**
 * The harvest branch: what a cloud agent read while this computer was off.
 *
 *   harvest/manifest.json                    every board's last cloud read and the run history
 *   harvest/boards/<PROVIDER>/<boardId>.json one board's offers from that read
 *
 * Board files hold only offers, no read times, so a board that did not change keeps its git blob.
 */
export const HARVEST_DIR = "harvest"
export const MANIFEST_PATH = `${HARVEST_DIR}/manifest.json`
export const HARVEST_VERSION = 1
/** Every harvest branch name ends with this. Claude pushes to claude/…, other agents to their own prefix. */
export const HARVEST_BRANCH_SUFFIX = "newrole-harvest"
export const RUNS_KEPT = 48
/** A board file larger than this is not imported. The largest seed board lists a few thousand offers. */
export const MAX_JOBS_PER_BOARD = 10_000

export const HARVEST_AGENTS = ["claude", "cursor", "codex", "other"] as const
export type HarvestAgent = (typeof HARVEST_AGENTS)[number]

export function isHarvestBranch(name: string): boolean {
  return name === HARVEST_BRANCH_SUFFIX || name.endsWith(`/${HARVEST_BRANCH_SUFFIX}`)
}

export function boardKey(provider: string, boardId: string): string {
  return `${provider}:${boardId}`
}

export function boardPath(provider: string, boardId: string): string {
  return `${HARVEST_DIR}/boards/${provider}/${encodeURIComponent(boardId)}.json`
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

const isoDate = z.string().refine((value) => Number.isFinite(Date.parse(value)), "Not a date")

export const harvestBoardSchema = z.object({
  provider: sourceTypeSchema,
  boardId: z.string().min(1),
  companyName: z.string(),
  /** The last attempt, successful or not. */
  checkedAt: isoDate,
  /** The last successful read. Null until one succeeds. */
  fetchedAt: isoDate.nullable(),
  /** When the harvest reads this board again, by the worker's own schedule. */
  nextCheckAt: isoDate,
  outcome: z.enum(["indexed", "failed"]),
  jobs: z.number().int().nonnegative(),
  complete: z.boolean(),
  note: z.string().nullable(),
  /** sha256 of the board file from the last successful read. */
  hash: z.string().nullable(),
})
export type HarvestBoard = z.infer<typeof harvestBoardSchema>

export const harvestRunSchema = z.object({
  startedAt: isoDate,
  finishedAt: isoDate,
  agent: z.enum(HARVEST_AGENTS),
  /** What the agent's prompt says the schedule is. The platforms do not publish it. */
  everyMinutes: z.number().int().positive().nullable(),
  due: z.number().int().nonnegative(),
  indexed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  /** Due boards left for the next run when the time budget ran out. */
  deferred: z.number().int().nonnegative(),
  jobs: z.number().int().nonnegative(),
  /** Hosts this run sent requests to. */
  hosts: z.array(z.string()),
  /** The first failures, for the sync page. */
  errors: z.array(z.object({ key: z.string(), note: z.string() })).default([]),
})
export type HarvestRun = z.infer<typeof harvestRunSchema>

export const harvestManifestSchema = z.object({
  version: z.literal(HARVEST_VERSION),
  generatedAt: isoDate,
  runs: z.array(harvestRunSchema),
  boards: z.record(harvestBoardSchema),
})
export type HarvestManifest = z.infer<typeof harvestManifestSchema>

export function emptyManifest(now: Date): HarvestManifest {
  return { version: HARVEST_VERSION, generatedAt: now.toISOString(), runs: [], boards: {} }
}

export function parseManifest(text: string): HarvestManifest | null {
  try {
    const parsed = harvestManifestSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

type StoredJob = Omit<ListedJob, "publishedAt"> & { publishedAt?: string }

/**
 * One board's read as it goes into git. Descriptions are cut to the excerpt the index keeps
 * (personal data stripped), so the branch never holds more than the local index would.
 */
export function serializeBoard(listed: BoardList): string {
  const jobs: StoredJob[] = listed.jobs.map((job) => ({
    ...job,
    descriptionText: job.descriptionText ? excerpt(job.descriptionText) : undefined,
    publishedAt: job.publishedAt ? job.publishedAt.toISOString() : undefined,
  }))
  return `${JSON.stringify({
    companyName: listed.companyName ?? null,
    note: listed.note ?? null,
    complete: listed.complete === true,
    jobs,
  })}\n`
}

const storedBoardSchema = z.object({
  companyName: z.string().nullable(),
  note: z.string().nullable(),
  complete: z.boolean(),
  jobs: z
    .array(
      listedJobSchema.extend({
        publishedAt: z.preprocess(
          (value) => (typeof value === "string" ? new Date(value) : value),
          z.date().optional()
        ),
      })
    )
    .max(MAX_JOBS_PER_BOARD),
})

/** A board file read back. Null when it is not what serializeBoard writes for this provider. */
export function parseBoard(text: string, provider: string): BoardList | null {
  try {
    const parsed = storedBoardSchema.safeParse(JSON.parse(text))
    if (!parsed.success) return null
    const { companyName, note, complete, jobs } = parsed.data
    if (jobs.some((job) => job.sourceType !== provider)) return null
    if (jobs.some((job) => !/^https?:\/\//i.test(job.originalUrl))) return null
    return {
      jobs,
      proven: true,
      companyName: companyName ?? undefined,
      note: note ?? undefined,
      complete,
      listedCount: jobs.length,
    }
  } catch {
    return null
  }
}
