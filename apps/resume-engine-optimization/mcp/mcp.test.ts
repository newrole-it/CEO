import { describe, expect, it } from "vitest"
import { clampLimit } from "./format"
import { profileData } from "./profile"
import { emptyProfileDraft } from "@newrole/profile/schema"
import { mcpLocale, systemLanguage } from "./copy"
import { pickUser } from "./user"

const users = [
  { id: 1, email: "owner@local", name: "Owner", role: "ADMIN" },
  { id: 2, email: "anna@example.com", name: "Anna", role: "USER" },
]

describe("the language of replies", () => {
  it("is NEWROLE_LOCALE when it is set, else the language of the machine", () => {
    expect(mcpLocale({ NEWROLE_LOCALE: "pl" }, "en-US")).toBe("pl")
    expect(mcpLocale({ NEWROLE_LOCALE: "EN" }, "pl-PL")).toBe("en")
    expect(mcpLocale({}, "pl-PL")).toBe("pl")
    expect(mcpLocale({}, "en-GB")).toBe("en")
  })

  it("is English for a language there is no dictionary for", () => {
    expect(mcpLocale({}, "de-DE")).toBe("en")
    expect(mcpLocale({ NEWROLE_LOCALE: "de" }, "pl-PL")).toBe("pl")
    expect(mcpLocale({}, undefined)).toBe("en")
  })
})

describe("the language of the machine", () => {
  const apple = (output: string) => () => output

  it("is what the terminal says when it says anything", () => {
    expect(systemLanguage({ env: { LANG: "pl_PL.UTF-8" }, platform: "darwin" })).toBe("pl-PL")
    expect(
      systemLanguage({ env: { LC_ALL: "en_GB.UTF-8", LANG: "pl_PL" }, platform: "linux" })
    ).toBe("en-GB")
  })

  it("is the first language in macOS's settings when the terminal sets none", () => {
    const read = apple('(\n    "pl-PL",\n    "en-US"\n)\n')
    expect(systemLanguage({ env: {}, platform: "darwin", appleLanguages: read })).toBe("pl-PL")
    expect(systemLanguage({ env: { LANG: "C" }, platform: "darwin", appleLanguages: read })).toBe(
      "pl-PL"
    )
  })

  it("does not ask macOS on another system, and survives a failed read", () => {
    const read = () => {
      throw new Error("defaults: not found")
    }
    expect(() => systemLanguage({ env: {}, platform: "linux", appleLanguages: read })).not.toThrow()
    expect(typeof systemLanguage({ env: {}, platform: "darwin", appleLanguages: read })).toBe(
      "string"
    )
  })
})

describe("NEWROLE_LOCALE", () => {
  it("takes a language tag as well as a bare code", () => {
    expect(mcpLocale({ NEWROLE_LOCALE: "pl-PL" }, "en-US")).toBe("pl")
    expect(mcpLocale({ NEWROLE_LOCALE: "en_GB" }, "pl-PL")).toBe("en")
  })

  it("ignores a value that only looks like a dictionary's name", () => {
    expect(mcpLocale({ NEWROLE_LOCALE: "constructor" }, "pl-PL")).toBe("pl")
  })
})

describe("user resolution", () => {
  it("uses NEWROLE_USER_EMAIL first", () => {
    const picked = pickUser(users, { NEWROLE_USER_EMAIL: "OWNER@local" })
    expect("user" in picked && picked.user.id).toBe(1)
    expect("user" in picked && picked.how).toBe("NEWROLE_USER_EMAIL")
  })

  it("still reads the old NOWAROLA_USER_EMAIL, and the new name wins over it", () => {
    const old = pickUser(users, { NOWAROLA_USER_EMAIL: "OWNER@local" })
    expect("user" in old && old.user.id).toBe(1)
    expect("user" in old && old.how).toBe("NOWAROLA_USER_EMAIL")
    const both = pickUser(users, {
      NEWROLE_USER_EMAIL: "anna@example.com",
      NOWAROLA_USER_EMAIL: "owner@local",
    })
    expect("user" in both && both.user.id).toBe(2)
  })

  it("falls back to the only regular account, then the owner", () => {
    const one = pickUser(users, {})
    expect("user" in one && one.user.id).toBe(2)
    const two = pickUser([...users, { id: 3, email: "b@x", name: null, role: "USER" }], {})
    expect("user" in two && two.user.id).toBe(1)
    expect("user" in two && two.how).toContain("NEWROLE_USER_EMAIL")
  })

  it("explains what to do when nothing matches", () => {
    expect(pickUser(users, { NEWROLE_USER_EMAIL: "nobody@x" })).toHaveProperty("error")
    expect(pickUser(users, { NOWAROLA_USER_EMAIL: "nobody@x" })).toHaveProperty("error")
    expect(pickUser([], {})).toHaveProperty("error")
  })
})

describe("profile import data", () => {
  it("keeps salary preferences on re-import unless new ones are given", () => {
    const draft = { ...emptyProfileDraft(), currentTitle: "CTO", skills: ["Go"] }
    const update = profileData(draft, {}, true)
    expect(update.currentTitle).toBe("CTO")
    expect(update).not.toHaveProperty("salaryContract")
    expect(update).not.toHaveProperty("salaryFloor")
    const withPrefs = profileData(
      draft,
      { salaryFloorPln: 25000, remotePreference: "remote" },
      true
    )
    expect(withPrefs).toMatchObject({
      salaryFloor: 25000,
      salaryCurrency: "PLN",
      remotePreference: "remote",
    })
    expect(profileData(draft, {}, false)).toMatchObject({ salaryContract: "b2b" })
  })
})

describe("formatting", () => {
  it("clamps limits", () => {
    expect(clampLimit(undefined, 10, 50)).toBe(10)
    expect(clampLimit(500, 10, 50)).toBe(50)
    expect(clampLimit(0.5, 10, 50)).toBe(1)
  })
})
