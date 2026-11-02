import { describe, expect, it } from "vitest"
import {
  buildProfile,
  parseSimilarReply,
  profileSignals,
  rankByOpenings,
  rankForProfile,
  roleWords,
  scoreSimilar,
  skillsIn,
} from "./similar-companies"

describe("suggestions without likes", () => {
  const jobs = [
    { companyId: "fit", title: "Kafka Engineer", summary: "" },
    { companyId: "fit", title: "Senior Backend Engineer", summary: "Kafka, AWS" },
    { companyId: "fit", title: "Accountant", summary: "" },
    { companyId: "one", title: "Backend Engineer", summary: "" },
    { companyId: "watched", title: "Kafka Engineer", summary: "" },
    { companyId: "big", title: "Accountant", summary: "" },
    { companyId: "big", title: "Recruiter", summary: "" },
    { companyId: "big", title: "Lawyer", summary: "" },
    { companyId: "big", title: "Nurse", summary: "" },
  ]
  const signals = profileSignals({
    currentTitle: "Senior Backend Engineer",
    pastTitles: ["Software Engineer"],
    skills: ["Kafka", "AWS"],
  })

  it("reads skills and role words from a profile", () => {
    expect([...signals.skills]).toEqual(expect.arrayContaining(["kafka", "aws", "backend"]))
    expect([...signals.roles]).toEqual(expect.arrayContaining(["backend", "engineer", "software"]))
    expect(profileSignals({}).skills.size).toBe(0)
  })

  it("ranks by offers that fit, skips watched companies and names the shared skills", () => {
    const ranked = rankForProfile(signals, jobs, new Set(["watched"]))
    expect(ranked.map((item) => item.companyId)).toEqual(["fit", "one"])
    expect(ranked[0]).toMatchObject({ matching: 2 })
    expect(ranked[0]?.terms[0]).toBe("Kafka")
    expect(ranked[0]?.terms).toContain("AWS")
  })

  it("finds nothing for a profile that says nothing", () => {
    expect(rankForProfile(profileSignals({}), jobs, new Set())).toEqual([])
  })

  it("falls back to the companies with the most offers", () => {
    expect(rankByOpenings(jobs, new Set(["fit"]), 2)).toEqual(["big", "one"])
  })
})

describe("skill and role extraction", () => {
  it("finds tech terms without matching inside words", () => {
    expect(skillsIn("Senior Kotlin Developer (Kafka, AWS)")).toEqual(
      expect.arrayContaining(["kotlin", "kafka", "aws"])
    )
    expect(skillsIn("Golang engineer")).toContain("golang")
    expect(skillsIn("Category manager")).not.toContain("go")
    expect(skillsIn("C++ / C# engineer")).toEqual(expect.arrayContaining(["c++", "c#"]))
    expect(roleWords("Senior Backend Engineer (m/f/d) - Warszawa")).toEqual(["backend", "engineer"])
  })

  it.each([
    ["Senior Go Developer", "go"],
    ["Backend Engineer (Go)", "go"],
    ["Python/Go, Kubernetes", "go"],
    ["Experience in Go and gRPC", "go"],
    ["Go, PostgreSQL, AWS", "go"],
    ["Data Engineer", "data"],
    ["Big Data Developer", "data"],
    ["Senior Data Scientist", "data"],
    ["ML Engineer", "ml"],
    ["AI Engineer", "ai"],
    ["QA Automation Engineer", "qa"],
    ["Node.js Developer", "node"],
    ["React Developer", "react"],
  ])("reads the technology in %s", (text, term) => {
    expect(skillsIn(text)).toContain(term)
  })

  it.each([
    ["Sales Rep: always on the go", "go"],
    ["Go beyond your limits with us", "go"],
    ["Ready to go to market", "go"],
    ["Data Entry Clerk", "data"],
    ["Master Data Specialist", "data"],
    ["Data Protection Officer", "data"],
    ["We value your data and privacy", "data"],
    ["Pharmacist, 5 ml doses", "ml"],
    ["Join OpenAI-style startup", "ai"],
    ["Network node operations", "node"],
    ["You react quickly to change", "react"],
  ])("does not take an everyday word for a technology: %s", (text, term) => {
    expect(skillsIn(text)).not.toContain(term)
  })

  it("keeps a bare skill from the person's own list", () => {
    const signals = profileSignals({ skills: ["go", "Data", "ai"] })
    expect([...signals.skills]).toEqual(expect.arrayContaining(["go", "data", "ai"]))
  })

  it("does not rank offers on everyday words", () => {
    const signals = profileSignals({ currentTitle: "Go Developer", skills: ["Go", "data"] })
    const jobs = [
      { companyId: "sales", title: "Field Sales Rep", summary: "A job for people on the go" },
      { companyId: "entry", title: "Data Entry Clerk", summary: "Typing data all day" },
      { companyId: "gopher", title: "Backend Engineer", summary: "Go, Kafka" },
    ]
    expect(rankForProfile(signals, jobs, new Set()).map((item) => item.companyId)).toEqual([
      "gopher",
    ])
  })
})

describe("scoreSimilar", () => {
  const liked = buildProfile({ id: "allegro", name: "Allegro", industry: "e-commerce" }, [
    { title: "Senior Kotlin Developer", summary: "Kafka, microservices" },
    { title: "Backend Engineer", summary: "Kotlin and Kafka on GCP" },
  ])
  const candidates = [
    buildProfile({ id: "olx", name: "OLX", industry: "e-commerce" }, [
      { title: "Kotlin Backend Engineer", summary: "Kafka" },
    ]),
    buildProfile({ id: "bank", name: "Bank", industry: "banking" }, [
      { title: "Java Developer", summary: "Spring" },
    ]),
    buildProfile({ id: "kafkaco", name: "KafkaCo", industry: null }, [
      { title: "Platform Engineer", summary: "Kafka and GCP" },
    ]),
    buildProfile({ id: "watched", name: "Watched", industry: "e-commerce" }, [
      { title: "Kotlin Backend Engineer", summary: "Kafka" },
    ]),
  ]

  it("ranks same industry and shared stack first, explains why, and skips excluded", () => {
    const result = scoreSimilar([liked], candidates, new Set(["watched"]), 5)
    expect(result.map((item) => item.companyId)).toEqual(["olx", "kafkaco"])
    expect(result[0]?.reason).toContain("same industry as Allegro")
    expect(result[0]?.reason).toMatch(/kotlin|kafka/)
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score)
  })

  it("returns nothing without likes", () => {
    expect(scoreSimilar([], candidates, new Set())).toEqual([])
  })
})

describe("parseSimilarReply", () => {
  it("drops known domains, job boards, duplicates, and bad URLs", () => {
    const text = JSON.stringify([
      { name: "Allegro", url: "https://allegro.pl", reason: "known" },
      { name: "Brainly", url: "brainly.com", reason: "edtech, Kotlin" },
      { name: "Board", url: "https://justjoin.it/brand/x" },
      { name: "Brainly again", url: "https://careers.brainly.com/" },
      { name: "", url: "https://noname.pl" },
      { name: "Bad", url: "javascript:alert(1)" },
    ])
    expect(parseSimilarReply(text, ["allegro.pl"])).toEqual([
      { name: "Brainly", url: "https://brainly.com/", reason: "edtech, Kotlin" },
    ])
  })
})
