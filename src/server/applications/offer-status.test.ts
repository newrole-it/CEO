import { describe, expect, it } from "vitest"
import { matchOffer, offerFacts, postingKey, sameRole } from "./offer-status"

const LEVER = "https://jobs.lever.co/acme/5827a97c"

function row(fields: Partial<Parameters<typeof matchOffer>[0][number]> & { id: string }) {
  return {
    jobId: null,
    company: "Acme",
    title: "Senior Backend Engineer",
    url: null,
    appliedAt: new Date("2026-10-01T10:00:00Z"),
    ...fields,
  }
}

describe("postingKey", () => {
  it("treats every LinkedIn address of one offer as the same", () => {
    const keys = [
      "https://www.linkedin.com/jobs/view/3912345678/",
      "https://www.linkedin.com/jobs/view/senior-engineer-at-acme-corp-3912345678?refId=x",
      "https://pl.linkedin.com/jobs/view/senior-engineer-at-acme-corp-3912345678",
      "https://www.linkedin.com/jobs/search/?currentJobId=3912345678&geoId=9",
      "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=3912345678",
    ].map(postingKey)
    expect(new Set(keys)).toEqual(new Set(["linkedin:3912345678"]))
  })

  it("keeps two LinkedIn offers apart", () => {
    expect(postingKey("https://www.linkedin.com/jobs/view/111/")).not.toBe(
      postingKey("https://www.linkedin.com/jobs/view/222/")
    )
  })

  it("takes the application form and the posting for one offer elsewhere", () => {
    expect(postingKey(`${LEVER}/apply`)).toBe(postingKey(`${LEVER}?lever-source=li`))
    expect(postingKey("https://example.com/careers?gh_jid=1")).not.toBe(
      postingKey("https://example.com/careers?gh_jid=2")
    )
  })

  it("has no key for anything but http(s)", () => {
    expect(postingKey("not a url")).toBeNull()
    expect(postingKey("mailto:a@b.pl")).toBeNull()
  })
})

describe("sameRole", () => {
  it.each([
    ["Senior Backend Engineer", "Senior Backend Engineer"],
    ["Senior Backend Engineer", "senior  backend engineer (m/f/d)"],
    ["Senior Backend Engineer", "Backend Engineer"],
    ["Senior Backend Engineer", "Senior Backend Engineer - Warszawa"],
    ["Team Lead (Java)", "Java Team Lead"],
    ["Programista Java", "Programista Java (k/m) - zdalnie"],
    ["Sr. Data Engineer", "Senior Data Engineer"],
    [".NET Developer", "Senior .NET Developer"],
  ])("reads %j and %j as one role", (a, b) => {
    expect(sameRole(a, b)).toBe(true)
  })

  it.each([
    ["Senior Java Developer", "Junior Java Developer"],
    ["Backend Engineer", "Frontend Engineer"],
    ["Java Developer", "Python Developer"],
    ["Senior Software Engineer, Payments", "Senior Software Engineer, Search"],
    ["Developer", "Senior Java Developer"],
    ["", "Senior Java Developer"],
  ])("keeps %j and %j apart", (a, b) => {
    expect(sameRole(a, b)).toBe(false)
  })
})

