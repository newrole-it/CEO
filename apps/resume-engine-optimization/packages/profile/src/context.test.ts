import { describe, expect, it } from "vitest"
import { candidateContextText } from "./context"

describe("candidateContextText", () => {
  it("puts the candidate's own facts before the CV, in their words only", () => {
    const text = candidateContextText({
      name: "Ala",
      facts: ["  RAG na LangChain\n w produkcji od 2024.  ", " "],
      cvText: "Doświadczenie: platformy.",
    })
    expect(text).toBe(
      [
        "Name: Ala",
        "",
        "Facts the candidate added in their own words:",
        "- RAG na LangChain w produkcji od 2024.",
        "",
        "CV:",
        "Doświadczenie: platformy.",
      ].join("\n")
    )
    expect(candidateContextText({ name: "Ala", facts: [] })).toBe("Name: Ala")
  })
})
