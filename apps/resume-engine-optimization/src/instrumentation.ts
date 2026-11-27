/**
 * Runs once when the Next server boots: a public server with sample secrets stops before it serves
 * anyone.
 * Then the server starts newrole.it's background work, so the app needs no second process, and
 * folds old pairs of an uploaded PDF and its editable copy into one CV (src/server/cv/structure.ts).
 * An offer search the last server left running is marked failed, as "interrupted".
 */
export async function register() {
  // before anything can start a search: only the searches of the last server are interrupted
  const bootedAt = new Date()
  // Inside the condition, as the Next docs on instrumentation ask: the code is Node-only.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertSafeProductionEnv } = await import("src/server/security/env-check")
    try {
      assertSafeProductionEnv()
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    }
    const { startInServer } = await import("src/server/queue/worker")
    startInServer()
    // an offer search the last server stopped in the middle of cannot go on (src/server/offer-search/run.ts)
    void import("src/server/offer-search/run")
      .then(({ recoverInterruptedSearches }) => recoverInterruptedSearches(bootedAt))
      .then(
        (failed) =>
          failed && console.log(`Marked ${failed} interrupted offer search(es) as failed`),
        (error: unknown) =>
          console.error(
            "Recovering interrupted offer searches failed",
            error instanceof Error ? error.message : error
          )
      )
    // an uploaded PDF and its editable copy, from before they were one CV, become one
    const { mergeUploadedCopies } = await import("src/server/cv/structure")
    void mergeUploadedCopies().then(
      (merged) => merged && console.log(`Merged ${merged} uploaded CV(s) with their editable copy`),
      (error: unknown) =>
        console.error("Merging uploaded CVs failed", error instanceof Error ? error.message : error)
    )
  }
}
