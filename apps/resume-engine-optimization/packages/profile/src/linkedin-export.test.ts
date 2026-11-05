import { describe, expect, it } from "vitest"
import { extractProfileFromText } from "./extract"
import { parseLinkedInProfile } from "./linkedin"
import { ExportError, linkedInExportText, parseCsv, readZipEntries } from "./linkedin-export"
import { zip } from "./test-zip"

/** Buffer.concat with the Node 18 types, where Buffer[] is not a Uint8Array[]. */
const cat = (list: Buffer[]) => Buffer.concat(list as unknown as Uint8Array[])

const PROFILE = `﻿First Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary,Industry,Zip Code,Geo Location
Anna,Nowak,,"ul. Prywatna 1, Warszawa",1990-01-01,Senior Backend Engineer,"Builds payment systems.
Likes Kotlin.",Fintech,00-001,"Warsaw, Mazowieckie, Poland"`

const POSITIONS = `Company Name,Title,Description,Location,Started On,Finished On
Allegro,Senior Backend Engineer,"Payments platform, Kotlin and Kafka.
Led a migration ""to services"".","Warsaw, Poland",Jan 2021,
Comarch,Software Engineer,Java services,"Kraków, Poland",Mar 2016,Dec 2020`

const SKILLS = `Name
Kotlin
Kafka
PostgreSQL`

const LANGUAGES = `Notes:
"Languages you listed on your profile"

Name,Proficiency
English,Full professional proficiency
Polish,Native or bilingual proficiency`

const archive = () =>
  zip([
    { name: "Basic_LinkedInDataExport_10-28-2026/Profile.csv", content: PROFILE },
    { name: "Basic_LinkedInDataExport_10-28-2026/Positions.csv", content: POSITIONS },
    { name: "Basic_LinkedInDataExport_10-28-2026/Skills.csv", content: SKILLS, stored: true },
    { name: "Basic_LinkedInDataExport_10-28-2026/Languages.csv", content: LANGUAGES },
    {
      name: "Basic_LinkedInDataExport_10-28-2026/messages.csv",
      content: "FROM,TO,CONTENT\na,b,secret",
    },
  ])

describe("CSV", () => {
  it("handles a BOM, quotes, doubled quotes, and newlines inside quotes", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\n')
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"\nthere'],
    ])
  })
})

describe("LinkedIn data export", () => {
  it("reads only the profile files, stored or deflated", () => {
    const files = readZipEntries(archive())
    expect([...files.keys()].sort()).toEqual([
      "languages.csv",
      "positions.csv",
      "profile.csv",
      "skills.csv",
    ])
  })

  it("lays the profile out the way the PDF parser and extractor read it", async () => {
    const text = linkedInExportText(archive())
    expect(text).not.toMatch(/Prywatna|1990-01-01|00-001|secret/)
    const document = parseLinkedInProfile(text)
    expect(document?.name).toBe("Anna Nowak")
    const experience = document?.blocks.filter((block) => block.kind === "experience") ?? []
    expect(experience).toHaveLength(2)
    expect(JSON.stringify(experience[0])).toContain("Allegro")
    expect(JSON.stringify(document?.blocks.find((b) => b.kind === "skills"))).toContain("Kotlin")
    const draft = await extractProfileFromText(text, null)
    // Rules only (no model): the skill lexicon has Kotlin and PostgreSQL.
    expect(draft.skills).toEqual(expect.arrayContaining(["Kotlin", "PostgreSQL"]))
    expect(draft.languages).toEqual(expect.arrayContaining(["English", "Polish"]))
  })

  it("rejects what is not a LinkedIn profile archive", () => {
    expect(() => linkedInExportText(Buffer.from("%PDF-1.4"))).toThrow(ExportError)
    const other = zip([{ name: "notes.txt", content: "hello" }])
    expect(() => linkedInExportText(other)).toThrow(/Profile\.csv/)
  })

  it("stops a zip bomb even when the declared size is small", () => {
    const bomb = zip([{ name: "Profile.csv", content: Buffer.alloc(6_000_000, 65) }])
    // Lie about the uncompressed size in the central directory.
    const at = bomb.lastIndexOf("PK\u0001\u0002", undefined, "latin1")
    bomb.writeUInt32LE(100, at + 24)
    expect(() => readZipEntries(bomb)).toThrow(/too large|could not be read/)
  })
})
