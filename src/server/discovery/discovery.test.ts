import {describe, expect, it} from "vitest"
import {classifyHit, workableSlugFromHtml} from "./boards"
import {pickDiscoveryQueries} from "./queries"
import {polishBoardLinks} from "src/shared/polish-boards"
import {loadSeedBoards, selectSeedBoards} from "config/seed-boards"

describe("discovery", () => {
  it("loads the verified seed catalog and drops known wrong slugs", () => {
    const boards = loadSeedBoards()
    expect(boards.length).toBeGreaterThanOrEqual(180)
    expect(boards.some((board) => board.provider === "GREENHOUSE" && board.boardId.toLowerCase() === "wise")).toBe(false)
    expect(boards.some((board) => board.provider === "SMARTRECRUITERS")).toBe(true)
    expect(boards.some((board) => board.provider === "WORKABLE")).toBe(true)
    const picked = selectSeedBoards(boards, 40)
    expect(picked).toHaveLength(40)
    expect(picked[0].priority).toBeGreaterThanOrEqual(picked[39].priority)
  })

  it("caps discovery to the five live ATS and never queries Polish boards", () => {
    const queries = pickDiscoveryQueries(
      [
        {source: "greenhouse", site: "job-boards.greenhouse.io", query: "site:job-boards.greenhouse.io head"},
        {source: "justjoin", site: "justjoin.it", query: "site:justjoin.it head"},
        {source: "ashby", site: "jobs.ashbyhq.com", query: "site:jobs.ashbyhq.com head"},
        {source: "teamtailor", site: "teamtailor.com", query: "site:teamtailor.com head"},
        {source: "linkedin", site: "linkedin.com/jobs/view", query: "site:linkedin.com head"},
        {source: "lever", site: "jobs.lever.co", query: "site:jobs.lever.co head"},
        {source: "workable", site: "apply.workable.com", query: "site:apply.workable.com head"},
        {source: "smartrecruiters", site: "jobs.smartrecruiters.com", query: "site:jobs.smartrecruiters.com head"},
        {source: "pracuj", site: "pracuj.pl", query: "site:pracuj.pl head"},
      ],
      8,
    )
    expect(queries.some((query) => query.includes("justjoin") || query.includes("pracuj") || query.includes("teamtailor"))).toBe(false)
    expect(queries[0]).toContain("greenhouse")
    expect(new Set(queries.map((query) => query.split(" ")[0])).size).toBe(5)
  })

  it("classifies hits and only link-outs Polish boards", () => {
    expect(classifyHit("https://justjoin.it/job-offers/abc").kind).toBe("polish")
    expect(classifyHit("https://nofluffjobs.com/pl/job/x").kind).toBe("polish")
    expect(classifyHit("https://bulldogjob.pl/companies/jobs/1").kind).toBe("polish")
    expect(classifyHit("https://acme.teamtailor.com/jobs/1").kind).toBe("unverified-ats")
    expect(classifyHit("https://apply.workable.com/j/ABC123").kind).toBe("workable-shortcode")
    expect(classifyHit("https://job-boards.greenhouse.io/gitlab/jobs/1")).toMatchObject({kind: "ats", boardId: "gitlab"})
    expect(workableSlugFromHtml(`<a href="https://apply.workable.com/netguru/j/ABC">x</a>`)).toBe("netguru")
    const links = polishBoardLinks("Head of Engineering")
    expect(links).toHaveLength(5)
    expect(links.every((link) => link.href.startsWith("https://"))).toBe(true)
  })
})
