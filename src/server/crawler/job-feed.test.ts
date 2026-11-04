import { gzipSync } from "zlib"
import { describe, expect, it } from "vitest"
import { feedUrlFromLlms, parseJobFeed } from "./job-feed"
import { extractListingLinks } from "./listing"
import { rememberCompanyPage } from "src/server/discovery/company-pages"
import { listCareerSite } from "src/server/adapters/career-site"
import { listSmartRecruiters } from "src/server/adapters/smartrecruiters"
import type { HttpClient } from "src/server/security/safe-fetch"
import { UnsafeUrlError } from "@newrole/offers/url-safety"

const FEED = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "DataFeed",
  name: "Active job ads",
  numberOfItems: 1,
  dataFeedElement: [
    {
      "@type": "DataFeedItem",
      item: {
        "@type": "JobPosting",
        title: "Data Analyst",
        url: "https://skk.erecruiter.pl/Offer.aspx?oid=9",
        datePosted: "2026-10-01",
        jobLocation: { address: { addressLocality: "Warsaw" } },
      },
    },
    {
      "@type": "DataFeedItem",
      item: {
        "@type": "JobPosting",
        title: "Feed itself",
        url: "https://www.pracujwgp.pl/jobs.feed.json",
      },
    },
  ],
})

function client(handler: (url: string, encoding?: string) => { status: number; body: string }): {
  http: HttpClient
  seen: string[]
} {
  const seen: string[] = []
  const http: HttpClient = {
    get: async (url, opts) => {
      seen.push(url)
      const result = handler(url, opts?.encoding)
      return { url, status: result.status, body: result.body, contentType: "text/plain" }
    },
    post: async () => {
      throw new Error("post is unused")
    },
  }
  return { http, seen }
}

