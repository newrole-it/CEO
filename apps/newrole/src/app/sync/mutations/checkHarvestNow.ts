import { resolver } from "@blitzjs/rpc"
import { enqueueHarvestImport } from "src/server/queue/enqueue"

/** Puts a look at the harvest branches at the front of the worker's queue. */
export default resolver.pipe(resolver.authorize(), async () => ({
  queued: await enqueueHarvestImport(),
}))
