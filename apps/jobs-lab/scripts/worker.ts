/**
 * npm run worker -w @newrole/jobs-lab: the engine's worker on the lab's database. Watched companies,
 * the seed catalog, the checked outside catalog and searches, at the polite pace. Ctrl+C stops it;
 * an index crawl resumes on the next start.
 */
import "./env"
import { requeueInFlight, currentTaskId, workerLoop } from "@newrole/job-index/worker"
import { bindLabDatabase } from "./bind"

const db = bindLabDatabase()
const signal = { stopped: false }

function stop(kind: NodeJS.Signals) {
  if (signal.stopped) return
  signal.stopped = true
  console.log(`jobs-lab worker received ${kind}`)
  setTimeout(() => {
    void requeueInFlight(currentTaskId())
      .catch((error) => console.error("Could not requeue in-flight work", error))
      .finally(() => process.exit(0))
  }, 5000).unref()
}

process.on("SIGINT", () => stop("SIGINT"))
process.on("SIGTERM", () => stop("SIGTERM"))

console.log("jobs-lab worker indexing into the lab database")
workerLoop(signal)
  .then(() => db.$disconnect())
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
