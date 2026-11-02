export type ChangelogGroup = { title: string; items: string[] }
export type ChangelogRelease = { title: string; groups: ChangelogGroup[] }

/**
 * Reads the small part of Markdown that CHANGELOG.md is written in: `##` starts a date, `###` a
 * group and `-` one line. Anything before the first date is the file's own introduction. A date or
 * group with nothing under it is left out, so an empty Unreleased does not show on the page.
 */
export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = []
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith("## ")) {
      releases.push({ title: line.slice(3).trim(), groups: [] })
    } else if (line.startsWith("### ")) {
      releases.at(-1)?.groups.push({ title: line.slice(4).trim(), items: [] })
    } else if (line.startsWith("- ")) {
      releases.at(-1)?.groups.at(-1)?.items.push(line.slice(2).trim())
    }
  }
  return releases
    .map((release) => ({
      ...release,
      groups: release.groups.filter((group) => group.items.length > 0),
    }))
    .filter((release) => release.groups.length > 0)
}
