import { describe, expect, it } from "vitest"
import { decideFetch } from "config/source-policies"
import { pairContractVariants } from "./variants"
import { parseRobots, robotsAllows } from "./robots"
import { parseSitemap } from "./sitemap"
import { aiOptOut, excerpt, stripPersonalData } from "./hygiene"
import { parseSuccessFactorsJob } from "src/server/adapters/successfactors"
import { buildListedJob } from "src/server/adapters/parse"

const GFT_ROBOTS = `
User-agent: *
Disallow: /applybutton/
Disallow: /talentcommunity/
Disallow: /services/
Disallow: /preapply/
`

describe("source policy", () => {
  it("allows GFT job pages and blocks /services/", () => {
    expect(decideFetch(new URL("https://jobs.gft.com/Poland/job/Role/1/")).allow).toBe(true)
    expect(decideFetch(new URL("https://jobs.gft.com/sitemap.xml")).allow).toBe(true)
    expect(decideFetch(new URL("https://jobs.gft.com/services/rss")).allow).toBe(false)
  })

  it("keeps legacy SuccessFactors, SAP, Oracle, Taleo, Phenom's own site, and HiBob as link-only", () => {
    expect(decideFetch(new URL("https://career55.sapsf.eu/career?company=allegrospz")).allow).toBe(
      false
    )
    expect(decideFetch(new URL("https://career55.sapsf.eu/robots.txt")).allow).toBe(true)
    expect(decideFetch(new URL("https://jobs.sap.com/job/1")).allow).toBe(false)
    expect(decideFetch(new URL("https://jobs.nokia.com/en/sites/CX_1/job/1")).allow).toBe(false)
    expect(decideFetch(new URL("https://fa007.taleo.net/careersection/jobdetail.ftl")).allow).toBe(
      false
    )
    expect(decideFetch(new URL("https://careers.phenom.com/us/en/job/1")).allow).toBe(false)
    expect(decideFetch(new URL("https://codility.careers.hibob.com/jobs/1")).allow).toBe(false)
    expect(decideFetch(new URL("https://skk.erecruiter.pl/Offer.aspx")).allow).toBe(false)
  })

  it("allows Workday job pages and cxs, and blocks refreshFacet on every Workday host", () => {
    expect(
      decideFetch(new URL("https://visa.wd5.myworkdayjobs.com/Visa/job/Warsaw/Head_1")).allow
    ).toBe(true)
    expect(
      decideFetch(new URL("https://visa.wd5.myworkdayjobs.com/wday/cxs/visa/Visa/jobs")).allow
    ).toBe(true)
    expect(decideFetch(new URL("https://visa.wd5.myworkdayjobs.com/refreshFacet/Visa")).allow).toBe(
      false
    )
    expect(decideFetch(new URL("https://example.myworkdaysite.com/site/job/1")).allow).toBe(true)
    expect(decideFetch(new URL("https://example.myworkday.com/site/job/1")).allow).toBe(true)
  })

  it("allows iCIMS job pages, Phenom employer domains, Avature feeds, and Siemens RSS only", () => {
    expect(
      decideFetch(new URL("https://careers-kingfisher2.icims.com/jobs/1/job?in_iframe=1")).allow
    ).toBe(true)
    expect(decideFetch(new URL("https://careers-kingfisher2.icims.com/jobs/1/login")).allow).toBe(
      false
    )
    expect(decideFetch(new URL("https://careers.mastercard.com/us/en/job/1")).allow).toBe(true)
    expect(decideFetch(new URL("https://careers.mastercard.com/us/en/apply")).allow).toBe(false)
    expect(decideFetch(new URL("https://careers.ibm.com/en/SearchJobs/feed/")).allow).toBe(true)
    expect(decideFetch(new URL("https://jobs.siemens.com/careers/SearchJobs/feed/")).allow).toBe(
      true
    )
    expect(decideFetch(new URL("https://jobs.siemens.com/careers/JobDetail/525242")).allow).toBe(
      false
    )
    expect(decideFetch(new URL("https://www.linkedin.com/jobs/view/1")).allow).toBe(false)
  })
})

