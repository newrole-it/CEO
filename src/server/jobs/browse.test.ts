import { describe, expect, it } from "vitest"
import {
  BROWSE_BATCH,
  BROWSE_PAGE,
  UNFILTERED_BATCHES,
  browseQuery,
  browseScanCap,
  resolveBrowse,
  scanUntilPage,
  titleMatchesPhrase,
} from "./browse"
import { monthlyBasePln, offerMatches, placeFacts } from "./offer-facts"

type Row = {
  id: string
  title: string
  lastSeenAt: Date
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
  locationText: string | null
  countryCode: string | null
  workplaceType: string | null
}

function row(index: number, partial: Partial<Row> = {}): Row {
  return {
    id: `job-${index}`,
    title: "Unpaid role",
    lastSeenAt: new Date(Date.UTC(2026, 9, 20) - index * 60_000),
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    locationText: "Remote",
    countryCode: null,
    workplaceType: "REMOTE",
    ...partial,
  }
}

/**
 * The newest rows in the index have no convertible pay. A real offer at
 * 22 500–34 500 PLN/month sits just past that first window.
 */
function indexWithLatePaidOffer(): Row[] {
  const rows = Array.from({ length: UNFILTERED_BATCHES * BROWSE_BATCH }, (_, index) => row(index))
  rows.push(
    row(rows.length, {
      id: "gft-lead-backend",
      title: "Lead Backend Engineer with AI/ML skills",
      salaryMin: 22_500,
      salaryMax: 34_500,
      salaryCurrency: "PLN",
      locationText: "Warszawa",
      countryCode: "PL",
      workplaceType: "HYBRID",
    })
  )
  return rows
}

function acceptsMinimum(item: Row, minimum: number): boolean {
  return offerMatches(
    placeFacts(item),
    monthlyBasePln(item),
    resolveBrowse({ pay: minimum })
  )
}

function load(rows: Row[]) {
  return async (cursor: { at: Date; id: string } | null) => {
    const start = cursor ? rows.findIndex((item) => item.id === cursor.id) + 1 : 0
    return rows.slice(start, start + BROWSE_BATCH)
  }
}

describe("salary floor walks past the newest window", () => {
  it("returns nothing when the scan stops after the first 480 rows", async () => {
    const rows = indexWithLatePaidOffer()
    const page = await scanUntilPage({
      maxBatches: UNFILTERED_BATCHES,
      batchSize: BROWSE_BATCH,
      pageSize: BROWSE_PAGE,
      start: null,
      load: load(rows),
      cursorOf: (item) => ({ at: item.lastSeenAt, id: item.id }),
      accept: (item) => acceptsMinimum(item, 30_000),
    })
    expect(page.kept).toHaveLength(0)
  })

  it("returns the 22500–34500 PLN offer once the salary floor keeps scanning", async () => {
    const rows = indexWithLatePaidOffer()
    const filters = resolveBrowse({ pay: "30000" })
    expect(browseScanCap(filters)).toBeGreaterThan(UNFILTERED_BATCHES)
    const page = await scanUntilPage({
      maxBatches: browseScanCap(filters),
      batchSize: BROWSE_BATCH,
      pageSize: BROWSE_PAGE,
      start: null,
      load: load(rows),
      cursorOf: (item) => ({ at: item.lastSeenAt, id: item.id }),
      accept: (item) => acceptsMinimum(item, 30_000),
    })
    expect(page.kept.map((item) => item.id)).toContain("gft-lead-backend")
    const pay = monthlyBasePln(page.kept[0])
    expect(pay).toMatchObject({ converted: true })
    if (pay.listed && pay.converted) expect(pay.max).toBeGreaterThanOrEqual(30_000)
  })
})

describe("browse query", () => {
  it("keeps a salary floor when the mode arrives in uppercase", () => {
    expect(resolveBrowse({ mode: "REMOTE", pay: "30000" })).toMatchObject({
      mode: "remote",
      minMonthlyPln: 30_000,
    })
    expect(resolveBrowse({ pay: "30k" }).minMonthlyPln).toBe(30_000)
    expect(resolveBrowse({ pay: "30 000" }).minMonthlyPln).toBe(30_000)
  })

  it("maps a typed place onto the same filters as the offer list", () => {
    expect(resolveBrowse({ location: "Warsaw" })).toMatchObject({ city: "Warszawa", location: "" })
    expect(resolveBrowse({ location: "Polska" }).where).toBe("pl")
    expect(resolveBrowse({ location: "zdalnie" }).mode).toBe("remote")
  })

  it("builds one jobs url for a phrase and a monthly minimum", () => {
    const href = browseQuery(resolveBrowse({ phrase: "Data Engineer", pay: 30_000, mode: "remote" }))
    expect(href).toBe("/jobs?q=Data+Engineer&mode=remote&pay=30000")
  })

  it("matches a role when every word is in the title", () => {
    expect(titleMatchesPhrase("Senior Data Engineer", "Senior Data Engineer", "data engineer")).toBe(
      true
    )
    expect(titleMatchesPhrase("Product Designer", "Product Designer", "data engineer")).toBe(false)
  })

  it("matches the employer name, alone or with a role", () => {
    const title = "Senior Backend Engineer"
    expect(titleMatchesPhrase(title, title, "docplanner", "Docplanner")).toBe(true)
    expect(titleMatchesPhrase(title, title, "Docplanner backend", "Docplanner")).toBe(true)
    expect(titleMatchesPhrase(title, title, "docplanner frontend", "Docplanner")).toBe(false)
    expect(titleMatchesPhrase(title, title, "docplanner", "Allegro")).toBe(false)
  })
})
