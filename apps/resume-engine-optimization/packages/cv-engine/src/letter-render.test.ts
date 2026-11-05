import { describe, expect, it } from "vitest"
import { syntheticLetter as letter } from "@newrole/cv-core/fixtures"
import {
  letterSection,
  parseCvContent,
  type CvContent,
  type CvLetterSection,
} from "@newrole/cv-core/schema"
import { renderCvAtoms, renderCvHtml } from "./render"

const sectionOf = (content: CvContent): CvLetterSection => {
  const found = letterSection(content)
  if (!found) throw new Error("no letter")
  return found
}

describe("rendering a letter", () => {
  it("prints every part, escaped, under the letter's own title", () => {
    const html = renderCvHtml(letter(), { print: true })
    expect(html).toContain("· List motywacyjny</title>")
    expect(html).toContain("Dotyczy: Staff Engineer")
    expect(html).toContain("Drugi &lt;b&gt;akapit&lt;/b&gt;")
    expect(html).not.toContain("<b>akapit")
    expect(html).not.toContain("<img")
  })

  it("sanitizes rich paragraphs edited by hand", () => {
    const content = letter()
    const section = sectionOf(content)
    const parsed = parseCvContent({
      ...content,
      sections: [{ ...section, paragraphs: ["<script>x</script><b>ok</b>"] }],
    })
    expect(renderCvAtoms(parsed as CvContent)).toContain(
      '<p class="cv-letter-text"><strong>ok</strong></p>'
    )
  })
})
