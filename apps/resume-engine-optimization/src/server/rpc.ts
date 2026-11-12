import { unstable_rethrow } from "next/navigation"
import type { z } from "zod"
import { AuthenticationError, toWireError, type WireError } from "src/shared/errors"
import { getSession, type SessionContext } from "src/server/auth/session"

/**
 * What the files in queries/ and mutations/ are built from. Each of those files starts with
 * "use server", so its default export is a Next Server Action: the browser calls it through
 * invoke() or useMutation() (src/app/rpc.ts), and a server component calls it directly.
 *
 * A resolver never throws to its caller. It answers { ok, result } or { ok: false, error } with the
 * error's name, message and code, because Next replaces what a Server Action throws with a generic
 * error in production, and the interface tells errors apart by name and code.
 */

export type Ctx = { session: SessionContext }
export type RpcResult<T> = { ok: true; result: T } | { ok: false; error: WireError }
export type Resolver<I, O> = (input: I) => Promise<RpcResult<O>>

// Errors the interface expects, logged without noise; anything else is logged with its name.
const EXPECTED = new Set(["AuthenticationError", "AuthorizationError", "NotFoundError", "ZodError"])

type Step<I, O> = (input: I, ctx: Ctx) => O | Promise<O>

function pipe<I, O>(a: Step<I, O>): Resolver<I, O>
function pipe<I, A, O>(a: Step<I, A>, b: Step<A, O>): Resolver<I, O>
function pipe<I, A, B, O>(a: Step<I, A>, b: Step<A, B>, c: Step<B, O>): Resolver<I, O>
function pipe<I, A, B, C, O>(
  a: Step<I, A>,
  b: Step<A, B>,
  c: Step<B, C>,
  d: Step<C, O>
): Resolver<I, O>
function pipe(...steps: Step<unknown, unknown>[]): Resolver<unknown, unknown> {
  return async (input) => {
    try {
      const session = await getSession()
      const ctx: Ctx = { session }
      let value: unknown = input
      for (const step of steps) value = await step(value, ctx)
      // Server components render without being able to write cookies; extending waits for the next action.
      await session.$extend().catch(() => undefined)
      return { ok: true, result: value }
    } catch (error) {
      // Next's own signals (a page that reads cookies is dynamic, redirect(), notFound()) go on to Next.
      unstable_rethrow(error)
      const wire = toWireError(error)
      if (!EXPECTED.has(wire.name)) console.error(`[rpc] ${wire.name}: ${wire.message}`)
      return { ok: false, error: wire }
    }
  }
}

/** Parses the input; a ZodError goes back to the caller like any other error. */
function zod<S extends z.ZodType>(schema: S) {
  return (input: z.input<S>): Promise<z.output<S>> => schema.parseAsync(input)
}

/** Only a signed-in session goes on (guests count: they have a user id). */
function authorize() {
  return <T>(input: T, ctx: Ctx): T => {
    if (!ctx.session.userId) throw new AuthenticationError()
    return input
  }
}

export const resolver = { pipe, zod, authorize }
