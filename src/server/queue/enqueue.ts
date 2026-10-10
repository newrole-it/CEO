import db from "db"

export async function enqueueSearch(searchRunId: string) {
  await db.backgroundTask.create({
    data: {
      type: "RUN_SEARCH",
      payload: {searchRunId},
      status: "PENDING",
      runAt: new Date(),
    },
  })
}
