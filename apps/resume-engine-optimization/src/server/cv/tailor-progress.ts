import { TAILOR_STEPS, LETTER_STEPS } from "@newrole/cv-core/progress"
import type { StepReporter, StepUpdate, TailorProgress } from "@newrole/cv-core/progress"

/**
 * What a run of writing for an offer has done so far, for the page that waits for it
 * (@newrole/cv-editor's TailorStart polls it while its own request runs). Kept in memory: one
 * process serves the app on the person's machine. A poll that reaches a process without the run
 * gets nothing, and the page still gets its result from its own request.
 */

const TTL_MS = 15 * 60 * 1000
const MAX_RUNS = 200
const ORDER: readonly string[] = [...TAILOR_STEPS, ...LETTER_STEPS]

type Run = { steps: StepUpdate[]; touched: number }

const globalStore = globalThis as typeof globalThis & { tailorRuns?: Map<string, Run> }

/** Survives dev hot reloads, so a run is not lost when a file changes. */
function runs(): Map<string, Run> {
  globalStore.tailorRuns ??= new Map()
  return globalStore.tailorRuns
}

function sweep(now: number) {
  const map = runs()
  for (const [key, run] of map) if (now - run.touched > TTL_MS) map.delete(key)
  // the oldest go first when a run is never read again
  while (map.size > MAX_RUNS) map.delete(map.keys().next().value as string)
}

/** Records the steps of one run of one person; undefined when the caller does not follow it. */
export function progressReporter(userId: number, runId?: string): StepReporter | undefined {
  if (!runId) return undefined
  const key = `${userId}:${runId}`
  return (update) => {
    const now = Date.now()
    sweep(now)
    const map = runs()
    const run = map.get(key) ?? { steps: [], touched: now }
    const steps = run.steps.filter((entry) => entry.step !== update.step)
    steps.push(update)
    steps.sort((a, b) => ORDER.indexOf(a.step) - ORDER.indexOf(b.step))
    map.set(key, { steps, touched: now })
  }
}

/** The run's steps so far; null when this process has not seen it. Only its owner reads it. */
export function readProgress(userId: number, runId: string): TailorProgress | null {
  sweep(Date.now())
  const run = runs().get(`${userId}:${runId}`)
  return run ? { steps: run.steps } : null
}
