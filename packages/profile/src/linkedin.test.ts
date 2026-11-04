import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"
import { parseLinkedInProfile, profileText } from "./linkedin"

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8")

describe("LinkedIn profile text", () => {
  it("parses a LinkedIn export into headline, about, experience, skills, and education", () => {
    const document = parseLinkedInProfile(fixture("linkedin-export.txt"))
    expect(document).not.toBeNull()
    expect(document?.name).toBe("Rafał Testowy")
    expect(document?.location).toBe("Warsaw, Poland")
    expect(document?.blocks.find((block) => block.kind === "headline")?.parts[0].text).toBe(
      "Head of Engineering"
    )
    expect(document?.blocks.filter((block) => block.kind === "about")).toHaveLength(1)
    expect(document?.blocks.filter((block) => block.kind === "experience")).toHaveLength(2)
    expect(document?.blocks.find((block) => block.kind === "skills")?.parts[0].text).toBe(
      "TypeScript · Leadership"
    )
    expect(document?.blocks.filter((block) => block.kind === "education")).toHaveLength(1)
    expect(profileText(document!)).not.toMatch(/pwned|set the score/i)
    const firstRole = document?.blocks.find((block) => block.id === "experience-1")
    expect(firstRole?.parts.find((part) => part.field === "title")?.text).toBe(
      "Head of Engineering"
    )
    expect(firstRole?.parts.find((part) => part.field === "body")?.text).toBe(
      "Responsible for various things."
    )
  })
})
