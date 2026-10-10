import { describe, expect, it } from "vitest"
import { parseGreenhouseJobs } from "./greenhouse"
import { parseSmartRecruiters } from "./smartrecruiters"
import { parseWorkableJobs } from "./workable"
import { parseAshbyJobs } from "./ashby"
import { isBlockedSlug, namesAgree } from "./blocked"
import { parseBreezyPositions } from "./breezy"
import { leverPostingUrls } from "./lever"
import { parsePersonioXml } from "./personio"
import { pinpointAcceptsBoard } from "./pinpoint"
import { listRecruitee, parseRecruiteeOffers, recruiteeAuthBlock } from "./recruitee"
import { parseTeamtailorRss } from "./teamtailor"
import { parseTraffitPosts } from "./traffit"
import { PLANNED_ATS, UNDOCUMENTED_ATS } from "./types"

describe("ATS adapters", () => {
  it("reads a Greenhouse list without requiring the description", () => {
    const jobs = parseGreenhouseJobs(
      {
        jobs: [
          {
            id: 42,
            title: "Head of Engineering",
            absolute_url: "https://job-boards.greenhouse.io/acme/jobs/42",
            location: { name: "Warsaw, Poland" },
            company_name: "Acme",
            first_published: "2026-10-01T00:00:00.000Z",
          },
        ],
      },
      "acme"
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
            compensation: { scrapeableCompensationSalarySummary: "20000-28000 PLN / month" },
          },
        ],
      },
      "acme",
      "Acme"
    )
    expect(jobs[0].workplaceType).toBe("HYBRID")
    expect(jobs[0].salaryText).toContain("PLN")
  })

  it("treats an empty Workable account as having no jobs", () => {
    expect(parseWorkableJobs({ name: "Workable", jobs: [] }, "madeup").jobs).toEqual([])
  })

  it("treats a SmartRecruiters zero page as an empty list", () => {
    expect(parseSmartRecruiters({ totalFound: 0, content: [] }, "madeup")).toEqual([])
  })

  it("keeps the known wrong-company slugs blocked and leaves room for the next ATS", () => {
    expect(isBlockedSlug("GREENHOUSE", "wise")).toBe(true)
    expect(isBlockedSlug("ASHBY", "ramp")).toBe(true)
    expect(isBlockedSlug("WORKABLE", "1password")).toBe(true)
    expect(isBlockedSlug("LEVER", "neon")).toBe(true)
    expect(namesAgree("CD PROJEKT RED", "CDPROJEKTRED")).toBe(true)
    expect(namesAgree("GitLab", "Wise Worksite")).toBe(false)
    expect(PLANNED_ATS.map((item) => item.id)).toEqual(["greenhouse-eu"])
    expect(PLANNED_ATS.every((item) => item.status === "unverified")).toBe(true)
    expect(UNDOCUMENTED_ATS.map((item) => item.id)).toEqual(["breezy", "bamboohr"])
  })

  it("reads Teamtailor RSS, including escaped HTML and remote status", () => {
    const parsed = parseTeamtailorRss(
      `<?xml version="1.0"?><rss><channel><title>Silent Eight</title><item>
        <title>Engineering Manager</title>
        <link>https://silenteight.teamtailor.com/jobs/77-engineering-manager</link>
        <pubDate>Fri, 10 Oct 2026 12:00:00 GMT</pubDate>
        <description>&lt;h4&gt;Lead the team&lt;/h4&gt;</description>
        <tt:remoteStatus>fully</tt:remoteStatus>
        <tt:locations><tt:location><tt:city>Warsaw</tt:city><tt:country>Poland</tt:country></tt:location></tt:locations>
      </item></channel></rss>`,
      "silenteight",
      "Silent Eight"
    )
    expect(parsed.channelTitle).toBe("Silent Eight")
    expect(parsed.jobs).toHaveLength(1)
    expect(parsed.jobs[0].workplaceType).toBe("REMOTE")
    expect(parsed.jobs[0].locationText).toContain("Warsaw")
    expect(parsed.jobs[0].descriptionText).toContain("Lead the team")
    expect(parsed.jobs[0].descriptionText).not.toContain("<h4>")
    expect(parsed.jobs[0].externalId).toBe("77")
  })

  it("fails Recruitee closed after the token deadline and still parses offers before it", () => {
    expect(recruiteeAuthBlock(new Date("2026-10-10T00:00:00.000Z"), "")).toBeNull()
    expect(recruiteeAuthBlock(new Date("2027-02-10T00:00:00.000Z"), "")).toMatch(/token/i)
    expect(recruiteeAuthBlock(new Date("2027-03-01T00:00:00.000Z"), "employer-token")).toBeNull()
    const jobs = parseRecruiteeOffers(
      {
        offers: [
          {
            id: 9,
            title: "Head of Engineering",
            city: "Warsaw",
            country: "Poland",
            hybrid: true,
            published_at: "2026-09-17 10:54:28 UTC",
            careers_url: "https://huuuge.recruitee.com/o/head-of-engineering",
            company_name: "Huuuge Games",
            description: "<p>Build the org</p>",
            salary: { min: 40000, max: 50000, currency: "PLN", period: "month" },
          },
        ],
      },
      "huuuge"
    )
    expect(jobs[0].companyName).toBe("Huuuge Games")
    expect(jobs[0].workplaceType).toBe("HYBRID")
    expect(jobs[0].publishedAt?.toISOString()).toBe("2026-09-17T10:54:28.000Z")
    expect(jobs[0].salaryText).toContain("PLN")
  })

  it("does not throw when Recruitee is closed or returns 401", async () => {
    let calls = 0
    const http = {
      async get() {
        calls += 1
        return {
          url: "https://huuuge.recruitee.com/api/offers/",
          status: 401,
          body: "{}",
          contentType: "application/json",
        }
      },
      async post() {
        throw new Error("post is unused")
      },
    }
    const closed = await listRecruitee(
      "huuuge",
      http,
      "Huuuge Games",
      new Date("2027-02-11T00:00:00.000Z")
    )
    expect(closed.proven).toBe(false)
    expect(closed.jobs).toEqual([])
    expect(calls).toBe(0)
    const unauthorized = await listRecruitee(
      "huuuge",
      http,
      "Huuuge Games",
      new Date("2026-10-10T00:00:00.000Z")
    )
    expect(unauthorized.proven).toBe(false)
    expect(unauthorized.note).toMatch(/401/)
    expect(calls).toBe(1)
  })

  it("reads a Personio position and a Traffit advert, skipping awarded posts", () => {
    const personio = parsePersonioXml(
      `<workzag-jobs><position><id>15</id><office>Poland (remote)</office><name>Engineering Manager</name>
        <jobDescriptions><jobDescription><name>Description</name><value><![CDATA[<p>Own delivery</p>]]></value></jobDescription></jobDescriptions>
      </position></workzag-jobs>`,
      "vodeno",
      "https://vodeno.jobs.personio.de/xml?language=en",
      "Vodeno"
    )
    expect(personio[0].originalUrl).toBe("https://vodeno.jobs.personio.de/job/15")
    expect(personio[0].workplaceType).toBe("REMOTE")
    expect(personio[0].descriptionText).toContain("Own delivery")
    const traffit = parseTraffitPosts(
      [
        {
          id: 7,
          url: "https://stxnext.traffit.com/career/7",
          awarded: false,
          valid_start: "2026-10-05 14:32:37",
          advert: {
            name: "Delivery Manager",
            locations: [{ locality: "Poznań", country: "Poland" }],
            values: [{ field_id: "description", value: "<p>Lead delivery</p>" }],
          },
        },
        {
          id: 8,
          url: "https://stxnext.traffit.com/career/8",
          awarded: true,
          advert: { name: "Awarded role" },
        },
      ],
      "stxnext",
      "STX Next"
    )
    expect(traffit).toHaveLength(1)
    expect(traffit[0].title).toBe("Delivery Manager")
    expect(traffit[0].locationText).toContain("Poznań")
    expect(traffit[0].publishedAt?.toISOString()).toBe("2026-10-05T14:32:37.000Z")
  })

  it("rejects a Pinpoint demo board unless the company name is actually in the feed", () => {
    const demo = pinpointAcceptsBoard({
      boardId: "callstack",
      divisionName: "ACME",
      titles: ["Head of DEI - UK"],
      texts: ["London demo posting"],
    })
    expect(demo.ok).toBe(false)
    const named = pinpointAcceptsBoard({
      expectedName: "Northwind Labs",
      boardId: "northwind",
      divisionName: "ACME",
      titles: ["Head of DEI - UK"],
      texts: ["Northwind Labs is hiring a leader"],
    })
    expect(named.ok).toBe(true)
    const division = pinpointAcceptsBoard({
      boardId: "acme-guess",
      divisionName: "Northwind",
      titles: ["Engineering Manager"],
      texts: [],
    })
    expect(division).toMatchObject({ ok: true, companyName: "Northwind" })
  })

  it("reads a Breezy position when country is an object", () => {
    const parsed = parseBreezyPositions(
      [
        {
          id: "abc",
          name: "Delivery Lead | Engineering Manager",
          url: "https://boldare.breezy.hr/p/abc-delivery-lead",
          published_date: "2026-09-22T06:23:23.339Z",
          type: { id: "fullTime", name: "Full-Time" },
          location: { city: "Gliwice", country: { name: "Poland", id: "PL" }, is_remote: false },
          company: { name: "Boldare" },
          salary: "",
        },
      ],
      "boldare",
      "Boldare"
    )
    expect(parsed.jobs).toHaveLength(1)
    expect(parsed.jobs[0]?.locationText).toContain("Gliwice")
    expect(parsed.jobs[0]?.locationText).toContain("Poland")
    expect(parsed.jobs[0]?.companyName).toBe("Boldare")
  })

  it("tries the Lever EU host first only for eu: boards", () => {
    expect(leverPostingUrls("eu:xtb")[0]).toContain("https://api.eu.lever.co/v0/postings/xtb")
    expect(leverPostingUrls("gitlab")[0]).toContain("https://api.lever.co/v0/postings/gitlab")
    expect(leverPostingUrls("gitlab")[1]).toContain("https://api.eu.lever.co/")
  })
})
