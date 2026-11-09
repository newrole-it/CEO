import { describe, expect, it } from "vitest"
import { companyConsent, defaultConsent } from "@newrole/cv-core/blank"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import type { CvContent } from "@newrole/cv-core/schema"
import { companyFree } from "./company-free"

/** The fixture CV with a profile that says `body`. */
function withProfile(content: CvContent, body: string): CvContent {
  return {
    ...content,
    sections: content.sections.map((section) =>
      section.id === "profile" && section.type === "text" ? { ...section, body } : section
    ),
  }
}

describe("companyFree", () => {
  const own = syntheticCv(2)

  it("replaces a clause that names the offer's company with the general CV's own", () => {
    const content = { ...own, consent: companyConsent("pl", "ITFS Sp. z o.o.") }
    const result = companyFree({
      content,
      language: "pl",
      company: "ITFS",
      general: { content: { ...own, consent: "Moja własna klauzula." }, language: "pl" },
      own,
    })
    expect(result.content.consent).toBe("Moja własna klauzula.")
    expect(result.check).toEqual({ company: "ITFS", consent: true, lines: [] })
    expect(result.content.sections).toEqual(content.sections)
  })

  it("keeps the general CV's clause hidden, and gives the plain one when the general CV's will not do", () => {
    const content = { ...own, consent: companyConsent("pl", "ITFS") }
    const hidden = { content: { ...own, consent: null }, language: "pl" as const }
    expect(
      companyFree({ content, language: "pl", company: "ITFS", general: hidden, own }).content
        .consent
    ).toBeNull()

    const named = {
      content: { ...own, consent: companyConsent("pl", "Acme") },
      language: "pl" as const,
    }
    expect(
      companyFree({ content, language: "pl", company: "ITFS", general: named, own }).content.consent
    ).toBe(defaultConsent("pl"))

    const english = { content: own, language: "en" as const }
    expect(
      companyFree({ content, language: "pl", company: "ITFS", general: english, own }).content
        .consent
    ).toBe(defaultConsent("pl"))
    expect(
      companyFree({ content, language: "pl", company: "ITFS", general: null, own: null }).content
        .consent
    ).toBe(defaultConsent("pl"))
  })

  it("leaves a clause that names no company as it is", () => {
    const content = { ...own, consent: "Zgoda na przetwarzanie danych." }
    const result = companyFree({ content, language: "pl", company: "ITFS", general: null, own })
    expect(result.content).toEqual(content)
    expect(result.check.consent).toBe(false)
  })

  it("lists lines that name the offer's company, in any case, hidden sections too", () => {
    const written = withProfile(own, "Chcę rozwijać platformę płatności w itfs.")
    const content: CvContent = {
      ...written,
      header: { ...written.header, headline: "Head of Engineering dla ITFS" },
      sections: written.sections.map((section) =>
        section.type === "skills" ? { ...section, hidden: true, title: "Pod ITFS" } : section
      ),
      consent: "Zgadzam się, by ITFS przetwarzał moje dane.",
    }
    const { check } = companyFree({
      content,
      language: "pl",
      company: "ITFS Sp. z o.o.",
      general: { content: own, language: "pl" },
      own,
    })
    expect(check.consent).toBe(false)
    expect(check.lines).toEqual([
      "Head of Engineering dla ITFS",
      "Chcę rozwijać platformę płatności w itfs.",
      "POD ITFS",
      "Zgadzam się, by ITFS przetwarzał moje dane.",
    ])
  })

  it("does not list a company the person's own CV names, nor a word that only contains it", () => {
    const content = withProfile(own, "Wracam do Przykładowa Firma 1 i do pracy z itfsami.")
    const { check } = companyFree({
      content,
      language: "pl",
      company: "Przykładowa Firma 1",
      general: { content: own, language: "pl" },
      own,
    })
    expect(check.lines).toEqual([])

    const other = companyFree({ content, language: "pl", company: "ITFS", general: null, own })
    expect(other.check.lines).toEqual([])
  })

  it("checks the name the clause gives too, and nothing when there is no company", () => {
    const content = {
      ...withProfile(own, "Dołączę do Acme Payments."),
      consent: companyConsent("pl", "Acme Payments S.A."),
    }
    const { check } = companyFree({ content, language: "pl", company: null, general: null, own })
    expect(check).toEqual({
      company: "Acme Payments S.A.",
      consent: true,
      lines: ["Dołączę do Acme Payments."],
    })

    expect(
      companyFree({ content: own, language: "pl", company: null, general: null, own }).check
    ).toEqual({ company: "", consent: false, lines: [] })
  })
})