describe("robots and sitemaps", () => {
  it("parses GFT robots and an undeclared sitemap urlset", () => {
    const rules = parseRobots(GFT_ROBOTS)
    expect(robotsAllows(rules, "/Poland/job/Role/1/")).toBe(true)
    expect(robotsAllows(rules, "/sitemap.xml")).toBe(true)
    expect(robotsAllows(rules, "/services/rss")).toBe(false)
    const legacy = parseRobots("User-agent: *\nDisallow: /\nAllow: /login\n")
    expect(robotsAllows(legacy, "/career")).toBe(false)
    expect(robotsAllows(legacy, "/login")).toBe(true)
    const parsed = parseSitemap(
      "<urlset><url><loc>https://jobs.gft.com/Poland/job/Role/1/</loc><lastmod>2026-10-03</lastmod></url></urlset>"
    )
    expect(parsed.urls[0]).toEqual({
      loc: "https://jobs.gft.com/Poland/job/Role/1/",
      lastmod: "2026-10-03",
    })
  })

  it("obeys crawl-delay on the specific agent", () => {
    const rules = parseRobots("User-agent: JobscannerBot\nCrawl-delay: 5\nDisallow:\n")
    expect(rules.crawlDelaySec).toBe(5)
  })
})

describe("career pages", () => {
  it("reads SuccessFactors microdata and pairs UoP with B2B", () => {
    const html = `
      <link rel="canonical" href="https://jobs.gft.com/Poland/job/Lodz-Principal-Solution-Architect/1429165933/" />
      <meta itemprop="datePosted" content="Mon Sep 28 02:00:00 UTC 2026" />
      <meta itemprop="hiringOrganization" content="GFT Technologies SE" />
      <span class="joblayouttoken-label">Working place: </span> Hybrid</span>
      <span class="joblayouttoken-label">Location: </span> Łódź, PL</span>
      <span itemprop="title">Principal Solution Architect</span>
      <span itemprop="description"><p><strong>Type of contract:</strong> employment contract</p>
      <p><strong>Salary range: </strong>25 000 - 37 000 PLN gross</p></span>
    `
    const employment = parseSuccessFactorsJob(
      html,
      "https://jobs.gft.com/hit",
      "GFT",
      "jobs.gft.com"
    )
    expect(employment?.title).toBe("Principal Solution Architect")
    expect(employment?.originalUrl).toContain("1429165933")
    expect(employment?.employmentType).toMatch(/employment/i)
    expect(employment?.salaryText).toContain("25 000")
    const b2b = buildListedJob({
      title: "Principal Solution Architect Consultant",
      companyName: "GFT",
      locationText: "Łódź, PL",
      employmentType: "B2B contract",
      salaryText: "270 - 350 PLN/H",
      originalUrl: "https://jobs.gft.com/Poland/job/Consultant/1429167433/",
      sourceType: "SUCCESSFACTORS",
      sourceBoardId: "jobs.gft.com",
    })
    const paired = pairContractVariants([employment!, b2b!])
    expect(paired).toHaveLength(1)
    expect(paired[0].title).toBe("Principal Solution Architect")
    expect(paired[0].variants).toHaveLength(2)
    expect(paired[0].salaryText).toContain("B2B")
    expect(paired[0].salaryText?.toLowerCase()).toContain("employment")
  })

  it("does not merge two employment posts and strips personal data", () => {
    const left = buildListedJob({
      title: "Engineer",
      companyName: "GFT",
      locationText: "Warsaw",
      employmentType: "employment contract",
      originalUrl: "https://jobs.gft.com/a/1/",
      sourceType: "SUCCESSFACTORS",
    })
    const right = buildListedJob({
      title: "Engineer",
      companyName: "GFT",
      locationText: "Warsaw",
      employmentType: "employment contract",
      originalUrl: "https://jobs.gft.com/a/2/",
      sourceType: "SUCCESSFACTORS",
    })
    expect(pairContractVariants([left!, right!])).toHaveLength(2)
    expect(
      stripPersonalData("Write to ada@gft.com or +48 600 100 200. Recruiter: Anna Nowak")
    ).not.toMatch(/ada@|600|Anna/)
    expect(excerpt("x".repeat(400)).length).toBeLessThanOrEqual(300)
    expect(aiOptOut('<meta name="robots" content="ai-input=no">', "example.com")).toBe(true)
    expect(aiOptOut("<p>Hello</p>", "jobs.siemens.com")).toBe(true)
    expect(aiOptOut("<p>Hello</p>", "jobs.gft.com")).toBe(false)
  })

  it("rejects non-http job links", () => {
    expect(
      buildListedJob({
        title: "Role",
        originalUrl: "javascript:alert(1)",
        sourceType: "GENERIC_HTML",
      })
    ).toBeNull()
  })
})
