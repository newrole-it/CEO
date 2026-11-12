import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

const session = vi.hoisted(() => ({
  userId: null as number | null,
  $extend: vi.fn(async () => undefined),
}))
vi.mock("src/server/auth/session", () => ({ getSession: async () => session }))

import { resolver } from "src/server/rpc"
import { invoke } from "src/app/rpc"
import { AuthenticationError, NotFoundError } from "src/shared/errors"

const SECRET = "hunter2-correct-horse-battery"

afterEach(() => {
  vi.restoreAllMocks()
  session.userId = null
})

describe("resolver", () => {
  it("runs the steps in order and answers with the result", async () => {
    session.userId = 7
    const add = resolver.pipe(
      resolver.zod(z.object({ a: z.number() })),
      resolver.authorize(),
      async ({ a }, ctx) => a + (ctx.session.userId ?? 0)
    )
    expect(await add({ a: 1 })).toEqual({ ok: true, result: 8 })
    expect(session.$extend).toHaveBeenCalled()
  })

  it("answers AuthenticationError when there is no session", async () => {
    const answer = await resolver.pipe(resolver.authorize(), async () => "never")(null)
    expect(answer).toEqual({
      ok: false,
      error: expect.objectContaining({ name: "AuthenticationError", statusCode: 401 }),
    })
  })

  it("answers a ZodError for input that does not parse", async () => {
    const answer = await resolver.pipe(
      resolver.zod(z.object({ a: z.number() })),
      async () => 1
    )({
      a: "x",
    } as never)
    expect(answer.ok).toBe(false)
    expect(!answer.ok && answer.error.name).toBe("ZodError")
  })

  it("keeps a domain error's name, message and code", async () => {
    class CvError extends Error {
      name = "CvError"
      code = "not-found"
    }
    const answer = await resolver.pipe(async () => {
      throw new CvError("CV not found.")
    })(null)
    expect(answer).toEqual({
      ok: false,
      error: { name: "CvError", message: "CV not found.", code: "not-found" },
    })
  })

  it("logs neither the input nor the result, only an unexpected error's name and message", async () => {
    const lines: string[] = []
    for (const method of ["log", "info", "debug", "warn", "error"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "))
      })
    }
    session.userId = 7
    await resolver.pipe(async (input: { newPassword: string }) => ({ token: input.newPassword }))({
      newPassword: SECRET,
    })
    await resolver.pipe(async (_: { newPassword: string }) => {
      throw new Error("database is down")
    })({ newPassword: SECRET })
    expect(lines.join("\n")).not.toContain(SECRET)
    expect(lines.join("\n")).toContain("database is down")
  })
})

describe("Next's own errors", () => {
  it("go on to Next instead of becoming an answer", async () => {
    const { notFound } = await import("next/navigation")
    const missing = resolver.pipe(async () => notFound())
    await expect(missing(null)).rejects.toMatchObject({ digest: expect.stringContaining("404") })
  })
})

describe("invoke", () => {
  it("returns the result", async () => {
    expect(
      await invoke(
        resolver.pipe(async (n: number) => n * 2),
        21
      )
    ).toBe(42)
  })

  it("throws the resolver's error as the class it had on the server", async () => {
    const missing = resolver.pipe(async () => {
      throw new NotFoundError("Version not found.")
    })
    const error = await invoke(missing, null).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(NotFoundError)
    expect(error).toMatchObject({ name: "NotFoundError", message: "Version not found." })

    const signedOut = resolver.pipe(resolver.authorize(), async () => 1)
    await expect(invoke(signedOut, null)).rejects.toBeInstanceOf(AuthenticationError)
  })
})
