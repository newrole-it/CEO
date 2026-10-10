import {describe, expect, it} from "vitest"
import {parseGreenhouseJobs} from "./greenhouse"
import {parseSmartRecruiters} from "./smartrecruiters"
import {parseWorkableJobs} from "./workable"
import {parseAshbyJobs} from "./ashby"
import {isBlockedSlug, namesAgree} from "./blocked"
import {PLANNED_ATS} from "./types"

describe("ATS adapters", () => {
  it("reads a Greenhouse list without requiring the description", () => {
    const jobs = parseGreenhouseJobs(
      {
        jobs: [
          {
            id: 42,
            title: "Head of Engineering",
            absolute_url: "https://job-boards.greenhouse.io/acme/jobs/42",
            location: {name: "Warsaw, Poland"},
            company_name: "Acme",
            first_published: "2026-10-01T00:00:00.000Z",
          },
        ],
      },
      "acme",
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0].needsHydration).toBe(true)
    expect(jobs[0].companyName).toBe("Acme")
    expect(jobs[0].sourceType).toBe("GREENHOUSE")
  })

  it("prefers Ashby workplaceType over a loose isRemote flag", () => {
    const jobs = parseAshbyJobs(
      {
        jobs: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            title: "Engineering Manager",
            location: "Warsaw",
            isRemote: true,
            workplaceType: "Hybrid",
            jobUrl: "https://jobs.ashbyhq.com/acme/11111111-1111-1111-1111-111111111111",
            compensation: {scrapeableCompensationSalarySummary: "20000-28000 PLN / month"},
          },
        ],
      },
      "acme",
      "Acme",
    )
    expect(jobs[0].workplaceType).toBe("HYBRID")
    expect(jobs[0].salaryText).toContain("PLN")
  })

  it("treats an empty Workable account as having no jobs", () => {
    expect(parseWorkableJobs({name: "Workable", jobs: []}, "madeup").jobs).toEqual([])
  })

  it("treats a SmartRecruiters zero page as an empty list", () => {
    expect(parseSmartRecruiters({totalFound: 0, content: []}, "madeup")).toEqual([])
  })

  it("keeps the known wrong-company slugs blocked and leaves room for the next ATS", () => {
    expect(isBlockedSlug("GREENHOUSE", "wise")).toBe(true)
    expect(isBlockedSlug("ASHBY", "ramp")).toBe(true)
    expect(isBlockedSlug("WORKABLE", "1password")).toBe(true)
    expect(isBlockedSlug("LEVER", "neon")).toBe(true)
    expect(namesAgree("CD PROJEKT RED", "CDPROJEKTRED")).toBe(true)
    expect(namesAgree("GitLab", "Wise Worksite")).toBe(false)
    expect(PLANNED_ATS.map((item) => item.id)).toEqual(["teamtailor", "recruitee", "personio"])
    expect(PLANNED_ATS.every((item) => item.status === "unverified")).toBe(true)
  })
})
