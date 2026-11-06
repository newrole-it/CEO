import { beforeEach, describe, expect, it, vi } from "vitest"
import { syntheticCv } from "@newrole/cv-core/fixtures"

vi.mock("db", () => ({ default: {} }))
vi.mock("./user", () => ({
  currentUser: vi.fn(async () => ({ id: 2, email: "a@example.com", name: "A", how: "test" })),
  NoUserError: class extends Error {},
}))
vi.mock("./tools", () => ({
  reply: (text: string, structured?: unknown) => ({
    content: [{ type: "text", text }],
    structuredContent: structured,
  }),
  failure: (text: string) => ({ content: [{ type: "text", text }], isError: true }),
  guard: (handler: unknown) => handler,
}))
vi.mock("src/server/cv/service", () => ({
  listCvs: vi.fn(),
  getCv: vi.fn(),
  updateCv: vi.fn(),
  duplicateCv: vi.fn(),
  cvPdf: vi.fn(),
  cvText: vi.fn(() => "plain text"),
  cvPdfFileName: vi.fn(() => "Anna_CV.pdf"),
}))
vi.mock("@newrole/cv-engine/render", () => ({ findChrome: vi.fn(() => "/chrome") }))
vi.mock("fs/promises", () => ({
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
  lstat: vi.fn(),
  open: vi.fn(),
}))

import * as filesModule from "fs/promises"
import * as chromeModule from "@newrole/cv-engine/render"
import * as serviceModule from "src/server/cv/service"
import { exportPath, registerCvTools, withKeptPhoto } from "./tools-cv"

type AnyMock = ReturnType<typeof vi.fn> & { mock: { calls: any[][] } }
const service = serviceModule as unknown as Record<keyof typeof serviceModule, AnyMock>
const chrome = chromeModule as unknown as Record<"findChrome", AnyMock>
const files = filesModule as unknown as Record<"mkdir" | "writeFile" | "lstat" | "open", AnyMock>

/** What lstat and open see at the target: nothing, or a file starting with `head`. */
function onDisk(entry: null | { head?: string; link?: boolean; folder?: boolean }) {
  if (!entry) {
    files.lstat.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }))
    return
  }
  files.lstat.mockResolvedValue({
    isSymbolicLink: () => Boolean(entry.link),
    isFile: () => !entry.link && !entry.folder,
  })
  files.open.mockResolvedValue({
    read: async (buffer: Uint8Array) => {
      const bytes = new TextEncoder().encode(entry.head ?? "").slice(0, buffer.length)
      buffer.set(bytes)
      return { bytesRead: bytes.length }
    },
    close: async () => undefined,
  })
}

type Handler = (args: Record<string, unknown>) => Promise<{
  content: { text: string }[]
  isError?: boolean
  structuredContent?: Record<string, unknown>
}>

const registered = new Map<
  string,
  { config: { inputSchema: Record<string, unknown> }; handler: Handler }
>()
registerCvTools({
  registerTool: (
    name: string,
    config: { inputSchema: Record<string, unknown> },
    handler: Handler
  ) => {
    registered.set(name, { config, handler })
  },
} as never)
const call = (name: string, args: Record<string, unknown> = {}) =>
  registered.get(name)!.handler(args)

const view = {
  id: "cv1",
  title: "Moje CV",
  language: "pl",
  kind: "EDITABLE",
  isDefault: true,
  hasPdf: false,
  hasContent: true,
  updatedAt: new Date("2026-10-29T10:00:00Z"),
}
const detail = { ...view, content: syntheticCv(1) }

beforeEach(() => {
  vi.clearAllMocks()
  service.listCvs.mockResolvedValue([view])
  service.getCv.mockResolvedValue(detail)
  service.updateCv.mockImplementation(
    async (_user: number, id: string, patch: { title?: string }) => ({
      ...detail,
      id,
      title: patch.title ?? detail.title,
    })
  )
  service.duplicateCv.mockResolvedValue({ ...detail, id: "copy1", isDefault: false })
  service.cvPdf.mockResolvedValue({ bytes: Buffer.from("%PDF-1.4"), name: "Anna_CV.pdf" })
  chrome.findChrome.mockReturnValue("/chrome")
})

