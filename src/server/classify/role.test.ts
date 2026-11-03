import { describe, expect, it } from "vitest"
import {
  areasToMention,
  classifyCompany,
  classifyRole,
  classifyTechRole,
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
    expect(classifyRole("UX Designer").isTechRole).toBe(true)
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

  it("keeps every IT role in, at any level and in any IT function", () => {
    for (const title of [
      "QA Engineer",
      "Manual Tester",
      "Programista Java",
      "Senior Backend Developer",
      "IT Project Manager",
      "Technical Program Manager",
      "Kierownik projektów IT",
      "Director of Engineering",
      "VP of Engineering",
      "Head of Data",
      "CTO",
      "CISO",
      "IT Director",
      "Business Analyst",
      "Database Administrator",
      "Service Desk Analyst",
      "Scrum Master",
      "Product Owner",
      "Salesforce Developer",
      "SAP Consultant",
      "Sales Engineer",
      "Solutions Architect",
      "Customer Success Engineer",
      "Logistics Software Engineer",
      "Marketing Data Engineer",
    ]) {
      expect(classifyRole(title).isTechRole, title).toBe(true)
    }
  })

  it("keeps engineering outside IT out", () => {
    for (const title of [
      "Mechanical Engineer",
      "Civil Engineer",
      "Process Engineer",
      "Field Service Engineer",
      "Maintenance Technician",
      "HVAC Engineer",
    ]) {
      expect(classifyRole(title).isTechRole, title).toBe(false)
    }
  })

  it("reads titles from the outside catalog in other languages and by product name", () => {
    for (const title of [
      "Développeur Java spécialisé en intégration",
      "Softwareentwickler (m/w/d)",
      "Kaufmann/-frau für IT-Systeme bzw. Informatik (m/w/d)",
      "SAP Basis Administrator (SAP HANA & Azure Cloud)",
      "Functional Consultant – Dynamics 365 & Power Platform",
      "C++ Developer",
      "Ingénieur·e HPC & Calcul distribué – GPU, Cloud, IA (H/F)",
      "Site Reliability Engineer",
    ]) {
      expect(classifyRole(title).isTechRole, title).toBe(true)
    }
    for (const title of [
      "Zahnarzt (m/w/d) in Augsburg",
      "Butikssäljare till Synsam Örebro 80%",
      "Chauffeur livreur polyvalent H/F",
      "Elektromonteur Beveiligingsinstallaties",
      "Business Developer / Sales - Commercial terrain H/F",
      "Accounts Payable Specialist",
      "Fire Protection Engineer, R&D",
      "Mechanical Design Engineer",
    ]) {
      expect(classifyRole(title).isTechRole, title).toBe(false)
    }
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

describe("electrical, hardware and design roles", () => {
  it("keeps electrical and hardware engineering out, firmware and embedded software in", () => {
    for (const title of [
      "Staff Electrical Engineer – Test Systems",
      "Senior Power Engineer Analogue Design",
      "Senior Hardware Test Engineer",
      "Avionics Systems Engineer (Starship)",
      "FPGA Engineer",
      "ASIC Design Verification Engineer",
      "SoC Design Engineer",
      "Controls Engineer",
    ]) {
      expect(classifyTechRole(title), title).toBe(false)
    }
    for (const title of [
      "Firmware Engineer",
      "Embedded Software Engineer",
      "Power Platform Engineer",
      "Optical Network Engineer",
      "SOC Engineer",
      "Security Controls Engineer",
    ]) {
      expect(classifyTechRole(title), title).toBe(true)
    }
  })

  it("counts design as IT for the web, apps, 3D and games only", () => {
    for (const title of [
      "Website Designer",
      "Sr. UI/UX Designer (m/f/d)",
      "Web Graphic Designer",
      "3D Artist",
      "Motion Designer / 3D Artist",
      "Environment Artist",
      "Level Designer",
      "Projektant UX",
    ]) {
      expect(classifyTechRole(title), title).toBe(true)
    }
    for (const title of [
      "Graphic Designer",
      "Brand Designer",
      "Creative Designer (BBS879)",
      "Industrial Designer",
      "Junior SOLIDWORKS Designer",
      "Instructional Designer",
      "Motion Designer",
      "Grafik",
    ]) {
      expect(classifyTechRole(title), title).toBe(false)
    }
    // Left to the board: on an IT board a product designer designs its screens.
    expect(classifyTechRole("Product Designer")).toBeNull()
    expect(classifyTechRole("Designer")).toBeNull()
  })

  it("keeps out roles that only borrow an IT word, and AI-training gigs", () => {
    for (const title of [
      "Automatyk/Programista PLC",
      "CRM & Marketing Automation Specialist",
      "Partner Account Manager - Poland (Cybersecurity)",
      "Senior Landscape Architect",
      "Senior Solutions Engineer, Injection Molding",
      "B1 Licensed Aircraft Engineer",
      "Analytics Consultant, AI Trainer",
    ]) {
      expect(classifyTechRole(title), title).toBe(false)
    }
    expect(classifyTechRole("Technical Account Manager")).toBe(true)
    expect(classifyTechRole("HSO International - Dynamics 365 F&O Finance Lead Consultant")).toBe(
      true
    )
    expect(classifyTechRole("Ekspert ds. Cyberbezpieczeństwa (GRC & SecOps)")).toBe(true)
    expect(classifyTechRole("Analityk Biznesowo-Systemowy Aplikacji Mobilnych")).toBe(true)
    expect(classifyTechRole("Cinematic Animator")).toBe(true)
    expect(classifyTechRole("Finance Manager")).toBe(false)
    expect(classifyTechRole("Software Engineers - Platform")).toBe(true)
    expect(classifyTechRole("Regulatory Engineering - Software Engineering")).toBe(true)
  })

  it("leaves a bare engineer title to the board", () => {
    expect(classifyTechRole("Senior Engineer")).toBeNull()
    expect(classifyTechRole("Production Engineer")).toBeNull()
    expect(classifyTechRole("Principal Bridge Engineer")).toBeNull()
    expect(classifyTechRole("Staff Engineer, Test Automation")).toBe(true)
    expect(classifyTechRole("Senior Rust Engineer")).toBe(true)
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
