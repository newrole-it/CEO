import "src/server/load-env"
import { currentTaskId, requeueInFlight, workerLoop } from "src/server/queue/worker"
import { assertSafeProductionEnv } from "src/server/security/env-check"

assertSafeProductionEnv()

/** Ctrl+C has to feel immediate. An index crawl can run for minutes and resumes on the next start. */
const STOP_GRACE_MS = 5000

const signal = { stopped: false }

function stop(kind: NodeJS.Signals) {
  if (signal.stopped) return
  signal.stopped = true
  console.log(`newrole.it worker received ${kind}`)
  setTimeout(() => {
    void requeueInFlight(currentTaskId())
      .catch((error) => console.error("Could not requeue in-flight work", error))
      .finally(() => {
        console.log("newrole.it worker stopped")
        process.exit(0)
      })
  }, STOP_GRACE_MS).unref()
}

process.on("SIGINT", () => stop("SIGINT"))
process.on("SIGTERM", () => stop("SIGTERM"))

console.log("newrole.it worker listening for searches and index crawls")
workerLoop(signal)
  .then(() => {
    console.log("newrole.it worker stopped")
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
