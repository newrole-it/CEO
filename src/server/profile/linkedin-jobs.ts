import { randomBytes } from "crypto"
import type { ProfileDraft } from "./schema"
import type { LinkedInBrowserStage, LinkedInBrowserStatus } from "./linkedin-browser"

/**
 * In-memory jobs for the "read my LinkedIn in Chrome" button. One running job per
 * owner (session user or IP), results kept 10 minutes. Local single-process use only.
 */

export const JOB_TTL_MS = 10 * 60 * 1000

export type LinkedInJobView = {
  state: "running" | "done" | "error"
  stage?: LinkedInBrowserStage
  status?: LinkedInBrowserStatus
  draft?: ProfileDraft
  message: string
}

type Job = LinkedInJobView & { id: string; owner: string; finishedAt?: number }

export type JobRunner = (report: {
  stage: (stage: LinkedInBrowserStage) => void
}) => Promise<{ status: LinkedInBrowserStatus; message: string; draft?: ProfileDraft }>

export function createJobStore(now: () => number = Date.now) {
  const jobs = new Map<string, Job>()

  function sweep() {
    for (const [id, job] of jobs) {
      if (job.finishedAt != null && now() - job.finishedAt > JOB_TTL_MS) jobs.delete(id)
    }
  }

  function view(job: Job): LinkedInJobView {
    const { state, stage, status, draft, message } = job
    return { state, stage, status, draft, message }
  }

  return {
    /** Starts a job, or returns the owner's job that is still running. */
    start(owner: string, runner: JobRunner): { id: string; reused: boolean } {
      sweep()
      for (const job of jobs.values()) {
        if (job.owner === owner && job.state === "running") return { id: job.id, reused: true }
      }
      const id = randomBytes(12).toString("hex")
      const job: Job = { id, owner, state: "running", stage: "connecting", message: "" }
      jobs.set(id, job)
      runner({ stage: (stage) => (job.stage = stage) })
        .then((outcome) => {
          job.status = outcome.status
          job.message = outcome.message
          job.draft = outcome.draft
          job.state = outcome.status === "ok" && outcome.draft ? "done" : "error"
        })
        .catch((error) => {
          console.error("linkedin browser job failed", error instanceof Error ? error.message : error)
          job.status = "failed"
          job.message = "Could not read the profile. Try again."
          job.state = "error"
        })
        .finally(() => (job.finishedAt = now()))
      return { id, reused: false }
    },
    /** Only the owner can read a job. */
    get(id: string, owner: string): LinkedInJobView | null {
      sweep()
      const job = jobs.get(id)
      if (!job || job.owner !== owner) return null
      return view(job)
    },
  }
}

const globalStore = globalThis as typeof globalThis & {
  linkedInJobs?: ReturnType<typeof createJobStore>
}

/** Survives dev hot reloads, so a running job is not lost when a file changes. */
export function linkedInJobs() {
  globalStore.linkedInJobs ??= createJobStore()
  return globalStore.linkedInJobs
}
