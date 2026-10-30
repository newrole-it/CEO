import { describe, expect, it } from "vitest"
import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ApplicationView } from "src/server/applications/types"
import {
  applicationJson,
  applicationLine,
  parseWhen,
  pickApplication,
  registerApplicationTools,
} from "./tools-applications"

type Registered = { config: { inputSchema: Record<string, z.ZodTypeAny>; description: string } }

function registered(): Map<string, Registered> {
  const tools = new Map<string, Registered>()
  const server = {
    registerTool: (name: string, config: Registered["config"]) => {
      tools.set(name, { config })
    },
  } as unknown as McpServer
  registerApplicationTools(server)
  return tools
}

const app = (over: Partial<ApplicationView>): ApplicationView => ({
  id: "a1",
  jobId: null,
  company: "Allegro",
  title: "Engineering Manager",
  url: null,
  location: null,
  salaryText: null,
  status: "APPLIED",
  stageNote: null,
  closedAtStage: null,
  appliedAt: new Date("2026-10-01T10:00:00Z"),
  statusChangedAt: new Date("2026-10-20T10:00:00Z"),
  nextStep: null,
  nextStepAt: null,
  contact: null,
  notes: null,
  source: "manual",
  cvDocumentId: null,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-20T10:00:00Z"),
  ...over,
})

describe("application tools", () => {
  it("registers every tracker and sheet tool", () => {
    expect([...registered().keys()].sort()).toEqual([
      "application_add",
      "application_get",
      "application_update",
      "applications_export",
      "applications_list",
      "sheet_status",
      "sheet_sync",
    ])
  })

  it("validates input", () => {
    const tools = registered()
    const schema = (name: string) => z.object(tools.get(name)!.config.inputSchema)
    expect(schema("application_update").safeParse({ id: "x", status: "INTERVIEW" }).success).toBe(
      true
    )
    expect(schema("application_update").safeParse({ id: "x", status: "HIRED" }).success).toBe(false)
    expect(schema("application_update").safeParse({ id: "x", notesMode: "prepend" }).success).toBe(
      false
    )
    expect(schema("applications_list").safeParse({ group: "active", limit: 500 }).success).toBe(
      false
    )
    expect(schema("application_add").safeParse({ company: "Allegro", title: "EM" }).success).toBe(
      true
    )
    expect(schema("sheet_sync").safeParse({}).success).toBe(true)
  })

  it("says the CSV export is a snapshot and points to Drive create_file", () => {
    const description = registered().get("applications_export")!.config.description
    expect(description).toContain("snapshot")
    expect(description).toContain("create_file")
    expect(description).toContain("text/csv")
    expect(description).toContain("sheet_sync")
  })
})

describe("helpers", () => {
  it("parses dates and clears with null", () => {
    expect(parseWhen(undefined)).toBeUndefined()
    expect(parseWhen(null)).toBeNull()
    expect(parseWhen("")).toBeNull()
    expect(parseWhen("2026-11-03")?.getDate()).toBe(3)
    expect(parseWhen("2026-11-03T09:00:00Z")?.toISOString()).toBe("2026-11-03T09:00:00.000Z")
    expect(() => parseWhen("next thursday")).toThrow()
  })

  it("prints a compact line with stage, days and next step", () => {
    const line = applicationLine(
      app({
        status: "REJECTED",
        closedAtStage: "INTERVIEW",
        stageNote: "po rozmowie z CTO",
        nextStep: "feedback",
        nextStepAt: new Date("2026-11-03T11:00:00Z"),
      }),
      0,
      new Date("2026-10-25T10:00:00Z").getTime()
    )
    expect(line).toContain("1. Allegro · Engineering Manager")
    expect(line).toContain("Odrzucono (po rozmowie z CTO), po etapie: Rozmowy")
    expect(line).toContain("w etapie 5 dni")
    expect(line).toContain("następny krok: feedback 2026-11-03")
    expect(line).toContain("id a1")
  })

  it("serialises dates for structured content", () => {
    const json = applicationJson(app({ nextStepAt: null }))
    expect(json.appliedAt).toBe("2026-10-01T10:00:00.000Z")
    expect(json.nextStepAt).toBeNull()
    expect(json.statusLabel).toBe("Aplikowano")
  })

  it("finds the application by company and prefers the live one", () => {
    const rows = [
      app({ id: "old", status: "REJECTED", appliedAt: new Date("2026-05-01") }),
      app({ id: "live", status: "INTERVIEW", title: "Head of Engineering" }),
      app({ id: "olx", company: "OLX" }),
    ]
    const picked = pickApplication(rows, { company: "allegro" })
    expect("match" in picked && picked.match.id).toBe("live")
    expect("none" in pickApplication(rows, { company: "Docplanner" })).toBe(true)
    const two = pickApplication([...rows, app({ id: "live2", status: "SCREENING" })], {
      company: "Allegro",
    })
    expect("ambiguous" in two && two.ambiguous.length).toBe(3)
    const byTitle = pickApplication(rows, { company: "Allegro", title: "head" })
    expect("match" in byTitle && byTitle.match.id).toBe("live")
  })
})
