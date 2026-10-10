import {workerLoop} from "src/server/queue/worker"

const signal = {stopped: false}
process.on("SIGINT", () => {
  signal.stopped = true
})
process.on("SIGTERM", () => {
  signal.stopped = true
})

console.log("Jobscanner worker listening for search tasks")
workerLoop(signal)
  .then(() => {
    console.log("Jobscanner worker stopped")
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
