import { describe, expect, it } from "vitest"
import { emptyRobots, parseRobots } from "src/server/crawler/robots"
import { resolveJobCountries } from "src/server/geo/countries"
import type { HttpClient } from "src/server/security/safe-fetch"
import {
  cleanOrganisation,
  externalIdFromPath,
  hasMorePlaces,
  listWorkdayCxs,
  postedFromText,
  splitFacet,
  type CxsFacet,
} from "./workday-cxs"

const target = {
  tenant: "acme",
  cluster: "5",
  site: "Careers",
  host: "acme.wd5.myworkdayjobs.com",
  boardId: "acme/wd5/Careers",
  companyName: "Acme",
}

type Posting = { title: string; externalPath: string; locationsText: string; postedOn: string }

/** A fake tenant: postings, each in one or more countries, served the way the search serves them. */
function tenant(
  postings: Array<Posting & { countries: string[] }>,
  cap = 2000
): HttpClient & { calls: number } {
  const countryIds = [...new Set(postings.flatMap((posting) => posting.countries))]
  const client = {
    calls: 0,
    async get() {
      client.calls += 1
      return {
        url: "",
        status: 200,
        body: JSON.stringify({
          hiringOrganization: { name: "100 Acme Polska Sp. z o.o." },
          jobPostingInfo: {
            location: "Krakow, Poland",
            additionalLocations: ["Bucharest, Romania"],
            country: { descriptor: "Poland", alpha2Code: "PL" },
          },
        }),
        contentType: "application/json",
      }
    },
    async post(_url: string, body: string) {
      client.calls += 1
      const request = JSON.parse(body) as {
        offset: number
        limit: number
        appliedFacets: Record<string, string[]>
      }
      const country = request.appliedFacets.locationCountry?.[0]
      const slice = country ? postings.filter((p) => p.countries.includes(country)) : postings
      // Past the cap the real search returns the first page again.
      const offset = request.offset >= cap ? 0 : request.offset
      const facets: CxsFacet[] = [
        {
          facetParameter: "locationMainGroup",
          values: [
            {
              facetParameter: "locationCountry",
              values: countryIds.map((id) => ({
                id,
                descriptor: id,
                count: slice.filter((p) => p.countries.includes(id)).length,
              })),
            },
          ],
        },
        {
          facetParameter: "timeType",
          values: [{ id: "full", descriptor: "Full time", count: slice.length }],
        },
      ]
      return {
        url: "",
        status: 200,
        body: JSON.stringify({
          total: offset === 0 ? Math.min(slice.length, cap) : 0,
          jobPostings: slice.slice(offset, offset + request.limit),
          facets: offset === 0 ? facets : [],
        }),
        contentType: "application/json",
      }
    },
  }
  return client as unknown as HttpClient & { calls: number }
}

function postings(count: number, countries: (index: number) => string[]) {
  return Array.from({ length: count }, (_, index) => ({
    title: `Engineer ${index}`,
    externalPath: `/job/City/Engineer-${index}_R${index}`,
    locationsText: index % 7 === 0 ? "2 Locations" : "Krakow, Poland",
    postedOn: "Posted Today",
    countries: countries(index),
  }))
}

describe("Workday search helpers", () => {
  it("reads the posting date, the requisition id and the organisation name", () => {
    const now = new Date("2026-11-03T10:00:00Z")
    expect(postedFromText("Posted Today", now)?.toISOString()).toBe(now.toISOString())
    expect(postedFromText("Posted 5 Days Ago", now)?.toISOString()).toBe("2026-10-29T10:00:00.000Z")
    expect(postedFromText("Posted 30+ Days Ago", now)).toBeUndefined()
    expect(externalIdFromPath("/job/Krakow-Poland/Business-System-Analyst_R69607-1")).toBe(
      "R69607-1"
    )
    expect(cleanOrganisation("930000 Motorola Solutions Norway AS")).toBe(
      "Motorola Solutions Norway AS"
    )
    expect(cleanOrganisation("12345")).toBeUndefined()
    expect(hasMorePlaces("Edinburgh, UK (ZUK129), More...")).toBe(true)
    expect(hasMorePlaces("2 Locations")).toBe(true)
    expect(hasMorePlaces("Krakow, Poland")).toBe(false)
  })

  it("splits by country first and skips a facet that covers too little", () => {
    const facets: CxsFacet[] = [
      {
        facetParameter: "locationMainGroup",
        values: [
          {
            facetParameter: "locationCountry",
            values: [
              { id: "pl", descriptor: "Poland", count: 1500 },
              { id: "in", descriptor: "India", count: 2400 },
            ],
          },
        ],
      },
    ]
    expect(splitFacet(facets, 4000, [])?.parameter).toBe("locationCountry")
    expect(splitFacet(facets, 9000, [])).toBeNull()
    expect(splitFacet(facets, 4000, ["locationCountry"])).toBeNull()
  })
})

describe("Workday search inventory", () => {
  const robots = parseRobots("User-agent: *\nAllow: /Careers/\nDisallow: /refreshFacet/\n")

  it("reads a small tenant page by page and places multi-location postings by country slice", async () => {
    const http = tenant(
      postings(45, (index) => (index % 7 === 0 ? ["Poland", "Romania"] : ["Poland"]))
    )
    const listed = await listWorkdayCxs(target, http, robots, new Date("2026-11-03T10:00:00Z"))
    expect(listed?.jobs).toHaveLength(45)
    expect(listed?.complete).toBe(true)
    expect(listed?.publishedName).toBe("Acme Polska Sp. z o.o.")
    const multi = listed!.jobs.find((job) => job.locationText === "2 Locations")
    expect(
      resolveJobCountries({
        locationText: multi?.locationText,
        structured: multi?.countryCodes,
      }).countries.sort()
    ).toEqual(["PL", "RO"])
  })

  it("reads a few multi-location postings' own pages instead of every country slice", async () => {
    const http = tenant(
      postings(100, () => ["Poland"]).map((posting, index) => ({
        ...posting,
        locationsText: index === 3 ? "2 Locations" : "Krakow, Poland",
      }))
    )
    const listed = await listWorkdayCxs(target, http, robots)
    const multi = listed!.jobs.find((job) => job.externalId === "R3")
    expect(multi?.locationText).toBe("Krakow, Poland | Bucharest, Romania")
    expect(
      resolveJobCountries({
        locationText: multi?.locationText,
        structured: multi?.countryCodes,
      }).countries.sort()
    ).toEqual(["PL", "RO"])
  })

  it("splits a tenant over the 2,000 cap by country and reads every posting", async () => {
    const http = tenant(postings(3000, (index) => [index < 1800 ? "Poland" : "Germany"]))
    const listed = await listWorkdayCxs(target, http, robots)
    expect(new Set(listed?.jobs.map((job) => job.externalId)).size).toBe(3000)
    expect(listed?.complete).toBe(true)
    expect(listed?.listedCount).toBe(3000)
  })

  it("does not search where robots.txt disallows it", async () => {
    const http = tenant(postings(3, () => ["Poland"]))
    const blocked = parseRobots("User-agent: *\nDisallow: /\n")
    expect(await listWorkdayCxs(target, http, blocked)).toBeNull()
    expect(http.calls).toBe(0)
    expect(await listWorkdayCxs(target, http, emptyRobots())).not.toBeNull()
  })
})
