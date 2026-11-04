import { describe, expect, it } from "vitest"
import {
  insertParagraph,
  moveParagraph,
  removeItem,
  removeParagraph,
  updateParagraph,
} from "./edit"
import { cvPdfFileName } from "./filename"
import { SYNTHETIC_LETTER_DATE, syntheticCv, syntheticLetter } from "./fixtures"
import { cvFlow, documentLabel, footerText } from "./flow"
import { buildLetter, letterDate, letterFileSuffix } from "./letter"
import { applyCvPatch } from "./patch"
import { letterSection, parseCvContent, type CvContent, type CvLetterSection } from "./schema"
import { cvPlainText } from "./text"

const NOW = SYNTHETIC_LETTER_DATE

const letter = syntheticLetter

const sectionOf = (content: CvContent): CvLetterSection => {
  const found = letterSection(content)
  if (!found) throw new Error("no letter")
  return found
}

describe("buildLetter", () => {
  it("is a valid document with the CV's header, without photo or consent", () => {
    const content = letter()
    expect(parseCvContent(content)).toEqual(content)
    expect(content.header.name).toBe(syntheticCv(1).header.name)
    expect(content.header.photo).toBeNull()
    expect(content.consent).toBeNull()
    expect(content.theme).toEqual(syntheticCv(1).theme)
  })

  it("fills what is known and takes only the paragraphs from the model", () => {
    const section = sectionOf(letter())
    expect(section.recipient).toBe("Acme, zespół rekrutacji")
    expect(section.subject).toBe("Dotyczy: Staff Engineer")
    expect(section.greeting).toBe("Szanowni Państwo,")
    expect(section.closing).toBe("Z poważaniem,")
    expect(section.signature).toBe(syntheticCv(1).header.name)
  })

  it("treats the model's paragraphs as plain text and drops empty ones", () => {
    expect(sectionOf(letter()).paragraphs).toEqual([
      "Pierwszy akapit.",
      "Drugi &lt;b&gt;akapit&lt;/b&gt; &amp; reszta.",
    ])
  })

  it("speaks the letter's language", () => {
    const section = sectionOf(letter("en"))
    expect(section.greeting).toBe("Dear Hiring Team,")
    expect(section.subject).toBe("Re: Staff Engineer")
    expect(section.title).toBe("Cover letter")
  })
})

describe("letterDate", () => {
  it("names the place and the month in the right form", () => {
    expect(letterDate("pl", "Warszawa, Polska", NOW)).toBe("Warszawa, 30 października 2026")
    expect(letterDate("en", "Warsaw", NOW)).toBe("Warsaw, 30 October 2026")
  })

  it("is the date alone without a place", () => {
    expect(letterDate("pl", "  ", NOW)).toBe("30 października 2026")
  })
})

describe("a letter in the page flow", () => {
  it("reads top to bottom, a paragraph per atom, with no section heading", () => {
    const kinds = cvFlow(letter()).map((atom) => atom.kind)
    expect(kinds).toEqual([
      "header",
      "letter-head",
      "letter-subject",
      "letter-greeting",
      "letter-para",
      "letter-para",
      "letter-closing",
    ])
  })

  it("keeps blank parts on the editor's sheet and off the printed one", () => {
    const content = letter()
    const section = sectionOf(content)
    const blank: CvContent = {
      ...content,
      sections: [{ ...section, subject: " ", paragraphs: [] }],
    }
    expect(cvFlow(blank).map((atom) => atom.kind)).not.toContain("letter-subject")
    expect(cvFlow(blank, { editing: true }).map((atom) => atom.kind)).toEqual(
      expect.arrayContaining(["letter-subject", "empty"])
    )
  })

  it("keeps the subject and greeting with the paragraph below them", () => {
    const atoms = cvFlow(letter())
    expect(atoms.find((atom) => atom.kind === "letter-subject")?.keepWithNext).toBe(true)
    expect(atoms.find((atom) => atom.kind === "letter-greeting")?.keepWithNext).toBe(true)
  })

  it("names itself in the footer and the plain text", () => {
    const content = letter()
    expect(documentLabel(content)).toBe("List motywacyjny")
    expect(footerText(content, 1, 2)).toContain("List motywacyjny · 1/2")
    expect(documentLabel(syntheticCv(1))).toBe("CV")
    const text = cvPlainText(content)
    expect(text).toContain("Szanowni Państwo,")
    expect(text).toContain("Pierwszy akapit.")
    expect(text).not.toContain("LIST MOTYWACYJNY")
  })
})

describe("editing a letter", () => {
  it("edits, splits, moves and removes paragraphs", () => {
    const content = letter()
    const sid = sectionOf(content).id
    const edited = updateParagraph(content, sid, 0, "Nowy")
    expect(sectionOf(edited).paragraphs[0]).toBe("Nowy")
    const longer = insertParagraph(edited, sid, 0, "Środek")
    expect(sectionOf(longer).paragraphs.map((text) => text.slice(0, 5))).toEqual([
      "Nowy",
      "Środe",
      "Drugi",
    ])
    expect(sectionOf(moveParagraph(longer, sid, 0, 1)).paragraphs[0]).toBe("Środek")
    expect(sectionOf(removeParagraph(longer, sid, 1)).paragraphs).toHaveLength(2)
  })

  it("leaves a CV's sections alone for unknown ids", () => {
    const content = letter()
    expect(updateParagraph(content, "other", 0, "x")).toEqual(content)
  })

  it("refuses item edits, which a letter does not have", () => {
    const content = letter()
    const sid = sectionOf(content).id
    expect(removeItem(content, sid, "x")).toEqual(content)
    expect(() => applyCvPatch(content, { item: { sectionId: sid, id: "x" } })).toThrow(/no items/)
    expect(() => applyCvPatch(content, { remove: { sectionId: sid, itemId: "x" } })).toThrow(
      /no items/
    )
  })
})

describe("file names", () => {
  it("names the letter's PDF", () => {
    expect(cvPdfFileName("Jan Kowalski", letterFileSuffix("pl"))).toBe(
      "Jan_Kowalski_List_motywacyjny.pdf"
    )
    expect(cvPdfFileName("Jan Kowalski", letterFileSuffix("en"))).toBe(
      "Jan_Kowalski_Cover_Letter.pdf"
    )
    expect(cvPdfFileName("Jan Kowalski")).toBe("Jan_Kowalski_CV.pdf")
    expect(cvPdfFileName("", letterFileSuffix("pl"))).toBe("List_motywacyjny.pdf")
  })
})
