import { describe, expect, it } from "vitest"
import type { FormField } from "./fields"
import { durationDays, isoDate, numbersIn, pickOption, profileValue, yesNoAnswer } from "./values"

const applicant = {
  firstName: "Rafał",
  lastName: "Testowy",
  email: "rafal@example.com",
  phone: "+48 600 000 000",
  city: "Warszawa",
  country: "Polska",
  linkedinUrl: "https://www.linkedin.com/in/example",
  noticePeriod: "1 miesiąc",
  availableFrom: "01.12.2026",
  salaryExpectation: "30 000 PLN netto B2B / mies.",
  workAuthorization: "Obywatelstwo PL/UE, bez sponsorowania wizy",
  relocation: "Tak, w obrębie UE",
}

function f(label: string, extra: Partial<FormField> = {}): FormField {
  return { key: label, label, type: "text", ...extra }
}

describe("pickOption", () => {
  it("matches exact, synonyms and contained options", () => {
    expect(pickOption("Polska", ["Select...", "Germany", "Poland"], "country")).toBe("Poland")
    expect(pickOption("Poland", ["Niemcy", "Polska"], "country")).toBe("Polska")
    expect(pickOption("Polska", ["Poland (+48)", "Germany (+49)"], "country")).toBe("Poland (+48)")
    expect(pickOption("Warszawa", ["Warsaw, Poland", "Kraków, Poland"], "city")).toBe(
      "Warsaw, Poland"
    )
    expect(pickOption("Tak", ["Yes", "No"])).toBe("Yes")
    expect(pickOption("Mars", ["Poland", "Germany"], "country")).toBeNull()
    expect(pickOption("", ["Poland"])).toBeNull()
  })

  it("matches notice periods by duration", () => {
    expect(durationDays("1 miesiąc")).toBe(30)
    expect(durationDays("2 weeks")).toBe(14)
    expect(durationDays("Od zaraz")).toBe(0)
    expect(
      pickOption("1 miesiąc", ["Immediately", "1 month", "2 months", "3 months"], "noticePeriod")
    ).toBe("1 month")
    expect(pickOption("3 months", ["Od zaraz", "1 miesiąc", "3 miesiące"], "noticePeriod")).toBe(
      "3 miesiące"
    )
    expect(pickOption("immediately", ["Od zaraz", "1 miesiąc"], "noticePeriod")).toBe("Od zaraz")
  })

  it("matches a salary to the range that contains it", () => {
    expect(numbersIn("10 000 – 15 000 PLN")).toEqual([10000, 15000])
    expect(numbersIn("15k-20k")).toEqual([15000, 20000])
    expect(
      pickOption("30 000 PLN netto", ["20 000 - 25 000", "25 000 - 35 000", "35 000+"], "salary")
    ).toBe("25 000 - 35 000")
  })
})

describe("yesNoAnswer", () => {
  it("answers sponsorship and authorization questions from the work authorization text", () => {
    const text = applicant.workAuthorization
    expect(yesNoAnswer("workAuthorization", "Will you require visa sponsorship?", text)).toBe("no")
    expect(
      yesNoAnswer("workAuthorization", "Are you legally authorized to work in the EU?", text)
    ).toBe("yes")
    expect(yesNoAnswer("workAuthorization", "Czy posiadasz prawo do pracy w Polsce?", text)).toBe(
      "yes"
    )
    expect(
      yesNoAnswer(
        "workAuthorization",
        "Will you require sponsorship?",
        "I will need a visa sponsorship"
      )
    ).toBe("yes")
    expect(yesNoAnswer("workAuthorization", "Anything else?", text)).toBeNull()
  })

  it("answers relocation from its first word", () => {
    expect(yesNoAnswer("relocation", "Willing to relocate?", "Tak, w obrębie UE")).toBe("yes")
    expect(yesNoAnswer("relocation", "Willing to relocate?", "Nie")).toBe("no")
    expect(yesNoAnswer("relocation", "Willing to relocate?", "Zależy od miasta")).toBeNull()
  })
})

describe("profileValue", () => {
  it("fills text fields and selects from the applicant details", () => {
    expect(profileValue(f("Full name"), "fullName", applicant)).toBe("Rafał Testowy")
    expect(profileValue(f("Email", { type: "email" }), "email", applicant)).toBe(
      "rafal@example.com"
    )
    expect(
      profileValue(
        f("Country", { type: "select", options: ["Germany", "Poland"] }),
        "country",
        applicant
      )
    ).toBe("Poland")
    expect(
      profileValue(
        f("Visa sponsorship required?", { type: "radio", options: ["Yes", "No"] }),
        "workAuthorization",
        applicant
      )
    ).toBe("No")
    expect(
      profileValue(
        f("Czy możesz się przeprowadzić?", { type: "radio", options: ["Tak", "Nie"] }),
        "relocation",
        applicant
      )
    ).toBe("Tak")
    expect(profileValue(f("Start date", { type: "date" }), "availableFrom", applicant)).toBe(
      "2026-12-01"
    )
    expect(profileValue(f("Phone", { maxLength: 6 }), "phone", applicant)).toBe("+48 60")
    expect(profileValue(f("GitHub"), "github", applicant)).toBeNull()
  })
})

describe("helpers", () => {
  it("normalises dates", () => {
    expect(isoDate("2026-12-01")).toBe("2026-12-01")
    expect(isoDate("1.12.2026")).toBe("2026-12-01")
    expect(isoDate("od zaraz")).toBeNull()
  })
})
