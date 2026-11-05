import { describe, expect, it } from "vitest"
import { classifyField, fold, isNeverFill, type FieldKind, type FormField } from "./fields"

function field(label: string, extra: Partial<FormField> = {}): FormField {
  return { key: label, label, type: "text", ...extra }
}

function expectKinds(cases: [FormField, FieldKind][]) {
  for (const [input, kind] of cases) {
    expect({ label: input.label, name: input.name, kind: classifyField(input) }).toEqual({
      label: input.label,
      name: input.name,
      kind,
    })
  }
}

const YES_NO = ["Yes", "No"]

describe("fold", () => {
  it("lowercases, drops diacritics and splits camelCase and brackets", () => {
    expect(fold("Imię i nazwisko*")).toBe("imie i nazwisko")
    expect(fold("Płeć")).toBe("plec")
    expect(fold("job_application[firstName]")).toBe("job application first name")
    expect(fold("Why us?")).toBe("why us?")
  })
})

describe("classifyField: Greenhouse", () => {
  it("reads the standard and custom questions", () => {
    expectKinds([
      [field("First Name", { name: "first_name", id: "first_name", required: true }), "firstName"],
      [field("Last Name", { name: "last_name", id: "last_name" }), "lastName"],
      [field("Preferred First Name", { id: "preferred_name" }), "firstName"],
      [field("Email", { type: "email", name: "email" }), "email"],
      [field("Phone", { type: "tel", name: "phone" }), "phone"],
      [
        field("Location (City)", { id: "candidate-location", name: "job_application[location]" }),
        "city",
      ],
      [field("Resume/CV", { type: "file", id: "resume" }), "resume"],
      [field("Cover Letter", { type: "file", id: "cover_letter" }), "coverLetter"],
      [
        field("LinkedIn Profile", { name: "job_application[answers_attributes][0][text_value]" }),
        "linkedin",
      ],
      [field("Website", { name: "job_application[answers_attributes][1][text_value]" }), "website"],
      [field("GitHub URL"), "github"],
      [
        field("Why do you want to work at Acme?", {
          type: "textarea",
          name: "job_application[answers_attributes][2][text_value]",
        }),
        "openQuestion",
      ],
      [
        field("Will you now or in the future require sponsorship for employment visa status?", {
          type: "select",
          options: YES_NO,
        }),
        "workAuthorization",
      ],
      [
        field("Are you legally authorized to work in Poland?", { type: "select", options: YES_NO }),
        "workAuthorization",
      ],
      [
        field("How did you hear about this job?", {
          type: "select",
          options: ["LinkedIn", "Referral", "Other"],
        }),
        "howHeard",
      ],
      [field("What are your salary expectations?"), "salary"],
      [
        field("Have you worked with Kubernetes in production?", {
          type: "select",
          options: YES_NO,
        }),
        "choiceQuestion",
      ],
    ])
  })

  it("never fills the voluntary self-identification block", () => {
    expectKinds([
      [
        field("Gender", {
          type: "select",
          options: ["Male", "Female", "Decline To Self Identify"],
        }),
        "eeo",
      ],
      [field("Are you Hispanic/Latino?", { type: "select", options: YES_NO }), "eeo"],
      [field("Race", { type: "select", options: ["White", "Asian", "Two or More Races"] }), "eeo"],
      [
        field("Veteran Status", { type: "select", options: ["I am not a protected veteran"] }),
        "eeo",
      ],
      [
        field("Disability Status", {
          type: "select",
          options: ["Yes", "No", "I don't wish to answer"],
        }),
        "eeo",
      ],
      [
        field("Please select", {
          type: "select",
          options: YES_NO,
          section: "Voluntary Self-Identification",
        }),
        "eeo",
      ],
    ])
  })
})

describe("classifyField: Lever", () => {
  it("reads the Lever card", () => {
    expectKinds([
      [field("Full name", { name: "name" }), "fullName"],
      [field("Email", { name: "email", type: "email" }), "email"],
      [field("Phone", { name: "phone" }), "phone"],
      [field("Current company", { name: "org" }), "other"],
      [field("Current location", { name: "location" }), "city"],
      [field("LinkedIn URL", { name: "urls[LinkedIn]" }), "linkedin"],
      [field("Twitter URL", { name: "urls[Twitter]" }), "other"],
      [field("GitHub URL", { name: "urls[GitHub]" }), "github"],
      [field("Portfolio URL", { name: "urls[Portfolio]" }), "website"],
      [field("Other website", { name: "urls[Other]" }), "website"],
      [field("Resume/CV", { type: "file", name: "resume" }), "resume"],
      [field("Additional information", { type: "textarea", name: "comments" }), "openQuestion"],
      [field("Pronouns", { type: "checkbox", options: ["He/him", "She/her", "They/them"] }), "eeo"],
      [
        field("What interests you about this role?", {
          type: "textarea",
          name: "cards[8b2f][field0]",
        }),
        "openQuestion",
      ],
    ])
  })
})

