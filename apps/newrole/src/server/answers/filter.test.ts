import { describe, expect, it } from "vitest"
import {
  cleanTags,
  cleanText,
  formPairVerdict,
  hasRedaction,
  normalizeAnswer,
  personalNames,
  personalValues,
  queryMatch,
  queryTerms,
  redactContacts,
  selectFormPairs,
} from "./filter"

const skip = (question: string, answer: string, personal: string[] = []) => {
  const verdict = formPairVerdict({ question, answer }, personal)
  return verdict.keep ? null : verdict.reason
}

describe("form answers worth keeping", () => {
  it("keeps open answers and salary expectations", () => {
    expect(
      skip("Why do you want to join us?", "I have built payment systems for 8 years.")
    ).toBeNull()
    expect(skip("Jakie są Twoje oczekiwania finansowe?", "30 000 PLN netto B2B")).toBeNull()
    expect(skip("Expected salary", "25000")).toBeNull()
    expect(skip("Expected monthly salary (PLN)", "25 000 - 30 000")).toBeNull()
    expect(skip("Years of experience with Kotlin", "10")).toBeNull()
    expect(skip("Do you require visa sponsorship?", "No")).toBeNull()
    expect(
      skip("How do you address technical debt in a large codebase?", "Budget 20% of each sprint.")
    ).toBeNull()
  })

  it("keeps questions about the work that use words of personal data", () => {
    const answer = "Zbudowałem asystenta do analizy umów, wdrożony u 40 klientów w trzy miesiące."
    for (const question of [
      "Jaki ostatnio produkt zrobiłeś przy pomocy AI?",
      "Name a product you built that you are proud of",
      "How do you handle race conditions in distributed systems?",
      "Have you built mobile apps?",
      "Have you sent e-mail campaigns?",
      "How do you ensure GDPR compliance in your product?",
      "Describe a data processing pipeline you designed",
      "How did you build for disabled users?",
    ]) {
      expect([question, skip(question, answer)]).toEqual([question, null])
    }
    expect(skip("Have you built mobile apps?", "Tak")).toBeNull()
  })

  it("skips who recommended the person, and their nationality", () => {
    expect(skip("Kto Cię polecił?", "Anna Nowak")).toBe("personal-question")
    expect(skip("Referred by", "Anna Nowak")).toBe("personal-question")
    expect(skip("Obywatelstwo", "polskie")).toBe("eeo")
    expect(skip("What is your phone?", "Zadzwoń po południu")).toBe("personal-question")
  })

  it("skips empty and one-character answers", () => {
    expect(skip("Why us?", "   ")).toBe("empty")
    expect(skip("Why us?", "x")).toBe("too-short")
    expect(skip("Years of experience with Kotlin", "8")).toBe("too-short")
    expect(skip("", "Something")).toBe("empty")
  })

  it("skips identity and contact questions", () => {
    expect(skip("First name", "Rafał")).toBe("personal-question")
    expect(skip("Imię i nazwisko", "Rafał Testowy")).toBe("personal-question")
    expect(skip("Email address", "rafal@example.com")).toBe("personal-question")
    expect(skip("Phone number", "+48 600 100 200")).toBe("personal-question")
    expect(skip("Numer telefonu", "600100200")).toBe("personal-question")
    expect(skip("City", "Warszawa")).toBe("personal-question")
    expect(skip("LinkedIn profile", "linkedin.com/in/someone")).toBe("personal-question")
    expect(skip("Date of birth", "1985-01-01")).toBe("personal-question")
  })

  it("skips consent and EEO questions", () => {
    expect(skip("I agree to the processing of my personal data", "Yes")).toBe("consent")
    expect(skip("Wyrażam zgodę na przetwarzanie danych osobowych", "Tak")).toBe("consent")
    expect(skip("Gender", "Male")).toBe("eeo")
    expect(skip("Are you a protected veteran?", "I am not a protected veteran")).toBe("eeo")
    expect(skip("Do you have a disability?", "No")).toBe("eeo")
  })

  it("skips links, file names, checkbox values and contact data in answers", () => {
    expect(skip("Anything you would like to share?", "https://github.com/someone")).toBe("url")
    expect(skip("Your best project", "www.example.com/portfolio")).toBe("url")
    expect(skip("Resume / CV", "Rafal_Testowy_CV.pdf")).toBe("personal-question")
    expect(skip("Attach your work sample", "C:\\fakepath\\sample.pdf")).toBe("file")
    expect(skip("Attach your work sample", "sample deck.pdf")).toBe("file")
    expect(skip("Can we contact your manager?", "on")).toBe("checkbox")
    expect(skip("How can we reach you?", "Call me at +48 600 100 200")).toBe("contact")
    expect(skip("Anything else?", "write to me: me@example.com")).toBe("contact")
  })

  it("skips the person's own details even under an unusual label", () => {
    const personal = personalValues({
      name: "Rafał Testowy",
      email: "rafal@example.com",
      applicant: { phone: "+48 600 100 200", githubUrl: "https://github.com/mw" },
    })
    expect(skip("Who are you?", "Rafał Testowy", personal)).toBe("personal-value")
    expect(skip("Reach out", "600 100 200", personal)).toBe("contact")
    expect(skip("Who are you?", "A backend engineer", personal)).toBeNull()
  })

  it("redacts contacts inside long answers instead of dropping them", () => {
    const long = `${"I led the payments team for three years and shipped the new checkout. ".repeat(
      4
    )}Reach me at me@example.com or +48 600 100 200.`
    const verdict = formPairVerdict({ question: "Tell us about yourself", answer: long })
    expect(verdict.keep).toBe(true)
    if (verdict.keep) {
      expect(verdict.answer).toContain("[e-mail]")
      expect(verdict.answer).toContain("[telefon]")
      expect(verdict.answer).not.toContain("me@example.com")
    }
    expect(redactContacts("Budget 2024: 25 000 PLN")).toBe("Budget 2024: 25 000 PLN")
  })

  it("replaces the person's name inside an answer, whole words only", () => {
    const names = personalNames({
      name: "Rafał Testowy",
      applicant: { firstName: "Rafał", lastName: "Testowy" },
    })
    expect(names).toEqual(["Rafał Testowy", "Testowy", "Rafał"])
    const verdict = formPairVerdict(
      { question: "Cover letter", answer: "Pozdrawiam, rafał testowy. Rafałowi się uda." },
      [],
      names
    )
    expect(verdict.keep && verdict.answer).toBe("Pozdrawiam, [imię i nazwisko]. Rafałowi się uda.")
    expect(hasRedaction("Pozdrawiam, [imię i nazwisko].")).toBe(true)
    expect(hasRedaction("Pisz na [e-mail].")).toBe(true)
    expect(hasRedaction("Zwykła odpowiedź [1].")).toBe(false)
  })

  it("dedupes one submission and reports why the rest were skipped", () => {
    const { keep, skipped } = selectFormPairs([
      { question: "Why us?", answer: "Great team." },
      { question: "Why us? *", answer: "great team" },
      { question: "Email", answer: "me@example.com" },
      { question: "Notice period", answer: "1 month" },
    ])
    expect(keep).toEqual([
      { question: "Why us?", answer: "Great team." },
      { question: "Notice period", answer: "1 month" },
    ])
    expect(skipped.map((item) => item.reason)).toEqual(["duplicate", "personal-question"])
  })
})

