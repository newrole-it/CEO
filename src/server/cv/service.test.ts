import { beforeEach, describe, expect, it, vi } from "vitest"
import { blankCv } from "src/shared/cv/blank"

/** One CV row in memory; every write moves updatedAt forward like Prisma's @updatedAt. */
const table = {
  row: null as Record<string, any> | null,
  clock: Date.UTC(2026, 10, 1, 9, 0, 0),
  /** Runs between updateCv's read and its write, to stand in for a save from another tab */
  beforeWrite: null as (() => void) | null,
}

function tick(): Date {
  table.clock += 1000
  return new Date(table.clock)
}

function owned(where: { id: string; userId?: number }) {
  const row = table.row
  if (!row || row.id !== where.id) return null
  if (where.userId !== undefined && row.userId !== where.userId) return null
  return row
}

vi.mock("db", () => ({
  default: {
    cvDocument: {
      findFirst: async ({ where }: { where: { id: string; userId: number } }) => {
        const row = owned(where)
        return row ? { ...row } : null
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        table.beforeWrite?.()
        const row = owned(where)!
        Object.assign(row, data, { updatedAt: tick() })
        return { ...row }
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; userId: number; updatedAt: Date }
        data: Record<string, unknown>
      }) => {
        table.beforeWrite?.()
        const row = owned(where)
        if (!row || row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 }
        Object.assign(row, data, { updatedAt: tick() })
        return { count: 1 }
      },
    },
  },
}))

import { CvError, updateCv } from "./service"

const loadedAt = new Date(Date.UTC(2026, 10, 1, 8, 0, 0))

beforeEach(() => {
  table.beforeWrite = null
  table.clock = Date.UTC(2026, 10, 1, 9, 0, 0)
  table.row = {
    id: "cv-1",
    userId: 1,
    kind: "EDITABLE",
    docType: "CV",
    title: "Moje CV",
    language: "pl",
    content: blankCv("pl"),
    // a fresh check: no automatic version is taken, so the test needs no version table
    versionCheckedAt: new Date(),
    isDefault: true,
    pdfUpdatedAt: null,
    updatedAt: loadedAt,
    jobId: null,
    targetCompany: null,
    targetTitle: null,
    tailorNotes: null,
  }
})

function edited(name: string) {
  const content = blankCv("pl")
  return { ...content, header: { ...content.header, name } }
}

async function conflictOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (error) {
    return error instanceof CvError ? error.code : String(error)
  }
}

describe("updateCv with the version the editor loaded", () => {
  it("saves when nothing changed since the editor loaded the CV and returns the new version", async () => {
    const saved = await updateCv(1, "cv-1", { content: edited("Anna"), baseUpdatedAt: loadedAt })
    expect(saved.content?.header.name).toBe("Anna")
    expect(saved.updatedAt.getTime()).toBeGreaterThan(loadedAt.getTime())
    // the next autosave carries the version the first one returned
    const again = await updateCv(1, "cv-1", { title: "CV 2026", baseUpdatedAt: saved.updatedAt })
    expect(again.title).toBe("CV 2026")
  })

  it("refuses a save from a stale tab and keeps the newer content", async () => {
    // tab A saves first
    const newer = await updateCv(1, "cv-1", { content: edited("Anna"), baseUpdatedAt: loadedAt })
    // tab B still holds the version it loaded
    const code = await conflictOf(
      updateCv(1, "cv-1", { content: edited("Stara wersja"), baseUpdatedAt: loadedAt })
    )
    expect(code).toBe("conflict")
    expect(table.row?.content.header.name).toBe("Anna")
    expect(table.row?.updatedAt.getTime()).toBe(newer.updatedAt.getTime())
  })

  it("refuses when another save lands between the check and the write", async () => {
    table.beforeWrite = () => {
      table.beforeWrite = null
      Object.assign(table.row!, { content: edited("Z innej karty"), updatedAt: tick() })
    }
    const code = await conflictOf(
      updateCv(1, "cv-1", { content: edited("Anna"), baseUpdatedAt: loadedAt })
    )
    expect(code).toBe("conflict")
    expect(table.row?.content.header.name).toBe("Z innej karty")
  })

  it("writes unconditionally without a version, as the assistant's tools do", async () => {
    Object.assign(table.row!, { updatedAt: tick() })
    const saved = await updateCv(1, "cv-1", { content: edited("Anna") })
    expect(saved.content?.header.name).toBe("Anna")
  })

  it("still says not-found for someone else's CV", async () => {
    expect(await conflictOf(updateCv(2, "cv-1", { title: "x", baseUpdatedAt: loadedAt }))).toBe(
      "not-found"
    )
  })
})