describe("registration", () => {
  it("registers the four tools with their inputs", () => {
    expect([...registered.keys()].sort()).toEqual([
      "cv_export_pdf",
      "cv_get",
      "cv_list",
      "cv_update",
    ])
    expect(Object.keys(registered.get("cv_update")!.config.inputSchema).sort()).toEqual(
      ["content", "copyAs", "id", "item", "language", "remove", "section", "title"].sort()
    )
    expect(Object.keys(registered.get("cv_export_pdf")!.config.inputSchema).sort()).toEqual([
      "id",
      "path",
    ])
  })
})

describe("cv_list / cv_get", () => {
  it("lists with the default marked", async () => {
    const result = await call("cv_list")
    expect(result.content[0].text).toContain("★ Moje CV")
    expect(result.content[0].text).toContain("id cv1")
  })

  it("names the general letter of a CV, and lists no letter on its own", async () => {
    service.listCvs.mockResolvedValue([
      view,
      { ...view, id: "gl1", title: "List", docType: "LETTER", isDefault: false, forCvId: "cv1" },
    ])
    const result = await call("cv_list")
    expect(service.listCvs).toHaveBeenCalledWith(2, { letters: true })
    expect(result.content[0].text).toContain("id cv1 · list gl1")
    expect(result.content[0].text).not.toContain("id gl1")
  })

  it("explains an empty list", async () => {
    service.listCvs.mockResolvedValue([])
    expect((await call("cv_list")).content[0].text).toContain("/cv")
  })

  it("reads the default CV as JSON and text, without the photo bytes", async () => {
    service.getCv.mockResolvedValue({
      ...detail,
      content: {
        ...detail.content,
        header: { ...detail.content.header, photo: "data:image/jpeg;base64,AAAA" },
      },
    })
    const result = await call("cv_get")
    expect(service.getCv).toHaveBeenCalledWith(2, "cv1")
    expect(result.content[0].text).toContain("plain text")
    expect(result.content[0].text).not.toContain("base64")
    expect(result.structuredContent).toMatchObject({
      text: "plain text",
      content: { header: { photo: "(photo)" } },
    })
  })

  it("says so when the CV is an uploaded PDF or missing", async () => {
    service.getCv.mockResolvedValue({ ...view, kind: "UPLOADED", hasContent: false, content: null })
    expect((await call("cv_get", { id: "cv1" })).structuredContent).toMatchObject({ content: null })
    service.getCv.mockResolvedValue(null)
    expect((await call("cv_get", { id: "x" })).isError).toBe(true)
  })
})

