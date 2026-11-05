/**
 * npm run smoke -w @newrole/jobs-lab [-- --providers GREENHOUSE,LEVER] [--per 1] [--list]
 *
 * Reads real boards from the seed catalog live, one or more per platform, through @newrole/ats,
 * and fails when a platform returns nothing or offers that break the contract (no title, a link
 * that does not parse). Polite like the crawler: one request per second per host, nothing stored.
 * A board can close or empty on its own; a failure names the board so it can be checked here or
 * on the lab's Board screen before blaming the code.
 */
import "./env"
import type { LiveAts } from "@newrole/ats/adapters/registry"
import { indexableBoards } from "@newrole/job-index/index/run"
import { readBoard } from "../src/server/lab"

/** The board APIs most offers come from; career sites have their own daily cap and are left out. */
const DEFAULT_PROVIDERS: LiveAts[] = [
  "GREENHOUSE",
  "LEVER",
  "ASHBY",
  "WORKABLE",
  "SMARTRECRUITERS",
  "RECRUITEE",
  "TEAMTAILOR",
  "PERSONIO",
]

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const boards = indexableBoards()
  if (process.argv.includes("--list")) {
    for (const board of boards)
      console.log(`${board.provider}\t${board.boardId}\t${board.companyName}`)
    return
  }
  const providers = (flag("--providers")
    ?.split(",")
    .map((name) => name.trim().toUpperCase()) ?? DEFAULT_PROVIDERS) as LiveAts[]
  const per = Math.max(1, Number(flag("--per") ?? 1))
  let failed = 0
  for (const provider of providers) {
    const candidates = boards
      .filter((board) => board.provider === provider && board.openJobsAtCheck > 0)
      .sort((a, b) => b.priority - a.priority)
    if (!candidates.length) {
      console.log(`- ${provider}: no board of this platform in the seed catalog`)
      continue
    }
    let passed = 0
    let tried = 0
    // A board that emptied since the catalog was checked is not the code's fault: try the next.
    for (const board of candidates.slice(0, per + 2)) {
      if (passed >= per) break
      tried += 1
      const run = await readBoard(provider, board.boardId, { limit: 3 })
      const good = run.ok && run.count > 0 && run.problems.length === 0
      const mark = good ? "ok  " : "FAIL"
      console.log(
        `${mark} ${provider.padEnd(16)} ${board.boardId.padEnd(28)} ${String(run.count).padStart(
          4
        )} offers ${String(run.ms).padStart(6)} ms${run.error ? `  ${run.error}` : ""}${
          run.problems.length ? `  ${run.problems.length} broken: ${run.problems[0]}` : ""
        }`
      )
      if (good) {
        passed += 1
        const sample = run.jobs[0]
        if (sample)
          console.log(`       e.g. ${sample.title} · ${sample.location ?? "—"} · ${sample.url}`)
      }
    }
    if (passed < per) {
      failed += 1
      console.log(`  ${provider}: ${passed}/${per} boards read after ${tried} tried`)
    }
  }
  console.log(failed ? `\n${failed} platform(s) failed` : "\nEvery platform read")
  process.exitCode = failed ? 1 : 0
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
