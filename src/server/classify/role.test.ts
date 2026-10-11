import { describe, expect, it } from "vitest"
import {
  areasToMention,
  classifyCompany,
  classifyRole,
  examplePhrases,
  inTechScope,
  pickMixedPreview,
  seniorityAffinity,
  techArea,
} from "./role"

describe("seniority classifier", () => {
  it("reads leadership and individual-contributor bands from the title", () => {
    expect(classifyRole("CTO").seniority).toBe("c_level")
    expect(classifyRole("Head of Engineering").seniority).toBe("head")
    expect(classifyRole("Director of Engineering").seniority).toBe("director")
    expect(classifyRole("VP Engineering").seniority).toBe("vp")
    expect(classifyRole("Engineering Manager").seniority).toBe("manager")
    expect(classifyRole("Junior Software Engineer").seniority).toBe("junior")
    expect(classifyRole("Senior Data Engineer").seniority).toBe("senior")
  })
})

describe("tech role classifier", () => {
  it("keeps technology functions in and other functions out", () => {
    expect(classifyRole("Junior Software Engineer").isTechRole).toBe(true)
    expect(classifyRole("Product Designer").isTechRole).toBe(true)
    expect(classifyRole("Data Engineer").isTechRole).toBe(true)
    expect(classifyRole("Security Engineer").isTechRole).toBe(true)
    expect(classifyRole("Engineering Manager").isTechRole).toBe(true)
    expect(classifyRole("Head of Engineering").isTechRole).toBe(true)

    expect(classifyRole("Security Guard").isTechRole).toBe(false)
    expect(classifyRole("Store Associate").isTechRole).toBe(false)
    expect(classifyRole("Fashion Designer").isTechRole).toBe(false)
    expect(classifyRole("Interior Designer").isTechRole).toBe(false)
    expect(classifyRole("Account Executive").isTechRole).toBe(false)
    expect(classifyRole("CFO").isTechRole).toBe(false)
    expect(classifyRole("Warehouse Operative").isTechRole).toBe(false)
    expect(classifyRole("Site Manager").isTechRole).toBe(false)
    expect(classifyRole("Grocery Associate").isTechRole).toBe(false)
    expect(classifyRole("People Generalist").isTechRole).toBe(false)
    expect(classifyRole("Financial Manager").isTechRole).toBe(false)
    expect(classifyRole("Senior Marketing Analyst").isTechRole).toBe(false)
  })

  it("leaves a general title undecided so the company can decide", () => {
    expect(classifyRole("CEO").isTechRole).toBeNull()
    expect(classifyRole("Project Manager").isTechRole).toBeNull()
  })

  it("drops a non-tech role at a tech company and keeps an uncertain role there", () => {
    expect(inTechScope(false, true)).toBe(false)
    expect(inTechScope(null, true)).toBe(true)
    expect(inTechScope(true, false)).toBe(true)
    expect(inTechScope(null, false)).toBe(false)
    expect(inTechScope(null, null)).toBeNull()
  })

  it("treats an ATS employer as tech unless the industry is clearly not", () => {
    expect(classifyCompany({ sourceType: "GREENHOUSE" })).toBe(true)
    expect(classifyCompany({ sourceType: "GREENHOUSE", industry: "Construction" })).toBe(false)
    expect(classifyCompany({ industry: "Retail" })).toBe(false)
    expect(classifyCompany({ industry: "Software" })).toBe(true)
    expect(classifyCompany({ sourceType: "WORKDAY" })).toBeNull()
  })
})

describe("seniority affinity", () => {
  it("ranks a matching band higher and gives leadership profiles a nearby leadership boost", () => {
    expect(seniorityAffinity("director", "director")).toBe(6)
    expect(seniorityAffinity("junior", "junior")).toBe(6)
    expect(seniorityAffinity("c_level", "director")).toBe(4)
    expect(seniorityAffinity("head", "vp")).toBe(4)
    expect(seniorityAffinity("senior", "lead")).toBe(3)
    expect(seniorityAffinity("junior", "c_level")).toBe(0)
    expect(seniorityAffinity(null, "director")).toBe(0)
  })
})

describe("specialism list", () => {
  it("names a tech area and drops one the index barely has", () => {
    expect(techArea("Junior Frontend Developer")).toBe("engineering")
    expect(techArea("Senior Data Engineer")).toBe("data")
    expect(techArea("Platform Engineer")).toBe("devops")
    expect(techArea("QA Automation Engineer")).toBe("qa")
    expect(techArea("Product Manager")).toBe("product")
    expect(techArea("Product Designer")).toBe("design")
    expect(techArea("Store Associate")).toBeNull()
    const areas = areasToMention(
      { engineering: 800, data: 200, devops: 90, qa: 70, product: 60, design: 8 },
      2000
    )
    expect(areas).not.toContain("design")
    expect(areas).toContain("engineering")
    expect(examplePhrases(areas)).not.toContain("Product Designer")
    expect(examplePhrases(areas)).toContain("Junior Frontend")
  })
})

describe("landing preview", () => {
  it("mixes early, experienced, and leading titles", () => {
    const picked = pickMixedPreview([
      { seniority: "head", key: "a" },
      { seniority: "vp", key: "b" },
      { seniority: "junior", key: "c" },
      { seniority: "senior", key: "d" },
      { seniority: "director", key: "e" },
    ])
    expect(picked.map((item) => item.key)).toEqual(["c", "d", "a"])
  })
})
