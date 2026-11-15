// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { translator } from "../lib/copy.js"
import { applyCopy, formatDate, formatDateTime, intlLocale, pluralKind } from "../lib/i18n.js"

const ROOT = join(__dirname, "..")

describe("lib/i18n.js", () => {
  it("names the Intl locale of each language", () => {
    expect(intlLocale("pl")).toBe("pl-PL")
    expect(intlLocale("en")).toBe("en-GB")
  })

  it("formats a date in the given language", () => {
    expect(formatDate("2026-11-03T10:00:00Z", "pl")).toBe("3.11.2026")
    expect(formatDate("2026-11-03T10:00:00Z", "en")).toBe("03/11/2026")
    expect(formatDate("nope", "en")).toBe("")
  })

  it("formats a date with its time in the given language", () => {
    expect(formatDateTime("2026-11-03T10:00:00", "pl")).toBe("3.11.2026, 10:00")
    expect(formatDateTime("2026-11-03T10:00:00", "en")).toBe("03/11/2026, 10:00")
    expect(formatDateTime("nope", "pl")).toBe("")
  })

  it("picks the plural form", () => {
    expect([1, 2, 5, 22].map((n) => pluralKind(n, "pl"))).toEqual(["one", "few", "many", "few"])
    expect([1, 2, 5].map((n) => pluralKind(n, "en"))).toEqual(["one", "many", "many"])
  })

  it("fills a document from keys and sets its language", () => {
    document.body.innerHTML = `<button data-i18n="fit.tailor"></button><input data-i18n-attr="placeholder:fit.retry,title:fit.tailor">`
    applyCopy(document, translator("en"), "en")
    expect(document.querySelector("button")!.textContent).toBe("Tailor CV")
    expect(document.querySelector("input")!.placeholder).toBe("Try again")
    expect(document.querySelector("input")!.title).toBe("Tailor CV")
    expect(document.documentElement.lang).toBe("en")
  })
})

/**
 * Interface text lives in lib/copy.js. A line with a Polish letter anywhere else is text that
 * English speakers would see in Polish, unless it reads Polish input (a regular expression, a word
 * list) and says so with "i18n-ignore" on its line or the line above.
 */
describe("the extension's code", () => {
  const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/
  const files = [
    ...readdirSync(join(ROOT, "lib"))
      .filter((name) => name.endsWith(".js") && name !== "copy.js")
      .map((name) => join("lib", name)),
    join("entrypoints", "popup", "index.html"),
    join("entrypoints", "options", "index.html"),
    "wxt.config.ts",
  ]

  it("keeps Polish text out of the code", () => {
    const found: string[] = []
    for (const file of files) {
      const lines = readFileSync(join(ROOT, file), "utf8").split("\n")
      lines.forEach((line, index) => {
        if (!POLISH.test(line)) return
        if (line.includes("i18n-ignore") || lines[index - 1]?.includes("i18n-ignore")) return
        found.push(`${file}:${index + 1}`)
      })
    }
    expect(found).toEqual([])
  })
})
