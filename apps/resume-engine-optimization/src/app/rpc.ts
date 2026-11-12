import { fromWireError, type WireError } from "src/shared/errors"

/**
 * Calls a resolver (a Server Action from a queries/ or mutations/ file) and returns its result,
 * or throws its error rebuilt as the class it was on the server. Works in the browser and in
 * server components alike.
 */

type Answer<O> = { ok: true; result: O } | { ok: false; error: WireError }

/** What a resolver resolves to, for typing what a component keeps: the old PromiseReturnType. */
export type ResolverResult<R> = R extends (input: never) => Promise<Answer<infer O>> ? O : never

export async function invoke<I, O>(
  resolver: (input: I) => Promise<Answer<O>>,
  input: I
): Promise<O> {
  const answer = await resolver(input)
  if (answer.ok) return answer.result
  throw fromWireError(answer.error)
}
