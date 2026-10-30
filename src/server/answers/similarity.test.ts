import { describe, expect, it } from "vitest"
import { contentTokens, detectLanguage, questionKey, similarity, stem } from "./similarity"

describe("questionKey", () => {
  it("folds, strips punctuation and required markers, collapses spaces", () => {
    expect(questionKey("  Why do you want to work at Allegro? * (required)")).toBe(
      "why do you want to work at allegro"
    )
    expect(questionKey("Dlaczego chcesz pracować w Łodzi?")).toBe(
      "dlaczego chcesz pracowac w lodzi"
    )
    expect(questionKey("Experience with C++ / C#?")).toBe("experience with c++ c#")
  })

  it("groups variants that differ only in case, accents and punctuation", () => {
    expect(questionKey("Jakie są Twoje oczekiwania finansowe?")).toBe(
      questionKey("jakie sa twoje oczekiwania finansowe")
    )
    expect(questionKey("Why us?")).not.toBe(questionKey("Why them?"))
  })
})

describe("tokens", () => {
  it("drops stopwords and maps PL and EN words to the same concepts", () => {
    expect(contentTokens("Why do you want to work with us?").tokens).toEqual([
      "@why",
      "@motivation",
      "@work",
      "@us",
    ])
    expect(contentTokens("Dlaczego chcesz u nas pracować?").tokens).toEqual([
      "@why",
      "@motivation",
      "@us",
      "@work",
    ])
  })

  it("stems common endings but keeps short words", () => {
    expect(stem("projects")).toBe(stem("project"))
    expect(stem("projektu")).toBe(stem("projektach"))
    expect(stem("process")).toBe("process")
    expect(stem("go")).toBe("go")
  })
})

describe("similarity", () => {
  it("is 1 for the same question written differently", () => {
    expect(similarity("Why us?", "why US")).toBe(1)
    expect(similarity("Why do you want to work with us?", "Why do you want to work for us?")).toBe(
      1
    )
  })

  it("scores English paraphrases high", () => {
    expect(
      similarity(
        "Why do you want to work at Allegro?",
        "Why are you interested in joining Allegro?"
      )
    ).toBeGreaterThan(0.75)
    expect(
      similarity("What are your salary expectations?", "What is your expected salary?")
    ).toBeGreaterThan(0.85)
    expect(
      similarity(
        "Describe a challenging project you led",
        "Tell us about a difficult project you managed"
      )
    ).toBeGreaterThan(0.6)
  })

  it("scores Polish paraphrases high", () => {
    expect(
      similarity("Dlaczego chcesz u nas pracować?", "Dlaczego chcesz dołączyć do naszego zespołu?")
    ).toBeGreaterThan(0.7)
    expect(
      similarity(
        "Jakie są Twoje oczekiwania finansowe?",
        "Jakie masz oczekiwania co do wynagrodzenia?"
      )
    ).toBeGreaterThan(0.6)
    expect(
      similarity(
        "Opisz swoje największe osiągnięcie",
        "Jakie jest Twoje największe osiągnięcie zawodowe?"
      )
    ).toBeGreaterThan(0.6)
  })

  it("matches a Polish question with its English equivalent", () => {
    expect(
      similarity("Dlaczego chcesz u nas pracować?", "Why do you want to work with us?")
    ).toBeGreaterThan(0.6)
    expect(
      similarity("What is your notice period?", "Jaki jest Twój okres wypowiedzenia?")
    ).toBeGreaterThan(0.6)
  })

  it("keeps near-misses below the reuse threshold", () => {
    expect(
      similarity("Why do you want to work at Allegro?", "Why do you want to work at Google?")
    ).toBeLessThan(0.85)
    expect(
      similarity("Why do you want to leave your current job?", "Why do you want to work at X?")
    ).toBeLessThan(0.5)
    expect(
      similarity("Describe a project you are proud of", "Describe a challenging project you led")
    ).toBeLessThan(0.7)
    expect(
      similarity("What is your notice period?", "What are your salary expectations?")
    ).toBeLessThan(0.2)
    expect(
      similarity("Jaki jest Twój okres wypowiedzenia?", "Jakie są Twoje oczekiwania finansowe?")
    ).toBeLessThan(0.2)
  })

  it("is symmetric and bounded", () => {
    const a = "Tell us about yourself"
    const b = "Opowiedz o sobie"
    expect(similarity(a, b)).toBe(similarity(b, a))
    expect(similarity(a, b)).toBeGreaterThan(0.4)
    expect(similarity("", "Why us?")).toBe(0)
    expect(similarity("???", "!!!")).toBe(0)
  })
})

describe("detectLanguage", () => {
  it("reads Polish from diacritics and function words", () => {
    expect(detectLanguage("Jakie są Twoje oczekiwania?")).toBe("pl")
    expect(detectLanguage("Dlaczego?")).toBe("pl")
    expect(detectLanguage("Opisz projekt")).toBe("pl")
  })

  it("defaults to English", () => {
    expect(detectLanguage("Why us?")).toBe("en")
    expect(detectLanguage("Describe a project you led")).toBe("en")
    expect(detectLanguage("LinkedIn")).toBe("en")
  })
})
