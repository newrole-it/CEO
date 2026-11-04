import { inflateRawSync } from "zlib"
import { linkedInLayout, type LinkedInSections } from "./linkedin-layout"

/**
 * LinkedIn's own data export (Settings → Data privacy → Get a copy of your data).
 * Only the profile CSVs below are read. Messages, connections, and everything else
 * in the archive are never opened.
 */

export const MAX_ZIP_BYTES = 50_000_000
const MAX_ENTRY_BYTES = 5_000_000
const MAX_TOTAL_BYTES = 20_000_000

const WANTED = [
  "profile.csv",
  "positions.csv",
  "skills.csv",
  "education.csv",
  "certifications.csv",
  "languages.csv",
] as const
type Wanted = (typeof WANTED)[number]

export class ExportError extends Error {
  constructor(
    public code: "not-zip" | "unsupported" | "too-large" | "no-profile",
    message: string
  ) {
    super(message)
  }
}

export function isZipBytes(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50
}

function basename(name: string): string {
  return name.split("/").pop()!.toLowerCase()
}

/** Reads the named CSV entries from a ZIP: central directory, stored or deflate, size-capped. */
export function readZipEntries(bytes: Buffer): Map<Wanted, string> {
  if (!isZipBytes(bytes)) throw new ExportError("not-zip", "That file is not a ZIP archive.")
  if (bytes.length > MAX_ZIP_BYTES) throw new ExportError("too-large", "That ZIP is too large.")
  // End of central directory: 22 bytes plus a comment of up to 65535 bytes.
  let eocd = -1
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 65535); at -= 1) {
    if (bytes.readUInt32LE(at) === 0x06054b50) {
      eocd = at
      break
    }
  }
  if (eocd < 0) throw new ExportError("not-zip", "That ZIP is damaged.")
  const count = bytes.readUInt16LE(eocd + 10)
  const dirOffset = bytes.readUInt32LE(eocd + 16)
  if (dirOffset === 0xffffffff || count === 0xffff) {
    throw new ExportError("unsupported", "ZIP64 archives are not supported.")
  }
  const out = new Map<Wanted, string>()
  let total = 0
  let at = dirOffset
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== 0x02014b50) {
      throw new ExportError("not-zip", "That ZIP is damaged.")
    }
    const flags = bytes.readUInt16LE(at + 8)
    const method = bytes.readUInt16LE(at + 10)
    const compressed = bytes.readUInt32LE(at + 20)
    const size = bytes.readUInt32LE(at + 24)
    const nameLength = bytes.readUInt16LE(at + 28)
    const extraLength = bytes.readUInt16LE(at + 30)
    const commentLength = bytes.readUInt16LE(at + 32)
    const localOffset = bytes.readUInt32LE(at + 42)
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString("utf8")
    at += 46 + nameLength + extraLength + commentLength

    const key = basename(name) as Wanted
    if (!WANTED.includes(key) || out.has(key)) continue
    if (flags & 1) continue // encrypted
    if (method !== 0 && method !== 8) continue
    if (size > MAX_ENTRY_BYTES || total + size > MAX_TOTAL_BYTES) {
      throw new ExportError("too-large", "The profile files in that ZIP are too large.")
    }
    if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new ExportError("not-zip", "That ZIP is damaged.")
    }
    const start =
      localOffset + 30 + bytes.readUInt16LE(localOffset + 26) + bytes.readUInt16LE(localOffset + 28)
    const data = bytes.subarray(start, start + compressed)
    if (data.length !== compressed) throw new ExportError("not-zip", "That ZIP is damaged.")
    let content: Buffer
    try {
      // maxOutputLength stops a zip bomb even when the declared size lies.
      content = method === 0 ? data : inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES })
    } catch {
      throw new ExportError("too-large", "A profile file in that ZIP could not be read.")
    }
    total += content.length
    if (total > MAX_TOTAL_BYTES) {
      throw new ExportError("too-large", "The profile files in that ZIP are too large.")
    }
    out.set(key, content.toString("utf8"))
  }
  return out
}

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes, a leading BOM. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "")
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i += 1
        } else quoted = false
      } else field += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += char
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim()))
}

/** Rows as objects. Some exports put "Notes:" lines above the header, so find it by a known column. */
export function csvRecords(text: string, knownColumn: string): Record<string, string>[] {
  const rows = parseCsv(text)
  const headerAt = rows.findIndex((cells) =>
    cells.some((cell) => cell.trim().toLowerCase() === knownColumn.toLowerCase())
  )
  if (headerAt < 0) return []
  const header = rows[headerAt].map((cell) => cell.trim())
  return rows.slice(headerAt + 1).map((cells) => {
    const record: Record<string, string> = {}
    header.forEach((column, index) => (record[column] = (cells[index] ?? "").trim()))
    return record
  })
}

function range(start?: string, end?: string): string {
  const from = (start ?? "").trim()
  const to = (end ?? "").trim()
  if (!from && !to) return ""
  return `${from || "?"} - ${to || "Present"}`
}

/** Profile sections from the export. Address, birth date, and contact columns are dropped. */
export function sectionsFromExport(files: Map<string, string>): LinkedInSections {
  const profile = files.has("profile.csv")
    ? csvRecords(files.get("profile.csv")!, "First Name")[0]
    : undefined
  const name = [profile?.["First Name"], profile?.["Last Name"]].filter(Boolean).join(" ")
  return {
    name: name || null,
    headline: profile?.Headline || null,
    location: profile?.["Geo Location"] || null,
    about: profile?.Summary || null,
    experience: csvRecords(files.get("positions.csv") ?? "", "Company Name").map((row) => ({
      company: row["Company Name"],
      title: row.Title,
      dates: range(row["Started On"], row["Finished On"]),
      location: row.Location,
      description: row.Description,
    })),
    education: csvRecords(files.get("education.csv") ?? "", "School Name").map((row) => ({
      school: row["School Name"],
      degree: [row["Degree Name"], row.Notes].filter(Boolean).join(", "),
      dates: range(row["Start Date"], row["End Date"]),
    })),
    skills: csvRecords(files.get("skills.csv") ?? "", "Name").map((row) => row.Name),
    certifications: csvRecords(files.get("certifications.csv") ?? "", "Name").map((row) =>
      [row.Name, row.Authority].filter(Boolean).join(" — ")
    ),
    languages: csvRecords(files.get("languages.csv") ?? "", "Name").map((row) =>
      [row.Name, row.Proficiency].filter(Boolean).join(" — ")
    ),
  }
}

/** The ZIP as profile text in the shared layout, or ExportError. */
export function linkedInExportText(bytes: Buffer): string {
  const files = readZipEntries(bytes)
  if (!files.has("profile.csv") && !files.has("positions.csv")) {
    throw new ExportError(
      "no-profile",
      "That ZIP has no Profile.csv or Positions.csv. Request the LinkedIn data archive with your profile."
    )
  }
  return linkedInLayout(sectionsFromExport(files))
}
