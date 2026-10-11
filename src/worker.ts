import { workerLoop } from "src/server/queue/worker"

const signal = { stopped: false }

function stop(kind: NodeJS.Signals) {
  if (signal.stopped) return
  signal.stopped = true
  console.log(`Nowa Rola worker received ${kind}`)
}

process.on("SIGINT", () => stop("SIGINT"))
process.on("SIGTERM", () => stop("SIGTERM"))

console.log("Nowa Rola worker listening for searches and index crawls")
workerLoop(signal)
  .then(() => {
    console.log("Nowa Rola worker stopped")
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
