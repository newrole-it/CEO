import { describe, expect, it } from "vitest"
import {
  ApplicationError,
  applicationAnswers,
  coalesceEdit,
  compareApplications,
  computeStats,
  formatSalary,
  isUntouched,
  matchesQuery,
  mergeFormAnswers,
  nextClosedAtStage,
  parseFormAnswers,
  planUpdate,
  rankByName,
  statedSalaryFrom,
  urlKey,
  type CurrentApplication,
} from "./logic"

describe("urlKey", () => {
  it("matches the two backfilled rows", () => {
    expect(urlKey("https://jobs.eu.lever.co/olx/5827a97c-156c-4af5-ade6-0a22c45c72da")).toBe(
      "jobs.eu.lever.co/olx/5827a97c-156c-4af5-ade6-0a22c45c72da"
    )
    expect(urlKey("https://jobs.ashbyhq.com/docplanner/6be4bed3-22e6-4b4e-b13c-188563097a12")).toBe(
      "jobs.ashbyhq.com/docplanner/6be4bed3-22e6-4b4e-b13c-188563097a12"
    )
  })

  it("keeps LinkedIn search links to different jobs apart", () => {
    expect(urlKey("https://www.linkedin.com/jobs/search/?currentJobId=111&geoId=9")).toBe(
      "linkedin.com/jobs/search?currentjobid=111"
    )
    expect(urlKey("https://www.linkedin.com/jobs/search/?currentJobId=222&geoId=9")).toBe(
      "linkedin.com/jobs/search?currentjobid=222"
    )
  })

  it("drops www, tracking parameters, hash and trailing slashes and lowercases", () => {
    expect(urlKey("https://WWW.Example.com/Careers/Job-1/?utm_source=x#apply")).toBe(
      "example.com/careers/job-1"
    )
    expect(urlKey("http://example.com//")).toBe("example.com")
    expect(urlKey("  https://boards.greenhouse.io/acme/jobs/123///  ")).toBe(
      "boards.greenhouse.io/acme/jobs/123"
    )
  })

  it("keeps the parameters that name the posting, so two jobs on one page stay separate", () => {
    expect(urlKey("https://example.com/careers?gh_jid=123")).toBe("example.com/careers?gh_jid=123")
    expect(urlKey("https://example.com/careers?gh_jid=123")).not.toBe(
      urlKey("https://example.com/careers?gh_jid=456")
    )
    expect(urlKey("https://example.com/careers?utm_source=li&gh_jid=123&ref=x")).toBe(
      "example.com/careers?gh_jid=123"
    )
    expect(urlKey("https://example.com/job?reqId=7&jobId=AB")).toBe(
      "example.com/job?jobid=ab&reqid=7"
    )
    expect(urlKey("https://example.com/careers?gh_jid=")).toBe("example.com/careers")
  })

  it("keeps the port and the rest of the host", () => {
    expect(urlKey("https://www2.example.com:8443/a")).toBe("www2.example.com:8443/a")
  })

  it("returns null for non-http or unparsable input", () => {
    expect(urlKey("mailto:hr@example.com")).toBeNull()
    expect(urlKey("javascript:alert(1)")).toBeNull()
    expect(urlKey("ftp://example.com/x")).toBeNull()
    expect(urlKey("not a url")).toBeNull()
    expect(urlKey("")).toBeNull()
  })
})

const base: CurrentApplication = {
  status: "APPLIED",
  stageNote: null,
  closedAtStage: null,
  nextStep: null,
  nextStepAt: null,
  contact: null,
  notes: null,
  company: "Allegro",
  title: "Engineering Manager",
  url: null,
  location: null,
  salaryText: null,
  statedSalary: null,
  appliedAt: new Date("2026-10-01T10:00:00Z"),
  cvDocumentId: null,
}
const now = new Date("2026-10-29T12:00:00Z")

