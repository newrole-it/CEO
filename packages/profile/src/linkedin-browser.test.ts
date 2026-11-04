import { describe, expect, it } from "vitest"
import type { ClaudeRunArgs } from "@newrole/llm/claude-cli"
import { hasBrowserImportHeader } from "./linkedin-import"
import {
  createStageTracker,
  LINKEDIN_BROWSER_TOOLS,
  linkedInBrowserAvailable,
  parseBrowserReply,
  readLinkedInViaClaude,
  type LinkedInBrowserStage,
} from "./linkedin-browser"

const clean = { notConnected: false, loginWall: false, readProfile: true }

const OK = JSON.stringify({
  status: "ok",
  profileUrl: "https://www.linkedin.com/in/anna-nowak-123/?trk=x",
  name: "Anna Nowak",
  headline: "Senior Backend Engineer",
  location: "Warsaw, Poland",
  about: "Builds payment systems.",
  experience: [
    {
      title: "Senior Backend Engineer",
      company: "Allegro",
      dates: "Jan 2021 - Present",
      description: "Kotlin",
    },
  ],
  skills: ["Kotlin", "Kafka"],
  education: [{ school: "Example University", degree: "MSc", dates: "2010 - 2015" }],
  certifications: [],
  languages: ["English"],
})

describe("reading the reply", () => {
  it("turns an ok reply into profile text and a clean profile URL", () => {
    const read = parseBrowserReply(`Here it is:\n${OK}`, clean)
    expect(read.status).toBe("ok")
    expect(read.profileUrl).toBe("https://www.linkedin.com/in/anna-nowak-123/")
    expect(read.text).toContain("Experience\nAllegro\nSenior Backend Engineer\nJan 2021 - Present")
    expect(read.text).toContain("Skills\nKotlin\nKafka")
  })

  it("believes the tools over the model about the connection and the login wall", () => {
    expect(parseBrowserReply(OK, { ...clean, notConnected: true }).status).toBe("not-connected")
    expect(parseBrowserReply(OK, { ...clean, loginWall: true }).status).toBe("signed-out")
    expect(parseBrowserReply('{"status":"not-connected"}', clean).status).toBe("not-connected")
    expect(parseBrowserReply('{"status":"signed-out"}', clean).status).toBe("signed-out")
  })

  it("fails on garbage or an empty profile", () => {
    expect(parseBrowserReply("I could not do that.", clean).status).toBe("failed")
    expect(parseBrowserReply(null, clean).status).toBe("failed")
    expect(parseBrowserReply('{"status":"ok","name":"Anna"}', clean).status).toBe("failed")
  })
})

describe("stages", () => {
  it("follows the tool calls", () => {
    const stages: LinkedInBrowserStage[] = []
    const tracker = createStageTracker((stage) => stages.push(stage))
    const use = (name: string, input: Record<string, unknown> = {}) =>
      tracker.onEvent({ kind: "tool_use", name: `mcp__claude-in-chrome__${name}`, input })
    use("tabs_context_mcp")
    use("tabs_create_mcp")
    use("navigate", { url: "https://www.linkedin.com/in/me/" })
    use("get_page_text")
    use("navigate", { url: "https://www.linkedin.com/in/anna/details/experience/" })
    use("navigate", { url: "https://www.linkedin.com/in/anna/details/skills/" })
    expect(stages).toEqual(["connecting", "opening", "reading"])
  })

  it("notices a missing extension from the tool result", () => {
    const tracker = createStageTracker()
    tracker.onEvent({
      kind: "tool_use",
      name: "mcp__claude-in-chrome__tabs_context_mcp",
      input: {},
    })
    tracker.onEvent({
      kind: "tool_result",
      text: "Browser extension is not connected. Please ensure the Claude browser extension is installed",
      isError: false,
    })
    expect(tracker.seen.notConnected).toBe(true)
  })
})

describe("readLinkedInViaClaude", () => {
  it("runs Chrome with only the five read tools", async () => {
    let seen: ClaudeRunArgs | null = null
    const read = await readLinkedInViaClaude({
      binary: "/bin/claude",
      run: async (args) => {
        seen = args
        args.onEvent?.({ kind: "tool_use", name: LINKEDIN_BROWSER_TOOLS[0], input: {} })
        return { text: OK, tokenInput: 1, tokenOutput: 1 }
      },
    })
    expect(read.status).toBe("ok")
    expect(seen!.chrome).toBe(true)
    expect(seen!.allowedTools).toEqual(LINKEDIN_BROWSER_TOOLS)
    expect(seen!.allowedTools!.some((tool) => /click|type|form|javascript/.test(tool))).toBe(false)
  })

  it("says so when there is no claude binary", async () => {
    expect((await readLinkedInViaClaude({ binary: null })).status).toBe("no-claude")
  })

  it("is offered only where the app runs locally, unless switched on or off", () => {
    expect(linkedInBrowserAvailable(false, {})).toBe(false)
    expect(linkedInBrowserAvailable(true, { LINKEDIN_BROWSER_IMPORT: "off" })).toBe(false)
    expect(linkedInBrowserAvailable(false, { LINKEDIN_BROWSER_IMPORT: "off" })).toBe(false)
  })
})

describe("browser import header", () => {
  it("accepts the new name and the one from before the rename", () => {
    expect(hasBrowserImportHeader(new Headers({ "x-newrole-import": "1" }))).toBe(true)
    expect(hasBrowserImportHeader(new Headers({ "x-nowarola-import": "1" }))).toBe(true)
    expect(hasBrowserImportHeader(new Headers({ "x-newrole-import": "0" }))).toBe(false)
    expect(hasBrowserImportHeader(new Headers())).toBe(false)
  })
})