describe("cleanup", () => {
  it("cleans tags", () => {
    expect(cleanTags([" motywacja ", "Motywacja", "Łódź", "lodz", "", 5, "x".repeat(60)])).toEqual([
      "motywacja",
      "Łódź",
      "x".repeat(40),
    ])
    expect(cleanTags(Array.from({ length: 20 }, (_, index) => `t${index}`))).toHaveLength(12)
    expect(cleanTags("why")).toEqual([])
  })

  it("normalizes text and answers", () => {
    expect(cleanText("  a \r\n\r\n\r\n- b  ", 100)).toBe("a\n\n- b")
    expect(cleanText("abcdef", 3)).toBe("abc")
    expect(normalizeAnswer("Great team!")).toBe(normalizeAnswer("  great   TEAM "))
    expect(normalizeAnswer("Zespół")).toBe(normalizeAnswer("zespol"))
  })
})

describe("text search", () => {
  const row = {
    question: "Dlaczego chcesz pracować w Allegro?",
    answer: "Lubię skalę i Kotlin.",
    company: "Allegro",
    jobTitle: "Engineering Manager",
    tags: ["motywacja"],
  }

  it("matches word prefixes in any field, accents ignored", () => {
    expect(queryMatch(row, queryTerms("kotl"))).toBe(1)
    expect(queryMatch(row, queryTerms("pracowac allegro"))).toBe(2)
    expect(queryMatch(row, queryTerms("manager motyw"))).toBe(1)
    expect(queryMatch(row, queryTerms("python"))).toBe(0)
    expect(queryMatch(row, queryTerms("legro"))).toBe(0)
    expect(queryMatch(row, [])).toBe(1)
  })
})
