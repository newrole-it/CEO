import { describe, expect, it } from "vitest"
import {
  atsCompanySlug,
  atsUrlFacts,
  companyFromHost,
  companyFromSlug,
  extractJobByRules,
  extractJobFromIndex,
  normalizePostingUrl,
  parseTitle,
  postingUrlCandidates,
} from "./job-extract"

describe("atsCompanySlug", () => {
  it("reads the company from known ATS URLs", () => {
    const cases: [string, string | null][] = [
      ["https://boards.greenhouse.io/acme/jobs/4012345", "acme"],
      ["https://job-boards.greenhouse.io/acme/jobs/4012345?gh_src=x", "acme"],
      ["https://job-boards.eu.greenhouse.io/acmeeu/jobs/123", "acmeeu"],
      ["https://boards.greenhouse.io/embed/job_app?for=acme&token=123", "acme"],
      ["https://jobs.lever.co/netguru/8b2f-uuid/apply", "netguru"],
      ["https://jobs.eu.lever.co/docplanner/uuid", "docplanner"],
      ["https://jobs.ashbyhq.com/elevenlabs/uuid/application", "elevenlabs"],
      ["https://apply.workable.com/brainly/j/ABC123/apply/", "brainly"],
      ["https://allegro.teamtailor.com/jobs/12345-senior-engineer", "allegro"],
      ["https://revolut.recruitee.com/o/backend-engineer", "revolut"],
      ["https://jobs.smartrecruiters.com/Visa/743999912345678-senior-engineer", "Visa"],
      ["https://n26.jobs.personio.de/job/123456", "n26"],
      ["https://acme.jobs.personio.com/job/1", "acme"],
      [
        "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Warsaw/Engineer_JR1",
        "nvidia",
      ],
      ["https://www.example.com/careers/123", null],
      ["not a url", null],
    ]
    for (const [url, slug] of cases) expect([url, atsCompanySlug(url)]).toEqual([url, slug])
  })

  it("reads the role and location SmartRecruiters and Workday put in the URL", () => {
    expect(
      atsUrlFacts("https://jobs.smartrecruiters.com/Visa/743999912345678-senior-backend-engineer")
        .title
    ).toBe("Senior Backend Engineer")
    expect(
      atsUrlFacts(
        "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Warsaw-Poland/Senior-Software-Engineer_JR1987654"
      )
    ).toEqual({ title: "Senior Software Engineer", location: "Warsaw Poland" })
  })
})

describe("companyFromSlug", () => {
  it("prefers the spelling the page uses", () => {
    expect(companyFromSlug("acme-corp", ["Senior Engineer - ACME Corp"])).toBe("ACME Corp")
    expect(companyFromSlug("elevenlabs", ["Join ElevenLabs today"])).toBe("ElevenLabs")
    expect(companyFromSlug("netguru")).toBe("Netguru")
    expect(companyFromSlug("brand-new-co")).toBe("Brand New Co")
  })
})

describe("parseTitle", () => {
  it("reads common ATS title patterns", () => {
    expect(parseTitle("Job Application for Senior Backend Engineer at Acme")).toMatchObject({
      company: "Acme",
      title: "Senior Backend Engineer",
    })
    expect(parseTitle("Senior Engineer @ Acme")).toMatchObject({
      company: "Acme",
      title: "Senior Engineer",
    })
    expect(parseTitle("Netguru - Senior React Developer", "Netguru")).toMatchObject({
      company: "Netguru",
      title: "Senior React Developer",
    })
    expect(parseTitle("Head of Engineering - Brainly", "brainly")).toMatchObject({
      company: "Brainly",
      title: "Head of Engineering",
    })
    expect(parseTitle("Acme - Staff Engineer | Greenhouse")).toMatchObject({
      company: "Acme",
      title: "Staff Engineer",
    })
    expect(parseTitle("Engineering Manager | Allegro")).toMatchObject({
      company: "Allegro",
      title: "Engineering Manager",
    })
    expect(parseTitle("Visa Senior Backend Engineer | SmartRecruiters", "Visa")).toMatchObject({
      company: "Visa",
      title: "Senior Backend Engineer",
    })
  })

  it("returns only a role when the title has no company", () => {
    expect(parseTitle("Senior Engineer")).toMatchObject({ company: null, title: "Senior Engineer" })
    expect(parseTitle("")).toMatchObject({ company: null, title: null })
  })
})

