import { Prisma } from "@prisma/client"
import db from "db"

type Writer = Prisma.TransactionClient | typeof db

export async function enqueueSearch(searchRunId: string, client: Writer = db) {
  await client.backgroundTask.create({
    data: {
      type: "RUN_SEARCH",
      payload: { searchRunId },
      status: "PENDING",
      runAt: new Date(),
    },
  })
}