describe("classifyField: Ashby, Workable, Teamtailor, Recruitee", () => {
  it("reads Ashby system fields", () => {
    expectKinds([
      [field("Name", { name: "_systemfield_name" }), "fullName"],
      [field("Email", { name: "_systemfield_email", type: "email" }), "email"],
      [field("Resume", { type: "file", name: "_systemfield_resume" }), "resume"],
      [field("Location", { name: "_systemfield_location" }), "city"],
      [field("Earliest start date", { type: "date" }), "availableFrom"],
      [
        field("Are you willing to relocate to Berlin?", { type: "radio", options: YES_NO }),
        "relocation",
      ],
    ])
  })

  it("reads Workable", () => {
    expectKinds([
      [field("First name", { name: "firstname" }), "firstName"],
      [field("Last name", { name: "lastname" }), "lastName"],
      [field("Headline", { name: "headline" }), "other"],
      [field("Address", { name: "address" }), "address"],
      [field("Summary", { type: "textarea", name: "summary" }), "openQuestion"],
      [field("Cover letter", { type: "textarea", name: "cover_letter" }), "coverLetter"],
      [field("What is your notice period?"), "noticePeriod"],
    ])
  })

  it("reads Teamtailor and Recruitee", () => {
    expectKinds([
      [field("Imię", { name: "candidate[first_name]" }), "firstName"],
      [field("Nazwisko", { name: "candidate[last_name]" }), "lastName"],
      [field("Name", { name: "candidate[name]" }), "fullName"],
      [field("Phone number", { name: "candidate[phone]", type: "tel" }), "phone"],
      [field("CV", { type: "file", name: "candidate[cv]" }), "resume"],
      [field("Upload your resume", { type: "file", name: "candidate[resume]" }), "resume"],
      [
        field("I agree to the processing of my personal data for future recruitment", {
          type: "checkbox",
          name: "candidate[consent]",
        }),
        "consent",
      ],
    ])
  })
})

describe("classifyField: SmartRecruiters, Personio, Workday", () => {
  it("reads SmartRecruiters", () => {
    expectKinds([
      [field("First name", { name: "firstName" }), "firstName"],
      [field("Confirm your email", { name: "confirmEmail" }), "email"],
      [field("City", { name: "city" }), "city"],
      [
        field("Message to the Hiring Team", { type: "textarea", name: "hiringManagerMessage" }),
        "coverLetter",
      ],
    ])
  })

  it("reads Personio", () => {
    expectKinds([
      [field("Salary expectations", { name: "salary_expectations" }), "salary"],
      [field("Available from", { name: "available_from", type: "date" }), "availableFrom"],
      [
        field("How did you hear about us?", {
          name: "recruiting_channel",
          type: "select",
          options: ["LinkedIn", "Indeed"],
        }),
        "howHeard",
      ],
      [field("Documents", { type: "file", name: "documents" }), "resume"],
    ])
  })

  it("reads Workday", () => {
    expectKinds([
      [field("First Name", { id: "input-4", name: "legalNameSection_firstName" }), "firstName"],
      [field("Last Name", { name: "legalNameSection_lastName" }), "lastName"],
      [field("Address Line 1", { name: "addressSection_addressLine1" }), "address"],
      [field("City", { name: "addressSection_city" }), "city"],
      [field("Postal Code", { name: "addressSection_postalCode" }), "address"],
      [field("Country", { type: "select", options: ["Poland", "Germany"] }), "country"],
      [field("Phone Number", { name: "phone-number" }), "phone"],
      [field("Phone Device Type", { type: "select", options: ["Mobile", "Home"] }), "phone"],
      [field("Date of Birth", { type: "date" }), "eeo"],
      [field("Password", { type: "password" }), "secret"],
      [field("Verify New Password", { type: "password" }), "secret"],
    ])
  })
})