describe("matchOffer", () => {
  it("finds the application by the address, whatever the page says", () => {
    const rows = [row({ id: "a", url: `${LEVER}/apply`, company: "Inna nazwa" })]
    const { applied } = matchOffer(rows, { url: LEVER, company: "Acme" })
    expect(applied).toMatchObject({ match: "url", row: { id: "a" } })
  })

  it("finds it through the indexed offer behind another address", () => {
    const rows = [row({ id: "a", jobId: "job_1", url: "https://acme.pl/kariera/1" })]
    const { applied } = matchOffer(rows, { url: LEVER, jobId: "job_1" })
    expect(applied).toMatchObject({ match: "url", row: { id: "a" } })
  })

  it("finds an offer seen on LinkedIn but sent through the company's ATS", () => {
    const rows = [row({ id: "a", url: LEVER, company: "Acme Polska Sp. z o.o." })]
    const { applied } = matchOffer(rows, {
      url: "https://www.linkedin.com/jobs/view/3912345678/",
      company: "Acme",
      title: "Senior Backend Engineer (m/f/d)",
    })
    expect(applied).toMatchObject({ match: "role", row: { id: "a" } })
  })

  it("does not call another role at the company this offer", () => {
    const rows = [row({ id: "a", title: "Frontend Engineer" })]
    const result = matchOffer(rows, {
      url: "https://justjoin.it/job-offer/acme-backend",
      company: "Acme",
      title: "Backend Engineer",
    })
    expect(result.applied).toBeNull()
    expect(result.sameCompany.map((item) => item.id)).toEqual(["a"])
  })

  it("lists the other applications at the company next to the match, newest first", () => {
    const rows = [
      row({ id: "old", title: "QA", appliedAt: new Date("2026-01-01T10:00:00Z") }),
      row({ id: "match", url: LEVER }),
      row({ id: "new", title: "SRE", appliedAt: new Date("2026-09-01T10:00:00Z") }),
      row({ id: "elsewhere", company: "Globex", title: "SRE" }),
    ]
    const result = matchOffer(rows, { url: LEVER, company: "Acme" })
    expect(result.applied?.row.id).toBe("match")
    expect(result.sameCompany.map((item) => item.id)).toEqual(["new", "old"])
  })

  it("shows the newest of several applications to one offer", () => {
    const rows = [
      row({ id: "first", url: LEVER, appliedAt: new Date("2026-01-01T10:00:00Z") }),
      row({ id: "again", url: LEVER, appliedAt: new Date("2026-09-01T10:00:00Z") }),
    ]
    expect(matchOffer(rows, { url: LEVER }).applied?.row.id).toBe("again")
  })

  it("stays silent with nothing to go on", () => {
    const rows = [row({ id: "a", url: LEVER })]
    expect(matchOffer(rows, { url: "https://example.com/about" })).toEqual({
      applied: null,
      sameCompany: [],
    })
    expect(matchOffer([], { url: LEVER, company: "Acme", title: "SRE" }).applied).toBeNull()
    // A legal form alone names no company.
    const blank = [row({ id: "b", company: "Sp. z o.o." })]
    expect(matchOffer(blank, { url: LEVER, company: "S.A." }).sameCompany).toEqual([])
  })
})

describe("offerFacts", () => {
  const indexed = { title: "QA Engineer", company: { name: "Indeks" } }

  it("trusts the page first, then the index", () => {
    expect(
      offerFacts({ url: LEVER, company: "Ze strony", title: "Rola ze strony" }, indexed)
    ).toEqual({ company: "Ze strony", title: "Rola ze strony" })
    expect(offerFacts({ url: "https://acme.pl/kariera/1" }, indexed)).toEqual({
      company: "Indeks",
      title: "QA Engineer",
    })
  })

  it("reads what a job board's address spells out", () => {
    expect(
      offerFacts(
        { url: "https://www.linkedin.com/jobs/view/senior-engineer-at-acme-corp-3912345678/" },
        null
      )
    ).toEqual({ company: "Acme Corp", title: "Senior Engineer" })
  })

  it("reads the company from an ATS address and the role from its window title", () => {
    expect(
      offerFacts(
        {
          url: "https://job-boards.greenhouse.io/acme/jobs/123",
          pageTitle: "Job Application for Staff Engineer at Acme",
        },
        null
      )
    ).toEqual({ company: "Acme", title: "Staff Engineer" })
  })

  it("guesses nothing about an unknown site", () => {
    expect(offerFacts({ url: "https://blog.example.com/posts/1" }, null)).toEqual({
      company: null,
      title: null,
    })
  })
})
