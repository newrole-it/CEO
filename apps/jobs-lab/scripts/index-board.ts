/**
 * npm run index -w @newrole/jobs-lab -- <PROVIDER> <boardId> [company name]   (a seed catalog board)
 *
 * Indexes one board into the lab's database with the engine (@newrole/job-index/index/run) and
 * prints what the index then holds for it: the crawl the worker runs, one board at a time.
 */
import "./env"
import { indexBoard } from "@newrole/job-index/index/run"
import { loadSeedBoards, type SeedBoard } from "@newrole/job-index/config/seed-boards"
import { bindLabDatabase } from "./bind"

async function main() {
  const [provider, boardId, ...name] = process.argv.slice(2)
  if (!provider || !boardId) {
    console.error("Usage: npm run index -w @newrole/jobs-lab -- GREENHOUSE <boardId> [company]")
    process.exit(2)
  }
  const db = bindLabDatabase()
  const known = loadSeedBoards().find(
    (board) =>
      board.provider === provider.toUpperCase() &&
      board.boardId.toLowerCase() === boardId.toLowerCase()
  )
  if (!known) {
    // a board's API address comes from the seed catalog, and the source policy checks it
    console.error(
      "Not a board of the seed catalog. List them with: npm run smoke -w @newrole/jobs-lab -- --list"
    )
    process.exit(2)
  }
  const board: SeedBoard = name.length ? { ...known, companyName: name.join(" ") } : known
  const started = Date.now()
  const outcome = await indexBoard(board)
  const page = await db.careerPage.findUnique({
    where: {
      provider_providerBoardId: { provider: board.provider, providerBoardId: board.boardId },
    },
    select: { id: true, fetchNote: true, listedCount: true, indexComplete: true },
  })
  const active = page
    ? await db.job.count({ where: { careerPageId: page.id, status: "ACTIVE" } })
    : 0
  console.log(
    JSON.stringify(
      {
        board: `${board.provider} ${board.boardId}`,
        outcome,
        ms: Date.now() - started,
        page,
        active,
      },
      null,
      2
    )
  )
  await db.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
