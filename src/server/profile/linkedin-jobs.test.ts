import { describe, expect, it } from "vitest"
import { createJobStore, JOB_TTL_MS } from "./linkedin-jobs"
import { emptyProfileDraft } from "./schema"

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("LinkedIn import jobs", () => {
  it("runs, reports stages, and finishes with a draft", async () => {
    const store = createJobStore()
    let release!: () => void
    const { id } = store.start("user:1", async ({ stage }) => {
      stage("reading")
      await new Promise<void>((resolve) => (release = resolve))
      return { status: "ok", message: "done", draft: emptyProfileDraft() }
    })
    expect(store.get(id, "user:1")).toMatchObject({ state: "running", stage: "reading" })
    release()
    await tick()
    expect(store.get(id, "user:1")).toMatchObject({ state: "done", status: "ok" })
  })

  it("keeps one running job per owner and hides jobs from others", () => {
    const store = createJobStore()
    const never = () => new Promise<never>(() => undefined)
    const first = store.start("ip:a", never)
    expect(store.start("ip:a", never)).toEqual({ id: first.id, reused: true })
    expect(store.start("ip:b", never).reused).toBe(false)
    expect(store.get(first.id, "ip:b")).toBeNull()
  })

  it("turns a non-ok status or a thrown error into an error state, then forgets it", async () => {
    let now = 0
    const store = createJobStore(() => now)
    const signedOut = store.start("u", async () => ({ status: "signed-out", message: "sign in" }))
    await tick()
    expect(store.get(signedOut.id, "u")).toMatchObject({ state: "error", status: "signed-out" })
    const thrown = store.start("v", async () => {
      throw new Error("boom")
    })
    await tick()
    expect(store.get(thrown.id, "v")).toMatchObject({ state: "error", status: "failed" })
    now = JOB_TTL_MS + 1
    expect(store.get(signedOut.id, "u")).toBeNull()
  })
})