describe("classifyField: Polish forms", () => {
  it("reads pracuj.pl / eRecruiter / Traffit style labels", () => {
    expectKinds([
      [field("Imię i nazwisko"), "fullName"],
      [field("Adres e-mail"), "email"],
      [field("Numer telefonu"), "phone"],
      [field("Miejscowość"), "city"],
      [field("Kraj zamieszkania", { type: "select", options: ["Polska", "Niemcy"] }), "country"],
      [field("Załącz CV", { type: "file" }), "resume"],
      [field("List motywacyjny", { type: "file" }), "coverLetter"],
      [field("Oczekiwania finansowe (brutto, miesięcznie)"), "salary"],
      [field("Wymagania finansowe"), "salary"],
      // Questions about the work that use words of personal data.
      [field("Have you built mobile apps?"), "openQuestion"],
      [field("Have you sent e-mail campaigns?", { type: "textarea" }), "openQuestion"],
      [field("How do you handle race conditions?", { type: "textarea" }), "openQuestion"],
      [field("Jak wygląda u Ciebie orientacja na klienta?", { type: "textarea" }), "openQuestion"],
      [
        field("How did you build this product for disabled users?", { type: "textarea" }),
        "openQuestion",
      ],
      [
        field("Describe a marketing campaign you ran and what you learned from it in practice", {
          type: "textarea",
        }),
        "openQuestion",
      ],
      // And what they must not be confused with.
      [field("What is your phone?"), "phone"],
      [field("Where are you based?"), "city"],
      [field("Race", { type: "textarea" }), "eeo"],
      [field("I agree to receive marketing", { type: "checkbox" }), "consent"],
      [field("Ile chcesz zarabiać?"), "salary"],
      [field("What are your financial expectations?"), "salary"],
      [field("Expected monthly pay"), "salary"],
      [
        field("Okres wypowiedzenia", {
          type: "select",
          options: ["Od zaraz", "1 miesiąc", "3 miesiące"],
        }),
        "noticePeriod",
      ],
      [field("Od kiedy możesz rozpocząć pracę?"), "availableFrom"],
      [field("Link do profilu LinkedIn"), "linkedin"],
      [field("Skąd dowiedziałeś się o ofercie?"), "howHeard"],
      [
        field("Czy posiadasz prawo do pracy w Polsce?", { type: "radio", options: ["Tak", "Nie"] }),
        "workAuthorization",
      ],
      [
        field("Czy jesteś gotów do relokacji?", { type: "radio", options: ["Tak", "Nie"] }),
        "relocation",
      ],
      [field("Dlaczego chcesz u nas pracować?", { type: "textarea" }), "openQuestion"],
      [
        field("Opisz projekt, z którego jesteś najbardziej dumny", { type: "textarea" }),
        "openQuestion",
      ],
      [field("Płeć", { type: "radio", options: ["Kobieta", "Mężczyzna"] }), "eeo"],
      [field("Data urodzenia", { type: "date" }), "eeo"],
      [field("PESEL"), "secret"],
      [
        field(
          "Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb niezbędnych do realizacji procesu rekrutacji",
          { type: "checkbox" }
        ),
        "consent",
      ],
      [field("Zgoda na udział w przyszłych rekrutacjach", { type: "checkbox" }), "consent"],
      [field("Nazwa obecnego pracodawcy"), "other"],
    ])
  })
})

describe("classifyField: safety rules", () => {
  it("never fills secrets, hidden fields, card numbers and single checkboxes", () => {
    expectKinds([
      [field("", { type: "hidden", name: "authenticity_token" }), "secret"],
      [field("Card number", { autocomplete: "cc-number" }), "secret"],
      [field("Social Security Number"), "secret"],
      [field("Remember me", { type: "checkbox" }), "consent"],
      [field("I have read the Privacy Policy", { type: "checkbox" }), "consent"],
      [field("Age", { type: "number" }), "eeo"],
    ])
    for (const kind of ["secret", "eeo", "consent", "address"] as FieldKind[]) {
      expect(isNeverFill(kind)).toBe(true)
    }
    expect(isNeverFill("email")).toBe(false)
  })

  it("keeps long questions that mention a location as questions", () => {
    expectKinds([
      [
        field(
          "Are you comfortable working from our Warsaw location three days a week? Tell us more.",
          {
            type: "textarea",
          }
        ),
        "openQuestion",
      ],
      [field("Experience with Swift and SwiftUI (years)", { type: "number" }), "openQuestion"],
      [field("Language", { type: "select", options: ["Polish", "English"] }), "choiceQuestion"],
      [field("Nickname"), "other"],
    ])
  })
})