describe("cv_update", () => {
  it("merges one item by id and saves the validated result", async () => {
    await call("cv_update", {
      id: "cv1",
      item: { sectionId: "experience", id: "job1", role: "CTO <script>x</script>" },
    })
    const [, , patch] = service.updateCv.mock.calls[0]
    const job = patch.content.sections[2].items[0]
    expect(job.role).toBe("CTO <script>x</script>")
    expect(job.company).toBe("Przykładowa Firma 1")
    // rich fields are sanitized by the schema on the way in
    await call("cv_update", { id: "cv1", section: { id: "profile", body: "<script>x</script>ok" } })
    expect(service.updateCv.mock.calls[1][2].content.sections[0].body).toBe("ok")
  })

  it("rejects invalid content and saves nothing", async () => {
    const result = await call("cv_update", {
      id: "cv1",
      content: { ...syntheticCv(1), version: 9 },
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("version")
    const bad = await call("cv_update", { id: "cv1", section: { id: "nope", title: "x" } })
    expect(bad.isError).toBe(true)
    expect(service.updateCv).not.toHaveBeenCalled()
  })

  it("changes only the title or language without touching the content", async () => {
    await call("cv_update", { id: "cv1", title: "Nowy" })
    expect(service.updateCv).toHaveBeenCalledWith(2, "cv1", {
      title: "Nowy",
      language: undefined,
      content: undefined,
    })
  })

  it("applies the change to a new copy with copyAs", async () => {
    const result = await call("cv_update", {
      id: "cv1",
      copyAs: "Allegro",
      section: { id: "profile", title: "Pod Allegro" },
    })
    expect(service.duplicateCv).toHaveBeenCalledWith(2, "cv1")
    expect(service.updateCv.mock.calls[0][1]).toBe("copy1")
    expect(service.updateCv.mock.calls[0][2].title).toBe("Allegro")
    expect(result.content[0].text).toContain("kopię")
  })

  it("refuses to edit an uploaded PDF and an empty request", async () => {
    service.getCv.mockResolvedValue({ ...view, kind: "UPLOADED", hasContent: false, content: null })
    const result = await call("cv_update", { id: "cv1", section: { id: "x", title: "y" } })
    expect(result.isError).toBe(true)
    service.getCv.mockResolvedValue(detail)
    expect((await call("cv_update", { id: "cv1" })).isError).toBe(true)
    expect(service.updateCv).not.toHaveBeenCalled()
  })

  it("restores the real photo from cv_get's marker", () => {
    const stored = { header: { photo: "data:image/jpeg;base64,AAAA" } }
    expect(withKeptPhoto({ header: { photo: "(photo)" } }, stored).header.photo).toBe(
      stored.header.photo
    )
    expect(withKeptPhoto({ header: { photo: null } }, stored).header.photo).toBeNull()
  })
})

describe("cv_export_pdf", () => {
  beforeEach(() => onDisk(null))

  it("replaces an older PDF at the same path", async () => {
    onDisk({ head: "%PDF-1.7" })
    const result = await call("cv_export_pdf", { id: "cv1", path: "/tmp/cv/x.pdf" })
    expect(result.isError).toBeUndefined()
    expect(files.writeFile.mock.calls[0][0]).toBe("/tmp/cv/x.pdf")
  })

  it.each([
    ["a file that is not a PDF", { head: "#!/bin/sh" }],
    ["a link", { link: true }],
    ["a folder", { folder: true }],
  ])("does not overwrite %s", async (_name, entry) => {
    onDisk(entry)
    const result = await call("cv_export_pdf", { id: "cv1", path: "/Users/a/notes.pdf" })
    expect(result.isError).toBe(true)
    expect(files.writeFile).not.toHaveBeenCalled()
  })

  it("wants a folder or a .pdf file name", async () => {
    const result = await call("cv_export_pdf", { id: "cv1", path: "/Users/a/.ssh/config.txt" })
    expect(result.isError).toBe(true)
    expect(files.writeFile).not.toHaveBeenCalled()
    expect(exportPath("/data/x.PDF", "A_CV.pdf", "/home/a")).toBe("/data/x.PDF")
    expect(exportPath("/data", "A_CV", "/home/a")).toHaveProperty("error")
  })

  it("writes to the given absolute path and returns it", async () => {
    const result = await call("cv_export_pdf", { id: "cv1", path: "/tmp/cv/x.pdf" })
    expect(files.mkdir).toHaveBeenCalledWith("/tmp/cv", { recursive: true })
    expect(files.writeFile.mock.calls[0][0]).toBe("/tmp/cv/x.pdf")
    expect(result.structuredContent).toMatchObject({ path: "/tmp/cv/x.pdf" })
  })

  it("rejects a relative path", async () => {
    const result = await call("cv_export_pdf", { id: "cv1", path: "cv.pdf" })
    expect(result.isError).toBe(true)
    expect(files.writeFile).not.toHaveBeenCalled()
  })

  it("fails clearly when Chrome is missing", async () => {
    service.cvPdf.mockResolvedValue(null)
    chrome.findChrome.mockReturnValue(null)
    const result = await call("cv_export_pdf", { id: "cv1" })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("CHROME_PATH")
  })

  it("defaults to ~/Downloads and accepts a folder", () => {
    expect(exportPath(undefined, "A_CV.pdf", "/home/a")).toBe("/home/a/Downloads/A_CV.pdf")
    expect(exportPath("~/x.pdf", "A_CV.pdf", "/home/a")).toBe("/home/a/x.pdf")
    expect(exportPath("/data", "A_CV.pdf", "/home/a")).toBe("/data/A_CV.pdf")
    expect(exportPath("rel/x.pdf", "A_CV.pdf", "/home/a")).toHaveProperty("error")
  })
})
