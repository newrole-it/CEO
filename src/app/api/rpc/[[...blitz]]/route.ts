import { rpcAppHandler } from "@blitzjs/rpc"
import { withBlitzAuth } from "src/app/blitz-server"

const handlers = withBlitzAuth(rpcAppHandler())

export const { GET, HEAD } = handlers

// A body that is not JSON is the caller's mistake: answer 400 instead of a 500 with a stack trace.
export async function POST(...args: Parameters<typeof handlers.POST>) {
  try {
    JSON.parse(await args[0].clone().text())
  } catch {
    return Response.json(
      {
        result: null,
        error: { name: "BadRequest", message: "The request body is not JSON." },
        meta: {},
      },
      { status: 400 }
    )
  }
  return handlers.POST(...args)
}
