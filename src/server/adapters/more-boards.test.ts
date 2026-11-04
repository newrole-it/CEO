import { describe, expect, it } from "vitest"
import { decideFetch } from "@newrole/offers/source-policies"
import { detectBoard } from "src/server/discovery/boards"
import type { HttpClient } from "src/server/security/safe-fetch"
import { adapters } from "./registry"
import { HTML_VENDORS, parseHtmlListing } from "./html-boards"
import { listDvinci, listGem, parseEightfold, parseHomerunFeed } from "./json-boards"

function http(body: unknown, status = 200): HttpClient {
  const answer = async (url: string) => ({
    url,
    status,
    body: typeof body === "string" ? body : JSON.stringify(body),
    contentType: "application/json",
  })
  return { get: answer, post: answer }
}

describe("more ATS boards", () => {
  it("registers every enum value that has a list adapter once", () => {
    const types = adapters.map((item) => item.sourceType)
    expect(new Set(types).size).toBe(types.length)
    expect(types).toEqual(expect.arrayContaining(["EIGHTFOLD", "SOFTGARDEN", "FACTORIAL"]))
    expect(types).not.toEqual(expect.arrayContaining(["ICIMS"]))
  })

  it("parses an Eightfold list", () => {
    const [job] = parseEightfold(
      {
        data: {
          positions: [
            {
              id: "5",
              name: "Engineer",
              standardizedLocations: ["Łódź, Poland"],
              postedTs: "1773219384",
              workLocationOption: "onsite",
              positionUrl: "/careers/job/5",
            },
          ],
        },
      },
      "jobs.ericsson.com/ericsson.com"
    )
    expect(job?.originalUrl).toBe("https://jobs.ericsson.com/careers/job/5")
    expect(job?.workplaceType).toBe("ONSITE")
  })

  it("lists JSON boards and reports a missing one as unproven", async () => {
    const gem = await listGem(
      "gem",
      http([
        {
          id: 1,
          title: "SWE",
          absolute_url: "https://jobs.gem.com/gem/1",
          content: "<p>Body</p>",
          location: { name: "Warsaw" },
          location_type: "remote",
        },
      ]),
      "Gem"
    )
    expect(gem.jobs[0]).toMatchObject({ descriptionText: "Body", workplaceType: "REMOTE" })
    const missing = await listDvinci("nope", http("", 404))
    expect(missing.proven).toBe(false)
  })

  it("parses Homerun Atom and an HTML listing", () => {
    const jobs = parseHomerunFeed(
      `<feed><entry><id>1</id><title>Dev</title><link href="https://a.homerun.co/dev"/><content><![CDATA[<p>Hi</p>]]></content></entry></feed>`,
      "a"
    )
    expect(jobs[0]).toMatchObject({ title: "Dev", descriptionText: "Hi" })
    const rows = parseHtmlListing(
      `<a href="/apply/AbC123xyz/Senior-Dev">Senior Dev</a><a href="/apply/">All</a>`,
      "https://a.applytojob.com/apply/",
      HTML_VENDORS.JAZZHR
    )
    expect(rows).toEqual([
      {
        url: "https://a.applytojob.com/apply/AbC123xyz/Senior-Dev",
        id: "AbC123xyz",
        title: "Senior Dev",
      },
    ])
  })

  it("detects new hosts and keeps banned sources link-only", () => {
    expect(detectBoard("https://ats.rippling.com/acme/jobs")).toEqual({
      provider: "RIPPLING",
      boardId: "acme",
    })
    expect(detectBoard("https://acme.career.softgarden.de/jobs/1")).toEqual({
      provider: "SOFTGARDEN",
      boardId: "acme",
    })
    expect(decideFetch(new URL("https://join.com/api/public/jobs/1")).allow).toBe(false)
    expect(decideFetch(new URL("https://a.peopleforce.io/careers.json")).allow).toBe(false)
    expect(decideFetch(new URL("https://a.careers.hibob.com/api/job-ad")).allow).toBe(false)
    expect(decideFetch(new URL("https://x.fa.oraclecloud.com/hcmRestApi/x")).allow).toBe(false)
  })
})
