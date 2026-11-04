import { deflateRawSync } from "zlib"
import { describe, expect, it } from "vitest"
import { extractProfileFromText } from "./extract"
import { parseLinkedInProfile } from "./linkedin"
import { ExportError, linkedInExportText, parseCsv, readZipEntries } from "./linkedin-export"

/** Buffer.concat with the Node 18 types, where Buffer[] is not a Uint8Array[]. */
const cat = (list: Buffer[]) => Buffer.concat(list as unknown as Uint8Array[])

/** A minimal ZIP writer for fixtures: deflate unless `stored`, no CRC check on our side. */
function zip(files: { name: string; content: string | Buffer; stored?: boolean }[]): Buffer {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const raw = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, "utf8")
    const data = file.stored ? raw : deflateRawSync(raw)
    const name = Buffer.from(file.name, "utf8")
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(file.stored ? 0 : 8, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, data)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(file.stored ? 0 : 8, 10)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(raw.length, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, name)
    offset += local.length + name.length + data.length
  }
  const dir = cat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return cat([...locals, dir, end])
}

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
