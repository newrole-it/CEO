import { afterEach, describe, expect, it, vi } from "vitest"
import { RpcServerPlugin } from "@blitzjs/rpc"
import { RPC_LOGGING } from "./rpc-logging"

type Invoke = (fn: unknown, params: unknown) => Promise<unknown>

const SECRET = "hunter2-correct-horse-battery"

/** Everything Blitz writes while a resolver runs through the plugin's invoke. */
async function logsOf(options: Parameters<typeof RpcServerPlugin>[0]): Promise<string> {
  const g = globalThis as { __BLITZ_GET_RSC_CONTEXT?: () => Promise<unknown> }
  g.__BLITZ_GET_RSC_CONTEXT = async () => ({ session: {} })
  const plugin = RpcServerPlugin(options) as unknown as { exports: () => { invoke: Invoke } }
  const resolver = Object.assign(async (input: { newPassword: string }) => ({ token: SECRET }), {
    _resolverName: "setPassword",
  })
  const lines: string[] = []
  const capture = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "))
  }
  for (const method of ["log", "info", "debug", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(capture)
  }
  const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    lines.push(String(chunk))
    return true
  })
  try {
    await plugin.exports().invoke(resolver, { newPassword: SECRET })
  } finally {
    write.mockRestore()
  }
  return lines.join("\n")
}

describe("RPC logging", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as { blitzRpcRpcLoggerOptions?: unknown }).blitzRpcRpcLoggerOptions
  })

  it("logs resolver input when left at the Blitz default, so the check below can see it", async () => {
    expect(await logsOf({})).toContain(SECRET)
  })

  it("keeps resolver inputs and results out of the log with the app's options", async () => {
    expect(await logsOf({ logging: RPC_LOGGING })).not.toContain(SECRET)
  })
})
