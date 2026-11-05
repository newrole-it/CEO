import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterEach, describe, expect, it } from "vitest"
import { createServer } from "./create-server"
import { appLink, configureHost, noProfileHint } from "./host"
import { importProfile } from "./profile"
import { INSTRUCTIONS } from "./prompts"
import { currentUser } from "./user"

/**
 * What the server exposes. A change here changes what people can do through Claude, so a removal
 * has to be a decision: the README promises these to anyone running it locally.
 */
const TOOLS = [
  "answer_draft",
  "answer_save",
  "answers_search",
  "application_add",
  "application_get",
  "application_update",
  "applications_export",
  "applications_list",
  "applications_stats",
  "cv_export_pdf",
  "cv_get",
  "cv_list",
  "cv_update",
  "gmail_status",
  "offer_add",
  "offer_get",
  "offers_list",
  "profile_get",
  "profile_import",
  "sheet_status",
  "sheet_sync",
]
const PROMPTS = ["apply", "onboard", "pipeline"]

/** A shared server holds each person's own records and nothing about offers or anyone's disk. */
const SHARED_TOOLS = [
  "answer_draft",
  "answer_save",
  "answers_search",
  "application_add",
  "application_get",
  "application_update",
  "applications_export",
  "applications_list",
  "applications_stats",
  "cv_get",
  "cv_list",
  "cv_update",
  "offer_add",
  "offer_get",
  "offers_list",
  "profile_get",
  "profile_import",
  "sheet_status",
  "sheet_sync",
]
const SHARED_PROMPTS = ["apply", "onboard", "pipeline"]

async function connect() {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
  await createServer().connect(serverSide)
  const client = new Client({ name: "contract-test", version: "0" })
  await client.connect(clientSide)
  return client
}

const names = (items: { name: string }[]) => items.map((item) => item.name).sort()

afterEach(() => configureHost({}))

describe("the local server", () => {
  it("exposes every tool and prompt", async () => {
    const client = await connect()
    expect(names((await client.listTools()).tools)).toEqual(TOOLS)
    expect(names((await client.listPrompts()).prompts)).toEqual(PROMPTS)
    expect(client.getInstructions()).toBe(INSTRUCTIONS)
  })

  it("gives every tool a title and says whether it changes anything", async () => {
    const { tools } = await (await connect()).listTools()
    for (const tool of tools) {
      expect(tool.title, tool.name).toBeTruthy()
      const { readOnlyHint, destructiveHint } = tool.annotations ?? {}
      expect(readOnlyHint === true || destructiveHint === true, tool.name).toBe(true)
    }
  })

  it("takes files from the person's disk", async () => {
    const { tools } = await (await connect()).listTools()
    const input = tools.find((tool) => tool.name === "profile_import")?.inputSchema.properties
    expect(Object.keys(input ?? {})).toEqual(
      expect.arrayContaining(["text", "pdfPath", "zipPath", "preferences"])
    )
    expect(noProfileHint()).toContain("pdfPath")
  })
})

describe("a server several people share", () => {
  const shared = { localInstall: false }

  it("offers exactly the person's own records", async () => {
    configureHost(shared)
    const client = await connect()
    const { tools } = await client.listTools()
    expect(names(tools)).toEqual(SHARED_TOOLS)
    expect(names((await client.listPrompts()).prompts)).toEqual(SHARED_PROMPTS)
    const input = tools.find((tool) => tool.name === "profile_import")?.inputSchema.properties
    expect(Object.keys(input ?? {}).sort()).toEqual(["preferences", "text"])
    expect(noProfileHint()).not.toContain("pdfPath")
  })

  it("does not point the model at anything it lost", async () => {
    configureHost(shared)
    const client = await connect()
    const { tools } = await client.listTools()
    const importTool = JSON.stringify(tools.find((tool) => tool.name === "profile_import"))
    expect(importTool).not.toMatch(/pdfPath|zipPath|Claude CLI|Claude in Chrome/)
    const absent = TOOLS.filter((name) => !SHARED_TOOLS.includes(name))
    const gone = new RegExp([...absent, "fullText", "pdfPath", "zipPath"].join("|"))
    for (const tool of tools) expect(JSON.stringify(tool), tool.name).not.toMatch(gone)
    for (const name of SHARED_PROMPTS) {
      const prompt = await client.getPrompt({
        name,
        arguments: name === "apply" ? { offer: "x" } : {},
      })
      expect(JSON.stringify(prompt), name).not.toMatch(gone)
    }
    const onboard = await client.getPrompt({ name: "onboard", arguments: {} })
    expect(JSON.stringify(onboard)).not.toMatch(/Claude in Chrome/)
  })

  it("reads no file even when asked directly", async () => {
    configureHost(shared)
    // A path that does not exist: a server that tried to read it would fail differently.
    await expect(importProfile({ userId: 1, pdfPath: "/no/such/file.pdf" })).rejects.toThrow(
      "reads no files"
    )
    await expect(importProfile({ userId: 1, zipPath: "/no/such/file.zip" })).rejects.toThrow(
      "reads no files"
    )
  })

  it("drops a path sent to the tool, without reading it", async () => {
    configureHost(shared)
    const client = await connect()
    const result = await client.callTool({
      name: "profile_import",
      arguments: { pdfPath: "/no/such/file.pdf" },
    })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain("Pass `text`.")
  })
})

describe("the host", () => {
  it("decides who a call acts for", async () => {
    const person = { id: 7, email: "a@example.com", name: null, how: "test" }
    configureHost({ currentUser: async () => person })
    expect(await currentUser()).toBe(person)
  })

  it("can refuse, and the local fallback does not step in", async () => {
    configureHost({
      currentUser: async () => {
        throw new Error("no person on this request")
      },
    })
    await expect(currentUser()).rejects.toThrow("no person on this request")
  })

  it("replaces the instructions", async () => {
    configureHost({ instructions: "Hosted." })
    expect((await connect()).getInstructions()).toBe("Hosted.")
  })

  it("links to the app it runs next to", () => {
    const saved = process.env.APP_ORIGIN
    try {
      delete process.env.APP_ORIGIN
      expect(appLink("/cv")).toBe("http://127.0.0.1:43123/cv")
      process.env.APP_ORIGIN = "https://app.example.com/"
      expect(appLink("/cv")).toBe("https://app.example.com/cv")
    } finally {
      if (saved === undefined) delete process.env.APP_ORIGIN
      else process.env.APP_ORIGIN = saved
    }
  })
})