describe("status transitions", () => {
  it("records the stage an application closed at", () => {
    expect(nextClosedAtStage("INTERVIEW", null, "REJECTED")).toBe("INTERVIEW")
    expect(nextClosedAtStage("APPLIED", null, "WITHDRAWN")).toBe("APPLIED")
    expect(nextClosedAtStage("REJECTED", "TASK", "WITHDRAWN")).toBe("TASK")
    expect(nextClosedAtStage("REJECTED", "TASK", "SCREENING")).toBeNull()
    expect(nextClosedAtStage("FINAL", null, "GHOSTED")).toBe("FINAL")
    expect(nextClosedAtStage("GHOSTED", "FINAL", "REJECTED")).toBe("FINAL")
  })

  it("writes a status event with the stage label and sets statusChangedAt", () => {
    const plan = planUpdate(
      { ...base, status: "SCREENING", stageNote: "HR" },
      { status: "INTERVIEW", stageNote: "2. rozmowa techniczna" },
      now
    )
    expect(plan.data).toMatchObject({
      status: "INTERVIEW",
      stageNote: "2. rozmowa techniczna",
      statusChangedAt: now,
    })
    expect(plan.data).not.toHaveProperty("closedAtStage")
    expect(plan.events).toEqual([
      {
        type: "status",
        fromStatus: "SCREENING",
        toStatus: "INTERVIEW",
        note: "2. rozmowa techniczna",
      },
    ])
  })

  it("clears the old stage label when the status moves on without a new one", () => {
    const plan = planUpdate(
      { ...base, status: "INTERVIEW", stageNote: "z CTO" },
      { status: "OFFER" },
      now
    )
    expect(plan.data.stageNote).toBeNull()
    expect(plan.events[0]).toMatchObject({ type: "status", note: null })
  })

  it("sets closedAtStage on rejection and clears it when reopened", () => {
    const rejected = planUpdate({ ...base, status: "TASK" }, { status: "REJECTED" }, now)
    expect(rejected.data.closedAtStage).toBe("TASK")
    const reopened = planUpdate(
      { ...base, status: "REJECTED", closedAtStage: "TASK" },
      { status: "INTERVIEW" },
      now
    )
    expect(reopened.data.closedAtStage).toBeNull()
    const withdrawn = planUpdate(
      { ...base, status: "REJECTED", closedAtStage: "TASK" },
      { status: "WITHDRAWN" },
      now
    )
    expect(withdrawn.data).not.toHaveProperty("closedAtStage")
  })

  it("does nothing for the same status and the same values", () => {
    const plan = planUpdate(base, { status: "APPLIED", company: " Allegro ", notes: null }, now)
    expect(plan.events).toEqual([])
    expect(plan.data).toEqual({})
  })

  it("writes next-step and one edit event for other fields", () => {
    const at = new Date("2026-11-03T09:00:00Z")
    const plan = planUpdate(
      base,
      {
        nextStep: "Rozmowa z CTO",
        nextStepAt: at,
        contact: "anna@allegro.pl",
        notes: "fajny zespół",
      },
      now
    )
    expect(plan.events).toEqual([
      { type: "next-step", note: "Rozmowa z CTO · 2026-11-03" },
      { type: "edit", note: "contact, notes" },
    ])
    expect(plan.data).toMatchObject({
      nextStep: "Rozmowa z CTO",
      nextStepAt: at,
      contact: "anna@allegro.pl",
    })
  })

  it("recomputes urlKey with the link and rejects bad input", () => {
    const plan = planUpdate(base, { url: "https://www.allegro.pl/praca/em?ref=x" }, now)
    expect(plan.data.urlKey).toBe("allegro.pl/praca/em")
    expect(() => planUpdate(base, { url: "javascript:alert(1)" }, now)).toThrow(ApplicationError)
    expect(() => planUpdate(base, { company: "  " }, now)).toThrow(ApplicationError)
    expect(() => planUpdate(base, { status: "NOPE" as never }, now)).toThrow(ApplicationError)
  })
})