describe("job feeds and listing-only pages", () => {
  it("reads a jobs.feed.json URL out of llms.txt", () => {
    expect(
      feedUrlFromLlms(
        "Job data is at https://www.pracujwgp.pl/jobs.feed.json.",
        "https://www.pracujwgp.pl/"
      )
    ).toBe("https://www.pracujwgp.pl/jobs.feed.json")
    expect(feedUrlFromLlms("See jobs.feed.json for openings.", "https://www.pracujwgp.pl/")).toBe(
      "https://www.pracujwgp.pl/jobs.feed.json"
    )
  })

  it("keeps feed items and drops the feed URL itself", () => {
    const jobs = parseJobFeed(FEED, {
      companyName: "Grupa Pracuj",
      boardId: "www.pracujwgp.pl",
      sourceType: "CAREER_SITE",
      feedUrl: "https://www.pracujwgp.pl/jobs.feed.json",
    })
    expect(jobs).toHaveLength(1)
    expect(jobs[0].title).toBe("Data Analyst")
    expect(jobs[0].originalUrl).toBe("https://skk.erecruiter.pl/Offer.aspx?oid=9")
    expect(jobs[0].needsHydration).toBe(false)
  })

  it("uses the published feed and does not request skk", async () => {
    const { http, seen } = client((url) => {
      if (url.endsWith("/robots.txt")) return { status: 200, body: "User-agent: *\nAllow: /\n" }
      if (url.endsWith("/llms.txt"))
        return { status: 200, body: "Feed: https://www.pracujwgp.pl/jobs.feed.json" }
      if (url.endsWith("/jobs.feed.json")) return { status: 200, body: FEED }
      return { status: 404, body: "" }
    })
    const listed = await listCareerSite("www.pracujwgp.pl", http)
    expect(listed.jobs).toHaveLength(1)
    expect(listed.jobs[0].originalUrl).toContain("skk.erecruiter.pl")
    expect(seen.some((url) => url.includes("skk.erecruiter.pl"))).toBe(false)
    expect(listed.note).toMatch(/not fetched/i)
  })

  it("stores listing titles and leaves detail hosts untouched", async () => {
    const html = `
      <a href="https://skk.erecruiter.pl/Offer.aspx?oid=3">Backend Engineer</a>
      <a href="/privacy">Privacy</a>
      <a href="https://packhelp.peopleforce.io/careers/v/1-role">Product Designer</a>
    `
    expect(extractListingLinks(html, "https://kariera.wp.pl/oferty-pracy")).toHaveLength(2)
    const { http, seen } = client((url) => {
      if (url.endsWith("/robots.txt")) return { status: 404, body: "" }
      if (url.includes("/oferty-pracy")) return { status: 200, body: html }
      return { status: 500, body: "should not fetch" }
    })
    const listed = await listCareerSite("kariera.wp.pl", http, "Wirtualna Polska")
    expect(listed.jobs.map((job) => job.title).sort()).toEqual([
      "Backend Engineer",
      "Product Designer",
    ])
    expect(seen.some((url) => url.includes("erecruiter") || url.includes("peopleforce"))).toBe(
      false
    )
  })

  it("does not treat an EPAM sitemap count as the live total", async () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://careers.epam.com/en/vacancy/warsaw-engineer_en</loc></url>
      <url><loc>https://careers.epam.com/en/vacancy/austin-engineer_en</loc></url>
    </urlset>`
    const gzip = gzipSync(Buffer.from(xml)).toString("base64")
    const page = `<html><head><script type="application/ld+json">
      {"@type":"JobPosting","title":"Engineer","url":"https://careers.epam.com/en/vacancy/warsaw-engineer_en","jobLocation":{"address":{"addressLocality":"Warsaw"}}}
    </script></head></html>`
    const { http } = client((url, encoding) => {
      if (url.endsWith("/robots.txt"))
        return {
          status: 200,
          body: "User-agent: *\nAllow: /\nSitemap: https://careers.epam.com/sitemap.xml.gz\n",
        }
      if (url.endsWith("/llms.txt") || url.endsWith("/jobs.feed.json"))
        return { status: 404, body: "" }
      if (url.endsWith(".xml.gz")) {
        expect(encoding).toBe("base64")
        return { status: 200, body: gzip }
      }
      if (url.includes("/vacancy/")) return { status: 200, body: page }
      return { status: 404, body: "" }
    })
    const listed = await listCareerSite("careers.epam.com", http)
    expect(listed.note).toMatch(/225/)
    expect(listed.note).toMatch(/not the live total/)
    expect(listed.note).not.toMatch(/4,?298/)
    expect(listed.jobs[0]?.title).toBe("Engineer")
    expect(listed.jobs[0]?.originalUrl).toContain("warsaw")
  })

  it("leaves Synerise to search when the listing API is disallowed", async () => {
    const { http, seen } = client((url) => {
      if (url.endsWith("/robots.txt"))
        return { status: 200, body: "User-agent: *\nDisallow: /api/\n" }
      if (url.endsWith("/careers"))
        return { status: 200, body: "<html><title>Careers</title></html>" }
      return { status: 500, body: "unexpected" }
    })
    const listed = await listCareerSite("www.synerise.com", http)
    expect(listed.jobs).toHaveLength(0)
    expect(listed.proven).toBe(true)
    expect(listed.note).toMatch(/disallowed/i)
    expect(seen.some((url) => url.includes("/api/"))).toBe(false)
  })

  it("keeps Synerise job pages from search and skips link-only hosts", () => {
    const pages: string[] = []
    rememberCompanyPage(pages, "https://www.synerise.com/api/cms/job-postings")
    rememberCompanyPage(pages, "https://revolut.com/careers/position/abc")
    rememberCompanyPage(pages, "https://www.synerise.com/careers")
    rememberCompanyPage(pages, "https://www.synerise.com/careers/data-engineer")
    rememberCompanyPage(pages, "https://example.com/about")
    rememberCompanyPage(pages, "https://example.com/jobs/1")
    rememberCompanyPage(pages, "https://example.com/jobs/2")
    expect(pages).toEqual([
      "https://www.synerise.com/careers/data-engineer",
      "https://example.com/about",
      "https://example.com/jobs/1",
    ])
  })

  it("reads an engineering-manager page before the rest of a large sitemap", async () => {
    const previous = process.env.CAREER_DETAIL_LIMIT
    process.env.CAREER_DETAIL_LIMIT = "1"
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://jobs.gft.com/Poland/job/Lodz-Java-Developer/1/</loc></url>
      <url><loc>https://jobs.gft.com/job/Valencia-Engineering-Manager/2/</loc></url>
    </urlset>`
    const { http, seen } = client((url) => {
      if (url.endsWith("/robots.txt")) return { status: 200, body: "User-agent: *\nAllow: /\n" }
      if (url.endsWith("/sitemap.xml")) return { status: 200, body: xml }
      if (url.includes("Engineering-Manager"))
        return {
          status: 200,
          body: '<html><span itemprop="title">Engineering Manager</span></html>',
        }
      return { status: 500, body: "later page" }
    })
    const listed = await listCareerSite("jobs.gft.com", http, "GFT")
    expect(listed.jobs.map((job) => job.title)).toEqual(["Engineering Manager"])
    expect(seen.some((url) => url.includes("Java-Developer"))).toBe(false)
    if (previous === undefined) delete process.env.CAREER_DETAIL_LIMIT
    else process.env.CAREER_DETAIL_LIMIT = previous
  })

  it("keeps Sii job URLs when a later sitemap is outside the allow-list", async () => {
    const index = `<?xml version="1.0"?><sitemapindex>
      <sitemap><loc><![CDATA[https://sii.pl/blog-sitemap.xml]]></loc></sitemap>
      <sitemap><loc><![CDATA[https://sii.pl/job-offer-sitemap.xml]]></loc></sitemap>
    </sitemapindex>`
    const jobs = `<?xml version="1.0"?><urlset>
      <url><loc>https://sii.pl/oferty-pracy/id/30518/business-analyst-f-m-x/</loc></url>
      <url><loc>https://sii.pl/en/job-ads/id/30518/business-analyst/</loc></url>
    </urlset>`
    const page = `<html><head><script type="application/ld+json">
      {"@type":"JobPosting","title":"Business Analyst","url":"https://sii.pl/oferty-pracy/id/30518/business-analyst-f-m-x/","jobLocation":{"address":{"addressLocality":"Warsaw"}}}
    </script></head></html>`
    const { http, seen } = client((url) => {
      if (url.endsWith("/robots.txt"))
        return {
          status: 200,
          body: "User-agent: *\nAllow: /\nSitemap: https://sii.pl/sitemap.xml\n",
        }
      if (url.endsWith("/llms.txt") || url.endsWith("/jobs.feed.json"))
        return { status: 404, body: "" }
      if (url.endsWith("/sitemap.xml")) return { status: 200, body: index }
      if (url.endsWith("/job-offer-sitemap.xml")) return { status: 200, body: jobs }
      if (url.endsWith("/blog-sitemap.xml")) {
        throw new UnsafeUrlError("Source policy is limited for Career site: blog sitemap")
      }
      if (url.includes("/oferty-pracy/id/")) return { status: 200, body: page }
      return { status: 404, body: "" }
    })
    const listed = await listCareerSite("sii.pl", http, "Sii Polska", {
      detailBudget: 5,
      knownUrls: new Set(),
    })
    expect(listed.proven).toBe(true)
    expect(listed.listedCount).toBe(1)
    expect(listed.jobs.map((job) => job.title)).toEqual(["Business Analyst"])
    expect(listed.complete).toBe(true)
    expect(seen.some((url) => url.includes("blog-sitemap"))).toBe(true)
    expect(seen.some((url) => url.includes("/en/job-ads/"))).toBe(false)
  })

  it("stops SmartRecruiters when the posting API switch is off", async () => {
    const previous = process.env.SMARTRECRUITERS_POSTING_API
    process.env.SMARTRECRUITERS_POSTING_API = "off"
    const listed = await listSmartRecruiters("acme", {
      get: async () => {
        throw new Error("posting API was called")
      },
      post: async () => {
        throw new Error("post is unused")
      },
    })
    expect(listed.jobs).toEqual([])
    expect(listed.note).toMatch(/SMARTRECRUITERS_POSTING_API/)
    if (previous === undefined) delete process.env.SMARTRECRUITERS_POSTING_API
    else process.env.SMARTRECRUITERS_POSTING_API = previous
  })
})
