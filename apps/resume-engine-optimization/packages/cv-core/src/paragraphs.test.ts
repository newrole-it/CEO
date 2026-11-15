import { describe, expect, it } from "vitest"
import { splitParagraphs } from "./paragraphs"
import { inlineToText, sanitizeInline } from "./sanitize"

describe("splitParagraphs", () => {
  it("cuts at every line break", () => {
    expect(splitParagraphs("a<br>b")).toEqual(["a", "b"])
    expect(splitParagraphs("one line")).toEqual(["one line"])
  })

  it("closes and reopens formatting that spans a break", () => {
    expect(splitParagraphs("<strong>a<br>b</strong>")).toEqual([
      "<strong>a</strong>",
      "<strong>b</strong>",
    ])
    expect(splitParagraphs("<strong>a <em>b<br>c</em> d</strong> e")).toEqual([
      "<strong>a <em>b</em></strong>",
      "<strong><em>c</em> d</strong> e",
    ])
  })

  it("keeps a link's address on both sides", () => {
    expect(splitParagraphs('<a href="https://x.pl">x<br>y</a>')).toEqual([
      '<a href="https://x.pl">x</a>',
      '<a href="https://x.pl">y</a>',
    ])
  })

  it("keeps a blank line in the middle and drops formatting left empty", () => {
    expect(splitParagraphs("a<br><br>b")).toEqual(["a", "", "b"])
    expect(splitParagraphs("a<br> <br>b")).toEqual(["a", "", "b"])
    expect(splitParagraphs("<strong>a<br><br>b</strong>")).toEqual([
      "<strong>a</strong>",
      "",
      "<strong>b</strong>",
    ])
  })

  it("gives nothing for a blank value", () => {
    expect(splitParagraphs("")).toEqual([])
    expect(splitParagraphs(null)).toEqual([])
    expect(splitParagraphs("<br>")).toEqual([])
    expect(splitParagraphs(" ")).toEqual([])
    expect(splitParagraphs("<strong> </strong>")).toEqual([])
  })

  it("sanitizes what it is given", () => {
    expect(splitParagraphs("<div>a</div><div>b<script>x</script></div>")).toEqual(["a", "b"])
  })

  it("joins back to the same text", () => {
    for (const value of [
      "a<br>b",
      "<strong>a<br>b</strong> c",
      "a<br><br>b &amp; c",
      '<a href="https://x.pl">x<br>y</a>',
    ]) {
      const joined = sanitizeInline(splitParagraphs(value).join("<br>"))
      expect(inlineToText(joined)).toBe(inlineToText(value))
      expect(splitParagraphs(joined)).toEqual(splitParagraphs(value))
    }
  })
})
