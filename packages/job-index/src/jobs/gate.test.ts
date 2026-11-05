import { describe, expect, it } from "vitest"
import { resolveJobCountries } from "@newrole/ats/countries"
import { boardIsTech, gateJob, isJunkTitle } from "./gate"

const url = "https://job-boards.greenhouse.io/acme/jobs/1"
const warsaw = resolveJobCountries({ locationText: "Warszawa, Polska" })

describe("offer gate", () => {
  it("refuses test posts and candidate pools", () => {
    expect(isJunkTitle("Test")).toBe(true)
    expect(isJunkTitle("Test job - do not apply")).toBe(true)
    expect(isJunkTitle("General Application")).toBe(true)
    expect(isJunkTitle("Join our Talent Pool")).toBe(true)
    expect(isJunkTitle("QA Engineer")).toBe(false)
    expect(isJunkTitle("Test Automation Engineer")).toBe(false)
    expect(isJunkTitle("Senior Gameplay Programmer - Talent Pipeline")).toBe(true)
    expect(isJunkTitle("Senior Full Stack Engineer (Evergreen)")).toBe(true)
    expect(isJunkTitle("QA Analyst (Future Roles)")).toBe(true)
    expect(isJunkTitle("Utvecklare [spontanansökan]")).toBe(true)
    expect(isJunkTitle("(Internal Only) Warranty Bots Automation Manager")).toBe(true)
    // A fund named Evergreen is a real opening.
    expect(isJunkTitle("Product Manager, Evergreen Private Fund Solutions")).toBe(false)
  })

  it("keeps IT roles that say where they are", () => {
    expect(
      gateJob({ title: "Senior Java Developer", originalUrl: url }, warsaw, { boardIsTech: false })
    ).toBeNull()
  })

  it("refuses other roles, and undecided titles unless an IT board fills them with IT work", () => {
    const gate = (title: string, boardIsTech: boolean) =>
      gateJob({ title, originalUrl: url }, warsaw, { boardIsTech })
    expect(gate("Registered Nurse", true)).toBe("not_it")
    expect(gate("Associate", false)).toBe("not_it")
    expect(gate("Associate", true)).toBe("not_it")
    expect(gate("Project Manager", true)).toBeNull()
    expect(gate("Project Manager", false)).toBe("not_it")
    expect(gate("Product Designer", true)).toBeNull()
    expect(gate("Product Designer", false)).toBe("not_it")
    expect(gate("Head of Design", true)).toBe("not_it")
    expect(gate("Staff Engineer", true)).toBeNull()
    expect(gate("Project Engineer", false)).toBe("not_it")
  })

  it("weighs a board by all its titles, so undecided ones cannot make it IT", () => {
    // "Coordinator" stays undecided; under the old rule this board read as 1/1 IT.
    const dental = ["IT Administrator", ...Array.from({ length: 30 }, () => "Coordinator (m/w/d)")]
    expect(boardIsTech(dental)).toBe(false)
    expect(boardIsTech(["Java Developer", "QA Engineer", "Project Manager", "Office Lead"])).toBe(
      true
    )
  })

  it("refuses an IT role with no place, or only a blocked one", () => {
    const nowhere = resolveJobCountries({ locationText: "MOS1" })
    expect(gateJob({ title: "SRE", originalUrl: url }, nowhere, { boardIsTech: true })).toBe(
      "no_country"
    )
    const moscow = resolveJobCountries({ locationText: "Moscow, Russia" })
    expect(gateJob({ title: "SRE", originalUrl: url }, moscow, { boardIsTech: true })).toBe(
      "blocked_country"
    )
  })

  it("calls a board IT when most of its decided titles are", () => {
    expect(boardIsTech(["Backend Developer", "QA Engineer", "Account Executive"])).toBe(true)
    expect(boardIsTech(["Registered Nurse", "Cook", "Data Analyst"])).toBe(false)
    expect(boardIsTech(["Associate", "Coordinator"])).toBe(false)
  })
})
