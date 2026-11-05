import "./only-test-db"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, test } from "node:test"
import type { HttpClient } from "../src/server/security/safe-fetch"

const scratch = mkdtempSync(path.join(tmpdir(), "newrole-harvest-test-"))
const remote = path.join(scratch, "remote.git")
const clone = path.join(scratch, "clone")

function sh(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" })
}

sh(scratch, "init", "--bare", "-q", remote)
sh(scratch, "init", "-q", clone)
sh(
  clone,
  "-c",
  "user.email=t@example.com",
  "-c",
  "user.name=t",
  "commit",
  "-q",
  "--allow-empty",
  "-m",
  "start"
)

after(async () => {
  const db = (await import("../db")).default
  await db.harvestImport.deleteMany({})
  await db.$disconnect()
  rmSync(scratch, { recursive: true, force: true })
})

/** A Greenhouse board API that answers for one board with the given titles. */
function greenhouse(boardId: string, company: string, titles: string[]): HttpClient {
  return {
    async post() {
      throw new Error("post is unused")
    },
    async get(url: string) {
      return {
        url,
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          meta: { total: titles.length },
          jobs: titles.map((title, index) => ({
            id: 9000 + index,
            title,
            company_name: company,
            absolute_url: `https://job-boards.greenhouse.io/${boardId}/jobs/${9000 + index}`,
            location: { name: "Warsaw, Poland" },
          })),
        }),
      }
    },
  }
}

async function harvestOnce(at: Date, titles: string[]) {
  const { indexableBoards } = await import("../src/server/index/run")
  const { harvestableBoards, mergeRun, readDueBoards } = await import(
    "../src/server/harvest/collect"
  )
  const { emptyManifest, MANIFEST_PATH, parseManifest } = await import(
    "../src/server/harvest/format"
  )
  const git = await import("../src/server/harvest/git")
  const board = harvestableBoards(indexableBoards()).find((item) => item.provider === "GREENHOUSE")!
  const branch = "claude/newrole-harvest"
  const options = { cwd: clone }
  const exists = (await git.remoteHarvestBranches(remote, options)).length > 0
  if (exists) await git.fetchBranches(remote, [branch], options)
  const parent = exists ? git.localRef(branch) : null
  const text = parent ? await git.readFileAt(parent, MANIFEST_PATH, options) : null
  const previous = (text && parseManifest(text)) || emptyManifest(at)
  const { results, deferred } = await readDueBoards({
    boards: [board],
    http: greenhouse(board.boardId, board.companyName, titles),
    deadline: Number.POSITIVE_INFINITY,
    now: () => at,
  })
  assert.equal(results[0].ok, true, results[0].ok ? "" : results[0].note)
  const { manifest, files } = mergeRun({
    previous,
    results,
    deferred,
    due: 1,
    startedAt: at,
    finishedAt: at,
    agent: "claude",
    everyMinutes: 120,
    hosts: [],
  })
  files.set(MANIFEST_PATH, JSON.stringify(manifest))
  const commit = await git.commitFiles({ parent, files, message: "harvest", options })
  await git.pushCommit(remote, commit, branch, options)
  return board
}

test("offers a cloud agent pushed reach the index once, and a tampered file is refused", async () => {
  const db = (await import("../db")).default
  const { importHarvest } = await import("../src/server/harvest/import")
  const { boardPath } = await import("../src/server/harvest/format")
  // Ahead of any local read the test database may hold for this board.
  const first = new Date(Date.now() + 60 * 60 * 1000)
  const board = await harvestOnce(first, ["Harvest Staff Engineer", "Harvest Data Engineer"])

  const imported = await importHarvest({ cwd: clone, remote })
  assert.equal(imported.status, "imported")
  assert.equal(imported.boards, 1)
  const page = await db.careerPage.findUnique({
    where: { provider_providerBoardId: { provider: "GREENHOUSE", providerBoardId: board.boardId } },
  })
  assert.equal(page?.lastSuccessfulFetchAt?.toISOString(), first.toISOString())
  const titles = await db.job.findMany({
    where: { careerPageId: page!.id, status: "ACTIVE", title: { startsWith: "Harvest " } },
    select: { title: true },
    orderBy: { title: "asc" },
  })
  assert.deepEqual(
    titles.map((job) => job.title),
    ["Harvest Data Engineer", "Harvest Staff Engineer"]
  )

  assert.equal((await importHarvest({ cwd: clone, remote })).status, "nothing_new")

  // A later read whose board file was changed after the manifest was written.
  const second = new Date(first.getTime() + 25 * 60 * 60 * 1000)
  await harvestOnce(second, ["Harvest Staff Engineer"])
  const git = await import("../src/server/harvest/git")
  await git.fetchBranches(remote, ["claude/newrole-harvest"], { cwd: clone })
  const tip = git.localRef("claude/newrole-harvest")
  const forged = await git.commitFiles({
    parent: tip,
    files: new Map([
      [
        boardPath("GREENHOUSE", board.boardId),
        '{"companyName":null,"note":null,"complete":true,"jobs":[]}\n',
      ],
    ]),
    message: "forged",
    options: { cwd: clone },
  })
  await git.pushCommit(remote, forged, "claude/newrole-harvest", { cwd: clone })
  const refused = await importHarvest({ cwd: clone, remote })
  assert.equal(refused.status, "failed")
  const still = await db.job.count({
    where: { careerPageId: page!.id, status: "ACTIVE", title: { startsWith: "Harvest " } },
  })
  assert.equal(still, 2)
  const row = await db.harvestImport.findFirst({ orderBy: { startedAt: "desc" } })
  assert.match(row?.error ?? "", /did not match the manifest/)

  await db.job.deleteMany({ where: { careerPageId: page!.id, title: { startsWith: "Harvest " } } })
})

test("no harvest branch is a plain fact, not a failure", async () => {
  const empty = path.join(scratch, "empty.git")
  sh(scratch, "init", "--bare", "-q", empty)
  const { importHarvest } = await import("../src/server/harvest/import")
  assert.equal((await importHarvest({ cwd: clone, remote: empty })).status, "no_branch")
})
