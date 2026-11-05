import { describe, expect, it } from "vitest"
import {
  applyNote,
  locateNote,
  openNotes,
  parseCvAudit,
  placeCards,
  type CvAudit,
  type CvAuditNote,
} from "./audit"
import { moveBullet, updateBullet, updateHeader } from "./edit"
import type { CvContent } from "./schema"

const content: CvContent = {
  version: 1,
  header: {
    name: "Ala Kot",
    headline: "Backend Engineer",
    location: "",
    email: "",
    phone: "",
    links: [],
    photo: null,
  },
  sections: [
    {
      id: "s1",
      type: "experience",
      title: "Doświadczenie",
      items: [
        {
          id: "j1",
          company: "Acme",
          role: "Lead",
          dates: "2020 – 2024",
          summary: "",
          bullets: ["Odpowiedzialny za <strong>wdrożenia</strong>", "Pisanie testów"],
          tech: "",
          compact: false,
        },
      ],
    },
  ],
  consent: null,
  theme: { accent: "#175c72" },
}

const note = (over: Partial<CvAuditNote> = {}): CvAuditNote => ({
  id: "n1",
  category: "vague",
  severity: 4,
  field: "s1:j1:bullet:0",
  anchor: "quote",
  quote: "Odpowiedzialny za",
  why: "To nazwa czynności.",
  rewrite: "Prowadzę",
  factId: null,
  ...over,
})

const audit = (notes: CvAuditNote[], dismissed: string[] = []): CvAudit => ({
  score: 80,
  previousScore: null,
  summary: "Krótkie podsumowanie.",
  notes,
  demand: [],
  usedModel: true,
  dismissed,
  createdAt: "2026-10-30T12:00:00.000Z",
})

describe("audit notes on a changing CV", () => {
  it("applies a suggestion through the formatting and the note is then done", () => {
    const next = applyNote(content, note())
    expect(next.sections[0]).toMatchObject({
      items: [{ bullets: ["Prowadzę <strong>wdrożenia</strong>", "Pisanie testów"] }],
    })
    expect(locateNote(next, note())).toBeNull()
    expect(locateNote(content, note())).toMatchObject({ start: 0, end: 17 })
  })

  it("treats a suggestion that keeps the quote as applied too", () => {
    const grows = note({
      quote: "Pisanie testów",
      field: "s1:j1:bullet:1",
      rewrite: "Pisanie testów e2e",
    })
    expect(locateNote(content, grows)).not.toBeNull()
    expect(locateNote(applyNote(content, grows), grows)).toBeNull()
  })

  it("closes the note when the person rewrites the words, and undo brings it back", () => {
    const edited = updateBullet(content, "s1", "j1", 0, "Wdrożyłem system")
    expect(openNotes(audit([note()]), edited)).toEqual([])
    expect(openNotes(audit([note()]), content)).toHaveLength(1)
  })

  it("follows a bullet that moved", () => {
    const moved = moveBullet(content, "s1", "j1", 0, 1)
    expect(locateNote(moved, note())?.field.field).toBe("s1:j1:bullet:1")
    const next = applyNote(moved, note())
    expect(next.sections[0]).toMatchObject({
      items: [{ bullets: ["Pisanie testów", "Prowadzę <strong>wdrożenia</strong>"] }],
    })
  })

  it("does not look for a quote in other fields than a moved bullet", () => {
    const other = note({ field: "s1:j1:role", quote: "Pisanie testów", rewrite: null })
    expect(locateNote(content, other)).toBeNull()
  })

  it("keeps a note about a whole field open and closes one about an empty field once filled", () => {
    const about = note({
      id: "f",
      anchor: "field",
      field: "header:headline",
      quote: "",
      rewrite: null,
    })
    const missing = note({
      id: "e",
      anchor: "empty",
      field: "header:email",
      quote: "",
      rewrite: null,
    })
    expect(locateNote(content, about)).not.toBeNull()
    expect(locateNote(content, missing)).not.toBeNull()
    const filled = updateHeader(content, { email: "ala@example.com" })
    expect(locateNote(filled, missing)).toBeNull()
    expect(locateNote(filled, about)).not.toBeNull()
    expect(applyNote(content, about)).toBe(content)
  })

  it("leaves out what was skipped and sorts in reading order", () => {
    const first = note({
      id: "a",
      anchor: "field",
      field: "header:headline",
      quote: "",
      rewrite: null,
    })
    const second = note({ id: "b" })
    const third = note({ id: "c", field: "s1:j1:bullet:1", quote: "testów", rewrite: null })
    const open = openNotes(audit([third, second, first], ["c"]), content)
    expect(open.map((entry) => entry.note.id)).toEqual(["a", "b"])
  })

  it("rejects a stored audit that no longer parses", () => {
    expect(parseCvAudit(audit([note()]))).not.toBeNull()
    expect(parseCvAudit({ score: "high" })).toBeNull()
    expect(parseCvAudit(null)).toBeNull()
  })
})

describe("cards beside the sheet", () => {
  const cards = [
    { want: 0, height: 100 },
    { want: 50, height: 100 },
    { want: 400, height: 100 },
  ]

  it("keeps cards at their text and pushes overlapping ones down", () => {
    expect(placeCards(cards, -1)).toEqual([0, 108, 400])
  })

  it("puts the active card exactly at its text and moves earlier cards up", () => {
    const tops = placeCards(
      [
        { want: 100, height: 100 },
        { want: 120, height: 100 },
      ],
      1
    )
    expect(tops).toEqual([12, 120])
  })

  it("never goes above the top of the rail", () => {
    const tops = placeCards(
      [
        { want: 10, height: 100 },
        { want: 20, height: 100 },
      ],
      1
    )
    expect(tops).toEqual([0, 108])
    expect(placeCards([], -1)).toEqual([])
  })
})