describe("timeline edits", () => {
  it("merges a burst of edits from one channel", () => {
    const last = {
      type: "edit",
      channel: "web",
      note: "notes",
      at: new Date(now.getTime() - 60_000),
    }
    expect(coalesceEdit(last, "web", ["notes", "contact"], now)).toBe("notes, contact")
    expect(coalesceEdit(last, "mcp", ["notes"], now)).toBeNull()
    expect(
      coalesceEdit({ ...last, at: new Date(now.getTime() - 3_600_000) }, "web", ["notes"], now)
    ).toBeNull()
    expect(coalesceEdit({ ...last, type: "status" }, "web", ["notes"], now)).toBeNull()
  })
})

describe("undo of Aplikowano", () => {
  const fresh = {
    status: "APPLIED",
    notes: null,
    nextStep: null,
    nextStepAt: null,
    stageNote: null,
    contact: null,
  }
  it("removes only an untouched application", () => {
    expect(isUntouched(fresh, [{ type: "created" }])).toBe(true)
    expect(isUntouched({ ...fresh, status: "SCREENING" }, [{ type: "created" }])).toBe(false)
    expect(isUntouched({ ...fresh, notes: "x" }, [{ type: "created" }])).toBe(false)
    expect(isUntouched({ ...fresh, nextStep: "call" }, [{ type: "created" }])).toBe(false)
    expect(isUntouched({ ...fresh, stageNote: "HR" }, [{ type: "created" }])).toBe(false)
    expect(isUntouched({ ...fresh, contact: "Anna" }, [{ type: "created" }])).toBe(false)
    expect(isUntouched(fresh, [{ type: "created" }, { type: "edit" }])).toBe(false)
    expect(isUntouched(fresh, [])).toBe(false)
    expect(isUntouched(fresh, [{ type: "created" }], 2)).toBe(false)
  })
})

describe("stats and ordering", () => {
  it("counts the funnel and the response rate", () => {
    const rows = [
      { status: "APPLIED", closedAtStage: null, nextStepAt: null },
      { status: "INTERVIEW", closedAtStage: null, nextStepAt: new Date("2026-10-20T10:00:00Z") },
      { status: "OFFER", closedAtStage: null, nextStepAt: null },
      { status: "REJECTED", closedAtStage: "INTERVIEW", nextStepAt: null },
      { status: "WITHDRAWN", closedAtStage: "APPLIED", nextStepAt: null },
      { status: "GHOSTED", closedAtStage: "APPLIED", nextStepAt: null },
    ]
    const stats = computeStats(rows, now)
    expect(stats).toMatchObject({
      total: 6,
      active: 3,
      interviewing: 1,
      offers: 1,
      rejected: 1,
      overdue: 1,
    })
    expect(stats.responseRate).toBeCloseTo(3 / 6)
    expect(stats.closedAt).toEqual({ INTERVIEW: 1, APPLIED: 1 })
    expect(computeStats([], now).responseRate).toBeNull()
  })

  it("sorts by funnel order, then newest first", () => {
    const rows = [
      { id: "a", status: "REJECTED", appliedAt: new Date("2026-10-10") },
      { id: "b", status: "INTERVIEW", appliedAt: new Date("2026-10-01") },
      { id: "c", status: "APPLIED", appliedAt: new Date("2026-10-02") },
      { id: "d", status: "APPLIED", appliedAt: new Date("2026-10-05") },
    ]
    expect([...rows].sort(compareApplications).map((row) => row.id)).toEqual(["d", "c", "b", "a"])
  })
})

describe("search and names", () => {
  const rows = [
    { company: "Allegro", title: "Engineering Manager", appliedAt: new Date("2026-10-01") },
    { company: "Allegro Pay", title: "Head of Engineering", appliedAt: new Date("2026-10-05") },
    { company: "Żabka", title: "Backend Lead", appliedAt: new Date("2026-10-03") },
  ]
  it("matches without diacritics", () => {
    expect(matchesQuery(rows[2], "zabka")).toBe(true)
    expect(matchesQuery(rows[2], "żabka lead")).toBe(true)
    expect(matchesQuery(rows[2], "allegro")).toBe(false)
  })

  it("ranks the exact company first", () => {
    expect(rankByName(rows, { company: "allegro" }).map((row) => row.company)).toEqual([
      "Allegro",
      "Allegro Pay",
    ])
    expect(rankByName(rows, { q: "head" }).map((row) => row.company)).toEqual(["Allegro Pay"])
    expect(rankByName(rows, { company: "OLX" })).toEqual([])
  })

  it("formats the salary from the index", () => {
    expect(formatSalary(20000, 30000, "pln")).toBe("20 000–30 000 PLN")
    expect(formatSalary(25000, null, "EUR")).toBe("25 000 EUR")
    expect(formatSalary(null, null, "PLN")).toBeNull()
  })
})

