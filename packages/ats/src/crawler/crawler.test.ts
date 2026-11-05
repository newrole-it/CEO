import { describe, expect, it } from "vitest"
import { decideFetch } from "@newrole/offers/source-policies"
import { pairContractVariants } from "./variants"
import { parseRobots, robotsAllows } from "@newrole/offers/robots"
import { orderSitemapChildren, parseSitemap } from "./sitemap"
import { aiOptOut, excerpt, stripPersonalData } from "@newrole/offers/hygiene"
import { parseSuccessFactorsJob } from "../adapters/successfactors"
import { buildListedJob } from "../adapters/parse"

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
    expect(decideFetch(new URL("https://skk.erecruiter.pl/Offer.aspx?oid=1&cfg=abc")).allow).toBe(
      true
    )
    expect(
      decideFetch(new URL("https://skk.erecruiter.pl/GetHtml.ashx?cfg=abc&grid=rows&pn=1")).allow
    ).toBe(true)
    expect(
      decideFetch(new URL("https://offers.erecruiter.pl/skk/company/1/offers.json?hash=a")).allow
    ).toBe(true)
    expect(
      decideFetch(
        new URL("https://system.erecruiter.pl/FormTemplates/RecruitmentForm.aspx?WebID=1")
      ).allow
    ).toBe(false)
    expect(decideFetch(new URL("https://jobs.jobvite.com/acme/jobs")).allow).toBe(true)
    expect(decideFetch(new URL("https://careers.mastercard.com/widgets")).allow).toBe(true)
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

  it("links iCIMS without fetching, allows Phenom employer domains, Avature feeds, Siemens RSS", () => {
    expect(
      decideFetch(new URL("https://careers-kingfisher2.icims.com/jobs/1/job?in_iframe=1")).allow
    ).toBe(false)
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

  it("follows the link-only channel check", () => {
    expect(decideFetch(new URL("https://careers.allegro.eu/job/engineer/1/")).allow).toBe(true)
    expect(decideFetch(new URL("https://careers.allegro.eu/sitemap.xml")).allow).toBe(true)
    expect(decideFetch(new URL("https://jobs.allegro.eu/job-offers/")).allow).toBe(false)
    expect(decideFetch(new URL("https://www.pracujwgp.pl/jobs.feed.json")).allow).toBe(true)
    expect(decideFetch(new URL("https://www.pracujwgp.pl/llms.txt")).allow).toBe(true)
    expect(decideFetch(new URL("https://sii.pl/oferty-pracy/id/1/role/")).allow).toBe(true)
    expect(decideFetch(new URL("https://careers.epam.com/en/vacancy/role_en")).allow).toBe(true)
    expect(decideFetch(new URL("https://www.synerise.com/careers/engineer")).allow).toBe(true)
    expect(decideFetch(new URL("https://www.synerise.com/api/cms/job-postings")).allow).toBe(false)
    expect(decideFetch(new URL("https://packhelp.peopleforce.io/careers/v/1")).allow).toBe(false)
    expect(decideFetch(new URL("https://apply.careers.dynatrace.com/job/1/")).allow).toBe(false)
    expect(decideFetch(new URL("https://revolut.com/careers/position/abc")).allow).toBe(false)
    expect(decideFetch(new URL("https://oviva.com/careers/")).allow).toBe(false)
    expect(
      decideFetch(new URL("https://codility.com/wp-json/codility-blocks/v1/careers-jobs")).allow
    ).toBe(false)
    expect(decideFetch(new URL("https://kariera.future-processing.pl/oferty-pracy/")).allow).toBe(
      false
    )
    expect(decideFetch(new URL("https://careers.jpmorgan.com/")).allow).toBe(false)
    expect(decideFetch(new URL("https://jobs.smartrecruiters.com/acme/1")).allow).toBe(true)
    const previous = process.env.SMARTRECRUITERS_POSTING_API
    delete process.env.SMARTRECRUITERS_POSTING_API
    expect(
      decideFetch(new URL("https://api.smartrecruiters.com/v1/companies/acme/postings")).allow
    ).toBe(false)
    expect(decideFetch(new URL("https://api.smartrecruiters.com/robots.txt")).allow).toBe(true)
    process.env.SMARTRECRUITERS_POSTING_API = "on"
    expect(
      decideFetch(new URL("https://api.smartrecruiters.com/v1/companies/acme/postings")).allow
    ).toBe(true)
    if (previous === undefined) delete process.env.SMARTRECRUITERS_POSTING_API
    else process.env.SMARTRECRUITERS_POSTING_API = previous
  })

  it("stops reading a site whose owner opted out, subdomains included", () => {
    const previous = process.env.CRAWLER_OPT_OUT_HOSTS
    process.env.CRAWLER_OPT_OUT_HOSTS = " acme.example , other.example"
    expect(decideFetch(new URL("https://acme.example/careers")).allow).toBe(false)
    expect(decideFetch(new URL("https://jobs.acme.example/1")).allow).toBe(false)
    expect(decideFetch(new URL("https://notacme.example/careers")).allow).toBe(true)
    if (previous === undefined) delete process.env.CRAWLER_OPT_OUT_HOSTS
    else process.env.CRAWLER_OPT_OUT_HOSTS = previous
  })

  it("lets a person have one offer read from any site, unless its owner opted out", () => {
    const board = new URL("https://justjoin.it/job-offer/acme-staff-engineer")
    expect(decideFetch(board).allow).toBe(false)
    expect(decideFetch(board, "person").allow).toBe(true)
    expect(decideFetch(new URL("https://www.linkedin.com/jobs/view/1"), "person").allow).toBe(true)
    expect(decideFetch(new URL("https://acme.icims.com/jobs/1/job"), "person").allow).toBe(true)
    const previous = process.env.CRAWLER_OPT_OUT_HOSTS
    process.env.CRAWLER_OPT_OUT_HOSTS = "justjoin.it"
    expect(decideFetch(board, "person").allow).toBe(false)
    if (previous === undefined) delete process.env.CRAWLER_OPT_OUT_HOSTS
    else process.env.CRAWLER_OPT_OUT_HOSTS = previous
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
    const sii = parseSitemap(
      `<sitemapindex><sitemap><loc><![CDATA[https://sii.pl/post-sitemap.xml]]></loc></sitemap><sitemap><loc><![CDATA[https://sii.pl/job-offer-sitemap.xml]]></loc><lastmod><![CDATA[2026-10-10T18:43:04+00:00]]></lastmod></sitemap></sitemapindex>`
    )
    expect(sii.children).toEqual([
      "https://sii.pl/post-sitemap.xml",
      "https://sii.pl/job-offer-sitemap.xml",
    ])
    expect(orderSitemapChildren(sii.children)[0]).toBe("https://sii.pl/job-offer-sitemap.xml")
  })

  it("obeys crawl-delay on the specific agent", () => {
    const rules = parseRobots("User-agent: JobscannerBot\nCrawl-delay: 5\nDisallow:\n")
    expect(rules.crawlDelaySec).toBe(5)
    const renamed = parseRobots("User-agent: NewRoleBot\nCrawl-delay: 7\nDisallow: /private\n")
    expect(renamed.crawlDelaySec).toBe(7)
    expect(renamed.disallow).toEqual(["/private"])
    const before = parseRobots("User-agent: NowaRolaBot\nDisallow: /old\n")
    expect(before.disallow).toEqual(["/old"])
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

  it("reads nested SuccessFactors description and layout spans", () => {
    const html = `
      <span itemprop="title">Principal Solution Architect</span>
      <span class="joblayouttoken-label">Working place: </span>
      <span data-careersite-propertyid="shifttype">Hybrid</span>
      <span class="joblayouttoken-label">Working Location: </span>
      <span data-careersite-propertyid="facility">Łódź, Warszawa</span>
      <span itemprop="description" class="rtltextaligneligible">
        <span class="jobdescription"><p><span><strong>Type of contract:</strong> Employment contract</span></p>
        <p><span><strong>Salary range: </strong>30000 - 46000 PLN gross</span></p>
        <p><span>As a Principal Solution Architect, you will advise stakeholders.</span></p></span>
      </span>
    `
    const job = parseSuccessFactorsJob(
      html,
      "https://jobs.gft.com/Poland/job/x/1/",
      "GFT",
      "jobs.gft.com"
    )
    expect(job?.salaryText).toContain("30000")
    expect(job?.salaryMin).toBe(30000)
    expect(job?.salaryMax).toBe(46000)
    expect(job?.salaryCurrency).toBe("PLN")
    expect(job?.employmentType).toMatch(/employment/i)
    expect(job?.workplaceType).toBe("HYBRID")
    expect(job?.locationText).toContain("Łódź")
    expect(job?.descriptionText).toContain("advise stakeholders")
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
    const elsewhere = buildListedJob({
      title: "Engineer",
      companyName: "GFT",
      locationText: "Berlin",
      employmentType: "B2B contract",
      originalUrl: "https://jobs.gft.com/a/3/",
      sourceType: "SUCCESSFACTORS",
    })
    expect(pairContractVariants([left!, elsewhere!])).toHaveLength(2)
    const b2bCities = buildListedJob({
      title: "Principal Solution Architect Consultant",
      companyName: "GFT Technologies SE",
      locationText: "Łódź, PL, 90-118 Warszawa, PL, 00-839",
      employmentType: "B2B",
      salaryText: "270 - 350 PLN/H",
      originalUrl: "https://jobs.gft.com/b/2/",
      sourceType: "SUCCESSFACTORS",
    })
    const employmentCities = buildListedJob({
      title: "Principal Solution Architect",
      companyName: "GFT Technologies SE",
      locationText: "Łódź, Warszawa, Poznań, Kraków, Wrocław",
      employmentType: "Employment contract",
      salaryText: "30000 - 46000 PLN gross",
      originalUrl: "https://jobs.gft.com/a/1/",
      sourceType: "SUCCESSFACTORS",
    })
    const overlapped = pairContractVariants([employmentCities!, b2bCities!])
    expect(overlapped).toHaveLength(1)
    expect(overlapped[0].salaryText).toContain("270 - 350")
    expect(overlapped[0].salaryText).toContain("30000")
    expect(
      stripPersonalData("Write to ada@gft.com or +48 600 100 200. Recruiter: Anna Nowak")
    ).not.toMatch(/ada@|600|Anna/)
    expect(stripPersonalData("Salary range: 30000 - 46000 PLN gross")).toContain("30000 - 46000")
    for (const pay of ["22 000 - 30 000 PLN", "100 000 - 150 000 PLN", "20.000 - 30.000 PLN"]) {
      expect(stripPersonalData(`Pensja: ${pay}`)).toBe(`Pensja: ${pay}`)
    }
    for (const phone of ["0048 600 100 200", "(0048) 600-100-200", "+48 600 100 200"]) {
      expect(stripPersonalData(`Tel. ${phone}`)).not.toMatch(/600/)
    }
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
