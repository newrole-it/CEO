import { describe, expect, it } from "vitest"
import { buildProfile, parseSimilarReply, roleWords, scoreSimilar, skillsIn } from "./similar-companies"

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
