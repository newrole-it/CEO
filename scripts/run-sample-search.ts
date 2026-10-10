import db from "db"
import {executeSearch} from "../src/server/search/pipeline"

async function main() {
  const user = await db.user.findUnique({where: {email: process.env.OWNER_EMAIL || "rafal@jobscanner.local"}})
  if (!user) throw new Error("owner missing")
  const search = await db.savedSearch.create({
    data: {
      userId: user.id,
      name: "Head of Engineering",
      phrase: "Head of Engineering",
      locationHint: "Warsaw",
      workMode: "ANY",
      targetTitles: [],
      includedKeywords: [],
      excludedKeywords: [],
      seniority: [],
    },
  })
  const run = await db.searchRun.create({
    data: {savedSearchId: search.id, status: "QUEUED", phase: "queued", progress: 1, message: "Queued"},
  })
  console.log(`SEARCH ${search.id} RUN ${run.id}`)
  const started = Date.now()
  await executeSearch(run.id)
  const finished = await db.searchRun.findUnique({where: {id: run.id}})
  const count = await db.jobMatch.count({where: {searchRunId: run.id}})
  console.log(`DONE status=${finished?.status} matches=${count} message=${finished?.message} ms=${Date.now() - started}`)
  if (finished?.errorSummary) console.log(finished.errorSummary)
  await db.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await db.$disconnect()
  process.exit(1)
})