describe("extractJobByRules", () => {
  it("combines the ATS slug and the title", () => {
    expect(
      extractJobByRules({
        url: "https://jobs.lever.co/netguru/8b2f/apply",
        title: "Netguru - Senior React Developer",
      })
    ).toEqual({ company: "Netguru", title: "Senior React Developer", location: null })
    expect(
      extractJobByRules({
        url: "https://boards.greenhouse.io/acme/jobs/1",
        title: "Job Application for Platform Engineer at ACME",
      })
    ).toMatchObject({ company: "ACME", title: "Platform Engineer" })
    expect(
      extractJobByRules({
        url: "https://allegro.teamtailor.com/jobs/1-engineering-manager",
        title: "Engineering Manager - Allegro",
      })
    ).toMatchObject({ company: "Allegro", title: "Engineering Manager" })
  })

  it("trusts an explicit company over a slug that spells something else", () => {
    expect(
      extractJobByRules({
        url: "https://boards.greenhouse.io/tiktok-eu/jobs/1",
        title: "Job Application for SRE at TikTok",
      })
    ).toMatchObject({ company: "TikTok", title: "SRE" })
    expect(
      extractJobByRules({
        url: "https://jobs.lever.co/acme/1",
        title: "Staff Engineer - Warsaw",
      })
    ).toMatchObject({ company: "Acme", title: "Staff Engineer" })
  })

  it("uses og:site_name when there is no ATS slug", () => {
    expect(
      extractJobByRules({
        url: "https://careers.example.com/1",
        title: "Data Engineer | Example",
        siteName: "Example",
      })
    ).toMatchObject({ company: "Example", title: "Data Engineer" })
  })
})

describe("normalizePostingUrl", () => {
  it("maps application pages to their posting", () => {
    const cases: [string, string][] = [
      ["https://jobs.lever.co/acme/uuid/apply", "https://jobs.lever.co/acme/uuid"],
      [
        "https://jobs.ashbyhq.com/acme/uuid/application?src=x#top",
        "https://jobs.ashbyhq.com/acme/uuid?src=x",
      ],
      ["https://apply.workable.com/acme/j/ABC/apply/", "https://apply.workable.com/acme/j/ABC"],
      [
        "https://nvidia.wd5.myworkdayjobs.com/en-US/Site/job/Warsaw/Engineer_R1/apply/applyManually",
        "https://nvidia.wd5.myworkdayjobs.com/en-US/Site/job/Warsaw/Engineer_R1",
      ],
      [
        "https://boards.greenhouse.io/embed/job_app?for=acme&token=123",
        "https://boards.greenhouse.io/acme/jobs/123",
      ],
      ["https://boards.greenhouse.io/acme/jobs/123", "https://boards.greenhouse.io/acme/jobs/123"],
      ["not a url", "not a url"],
    ]
    for (const [input, output] of cases) expect(normalizePostingUrl(input)).toBe(output)
  })

  it("keeps two embedded Greenhouse jobs apart", () => {
    expect(
      normalizePostingUrl("https://boards.greenhouse.io/embed/job_app?for=acme&token=1")
    ).not.toBe(normalizePostingUrl("https://boards.greenhouse.io/embed/job_app?for=acme&token=2"))
  })
})

describe("index lookup and fallbacks", () => {
  it("tries the posting URL without /apply", async () => {
    expect(postingUrlCandidates("https://jobs.lever.co/acme/uuid/apply")).toEqual([
      "https://jobs.lever.co/acme/uuid/apply",
      "https://jobs.lever.co/acme/uuid",
    ])
    const seen: string[] = []
    const job = await extractJobFromIndex("https://jobs.lever.co/acme/uuid/apply", async (url) => {
      seen.push(url)
      return url.endsWith("/uuid")
        ? { company: { name: "Acme" }, title: "SRE", locationText: "Kraków" }
        : null
    })
    expect(job).toEqual({ company: "Acme", title: "SRE", location: "Kraków" })
    expect(seen).toHaveLength(2)
  })

  it("names the company from the host", () => {
    expect(companyFromHost("https://careers.allegro.pl/offer/1")).toBe("Allegro")
    expect(companyFromHost("https://www.acme.com/jobs/1")).toBe("Acme")
  })
})
