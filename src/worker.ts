import { workerLoop } from "src/server/queue/worker"

const signal = { stopped: false }

function stop(kind: NodeJS.Signals) {
  if (signal.stopped) return
  signal.stopped = true
  console.log(`Jobscanner worker received ${kind}`)
}

process.on("SIGINT", () => stop("SIGINT"))
process.on("SIGTERM", () => stop("SIGTERM"))

console.log("Jobscanner worker listening for searches and index crawls")
workerLoop(signal)
  .then(() => {
    console.log("Jobscanner worker stopped")
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
