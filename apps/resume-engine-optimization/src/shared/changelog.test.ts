import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { repoRoot } from "src/server/repo"
import { parseChangelog } from "./changelog"

describe("parseChangelog", () => {
  it("reads dates, groups and lines, and skips the introduction", () => {
    const text = [
      "# Changelog",
      "",
      "Intro text.",
      "",
      "- not an entry, there is no date yet",
      "",
      "## 2026-10-31",
      "",
      "### Added",
      "",
      "- One",
      "- Two",
      "",
      "### Fixed",
      "",
      "- Three",
    ].join("\n")
    expect(parseChangelog(text)).toEqual([
      {
        title: "2026-10-31",
        groups: [
          { title: "Added", items: ["One", "Two"] },
          { title: "Fixed", items: ["Three"] },
        ],
      },
    ])
  })

  it("leaves out a date or group with nothing under it", () => {
    const text = "## Unreleased\n\n### Added\n\n## 2026-10-31\n\n### Added\n\n- One\n\n### Fixed\n"
    expect(parseChangelog(text)).toEqual([
      { title: "2026-10-31", groups: [{ title: "Added", items: ["One"] }] },
    ])
  })
})

describe("CHANGELOG.md", () => {
  const releases = parseChangelog(readFileSync(join(repoRoot(), "CHANGELOG.md"), "utf8"))

  it("can be read by the /changelog page", () => {
    expect(releases.length).toBeGreaterThan(0)
  })

  it("lists dates newest first, after Unreleased", () => {
    const titles = releases.map((release) => release.title).filter((t) => t !== "Unreleased")
    for (const title of titles) expect(title).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(titles).toEqual([...titles].sort().reverse())
  })

  it("holds plain text only, because the page shows each line as it is", () => {
    const lines = releases.flatMap((release) => release.groups.flatMap((group) => group.items))
    for (const line of lines) expect(line).not.toMatch(/\*\*|\]\(|`/)
  })
})