describe("form answers", () => {
  const salary = (question: string, answer: string) => ({ question, answer, kind: "salary" })

  it("reads the salary the person gave", () => {
    expect(statedSalaryFrom([salary("Oczekiwania", "20 000 - 25 000 PLN")])).toBe(
      "20 000 - 25 000 PLN"
    )
    expect(
      statedSalaryFrom([{ question: "Why?", answer: "20 lat", kind: "openQuestion" }])
    ).toBeNull()
    expect(statedSalaryFrom([])).toBeNull()
  })

  it("does not take a yes to the offered range, or the currency alone, for a salary", () => {
    expect(statedSalaryFrom([salary("Akceptujesz widełki 20-25k?", "Tak")])).toBeNull()
    expect(statedSalaryFrom([salary("Salary currency", "PLN")])).toBeNull()
  })

  it("joins minimum and maximum into a range, other fields side by side", () => {
    expect(statedSalaryFrom([salary("Salary from", "20000"), salary("Salary to", "25000")])).toBe(
      "20000 – 25000"
    )
    expect(
      statedSalaryFrom([
        salary("Wynagrodzenie min.", "20 000"),
        salary("Wynagrodzenie max.", "25 000"),
      ])
    ).toBe("20 000 – 25 000")
    expect(statedSalaryFrom([salary("Stawka B2B", "150/h"), salary("Pensja UoP", "15000")])).toBe(
      "150/h · 15000"
    )
    expect(statedSalaryFrom([salary("Salary", "20000"), salary("Salary", "20000")])).toBe("20000")
  })

  it("puts a long answer on one line and caps it", () => {
    const stated = statedSalaryFrom([salary("Stawka", `20 000\nPLN ${"bardzo ".repeat(60)}`)])
    expect(stated).toMatch(/^20 000 PLN bardzo/)
    expect(stated!.length).toBeLessThanOrEqual(200)
  })

  it("reads anything else in the column as an empty form", () => {
    expect(parseFormAnswers(undefined)).toEqual([])
    expect(parseFormAnswers({})).toEqual([])
    expect(parseFormAnswers([null, 1, { question: "Q" }])).toEqual([])
    expect(parseFormAnswers([{ question: "Q", answer: "A" }])).toEqual([
      { question: "Q", answer: "A", kind: null },
    ])
  })

  it("lets a form sent again overwrite only what it repeats", () => {
    const first = [salary("Why us?", "Stare"), salary("Stawka", "20k")]
    expect(mergeFormAnswers(first, [salary("why  US", "Nowe"), salary("Start", "Jutro")])).toEqual([
      salary("why  US", "Nowe"),
      salary("Stawka", "20k"),
      salary("Start", "Jutro"),
    ])
  })

  it("lists the form, then bank answers it does not repeat", () => {
    const listed = applicationAnswers(
      [salary("Why us?", "Z formularza")],
      [
        { id: "b1", question: "why us", answer: "Z banku" },
        { id: "b2", question: "Dodana ręcznie", answer: "Tak" },
      ]
    )
    expect(listed).toEqual([
      { id: "form-0", question: "Why us?", answer: "Z formularza" },
      { id: "b2", question: "Dodana ręcznie", answer: "Tak" },
    ])
  })

  it("lets the person correct the stated salary, on the timeline", () => {
    const plan = planUpdate(base, { statedSalary: "  22 000 PLN " }, now)
    expect(plan.data.statedSalary).toBe("22 000 PLN")
    expect(plan.edited).toEqual(["statedSalary"])
    expect(planUpdate({ ...base, statedSalary: "x" }, { statedSalary: null }, now).data).toEqual({
      statedSalary: null,
    })
  })
})
