import { describe, expect, it } from "vitest"
import { companyConsent, consentCompanyOf, defaultConsent } from "./blank"

describe("the consent clause", () => {
  it("names the company in the CV's language, as plain text", () => {
    expect(companyConsent("pl", "  Acme\n Sp. z o.o. ")).toMatch(
      /^Wyrażam zgodę na przetwarzanie przez Acme Sp\. z o\.o\. moich danych osobowych /
    )
    expect(companyConsent("en", "<b>Acme</b> $& Co")).toMatch(
      /^I consent to bAcme\/b \$& Co processing my personal data /
    )
  })

  it("reads back the company a clause names, and nothing from any other clause", () => {
    expect(consentCompanyOf(companyConsent("pl", "Acme S.A."))).toBe("Acme S.A.")
    expect(consentCompanyOf(companyConsent("en", "Acme Ltd"))).toBe("Acme Ltd")
    expect(consentCompanyOf(defaultConsent("pl"))).toBeNull()
    expect(consentCompanyOf("Wyrażam zgodę na przetwarzanie moich danych.")).toBeNull()
    expect(consentCompanyOf(null)).toBeNull()
  })
})
