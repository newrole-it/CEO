import { describe, expect, it } from "vitest"
import { buildListedJob } from "@newrole/ats/adapters/parse"
import { jobProblems, PROVIDERS, summarize } from "./lab"

function job(fields: Partial<Parameters<typeof buildListedJob>[0]> = {}) {
  const listed = buildListedJob({
    title: "Senior Backend Developer",
    companyName: "Acme",
    locationText: "Warszawa",
    descriptionText: "Go, Kafka, Postgres.",
    originalUrl: "https://jobs.lever.co/acme/1",
    sourceType: "LEVER",
    sourceBoardId: "acme",
    needsHydration: false,
    ...fields,
  })
  if (!listed) throw new Error("fixture did not build")
  return listed
}

describe("the offer contract the lab checks", () => {
  it("passes a well-formed offer", () => {
    expect(jobProblems(job())).toEqual([])
  })

  it("names a link that does not parse", () => {
    expect(jobProblems({ ...job(), originalUrl: "not a link" })).toContain("url does not parse")
  })

  it("summarizes what the screens show", () => {
    expect(
      summarize(job({ salaryMin: 20000, salaryMax: 25000, salaryCurrency: "PLN" }))
    ).toMatchObject({
      title: "Senior Backend Developer",
      company: "Acme",
      location: "Warszawa",
      url: "https://jobs.lever.co/acme/1",
      descriptionChars: "Go, Kafka, Postgres.".length,
      salary: "20000–25000 PLN",
    })
  })

  it("offers every platform the registry reads", () => {
    expect(PROVIDERS).toEqual(expect.arrayContaining(["GREENHOUSE", "LEVER", "ASHBY", "WORKABLE"]))
  })
})
