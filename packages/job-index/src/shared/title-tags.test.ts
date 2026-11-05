import { describe, expect, it } from "vitest"
import {
  MAX_TAGS,
  ROLES,
  cleanTags,
  roleOf,
  suggestRoles,
  tagMatcher,
  tagNeedles,
  titleIsRole,
} from "./title-tags"

const role = (name: string) => roleOf(name)!

describe("title tags", () => {
  it("matches whole words, so a short tag does not hit inside longer words", () => {
    const cto = tagMatcher(["cto"])
    expect(cto({ title: "Director of Engineering" })).toBe(false)
    expect(cto({ title: "CTO / Co-Founder" })).toBe(true)
    expect(tagMatcher(["it"])({ title: "Security Engineer" })).toBe(false)
    expect(tagMatcher(["java"])({ title: "JavaScript Developer" })).toBe(false)
  })

  it("keeps an offer that matches any one of the tags", () => {
    const match = tagMatcher(["Engineering Manager", "Head of Engineering"])
    expect(match({ title: "Head of Engineering, Payments" })).toBe(true)
    expect(match({ title: "Senior Engineering Manager" })).toBe(true)
    expect(match({ title: "Senior Backend Engineer" })).toBe(false)
    expect(tagMatcher([])({ title: "Anything" })).toBe(true)
  })

  it("needs every word of a free-text tag, in the title or the employer's name", () => {
    const offer = { title: "Senior Backend Engineer", company: "Docplanner" }
    expect(tagMatcher(["docplanner"])(offer)).toBe(true)
    expect(tagMatcher(["Docplanner backend"])(offer)).toBe(true)
    expect(tagMatcher(["docplanner frontend"])(offer)).toBe(false)
    expect(tagMatcher(["docplanner"])({ ...offer, company: "Allegro" })).toBe(false)
  })

  it("reads a catalog role's other titles, gaps and exclusions", () => {
    const director = role("Director of Engineering")
    expect(titleIsRole("Director, Software Engineering", director)).toBe(true)
    expect(titleIsRole("Engineering Director", director)).toBe(true)
    expect(titleIsRole("Director of Platform Engineering", director)).toBe(true)
    expect(titleIsRole("Director, Sales Engineering", director)).toBe(false)
    expect(titleIsRole("Chief of Staff to the CTO", role("CTO"))).toBe(false)
    expect(titleIsRole("Front-End Developer", role("Frontend Developer"))).toBe(true)
  })

  it("compares without case or diacritics", () => {
    expect(titleIsRole("Lider Zespołu QA", role("Team Lead"))).toBe(true)
    expect(titleIsRole("Lider zespolu QA", role("Team Lead"))).toBe(true)
    expect(roleOf("head of  ENGINEERING")?.name).toBe("Head of Engineering")
  })

  it("cleans tags: one of each, cut, at most MAX_TAGS", () => {
    expect(cleanTags(["Java", " java ", "", null, "Go"])).toEqual(["Java", "Go"])
    expect(cleanTags(Array.from({ length: 20 }, (_, i) => `tag ${i}`))).toHaveLength(MAX_TAGS)
  })

  it("gives the database a word for every way a catalog role can match", () => {
    for (const item of ROLES) expect(tagNeedles(item.name), item.name).not.toBeNull()
    expect(tagNeedles("Data Architect")).toContainEqual({
      words: ["data", "architect"],
      company: false,
    })
  })

  it("suggests roles whose name or titles start with the typed words", () => {
    const names = suggestRoles("head", 20).map((item) => item.name)
    expect(names.slice(0, 1)).toEqual(["Head of Engineering"])
    expect(names).toContain("CISO / Head of Security")
    expect(suggestRoles("kierownik", 20).map((item) => item.name)).toContain("Project Manager")
  })
})
