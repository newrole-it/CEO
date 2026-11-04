import { describe, expect, it } from "vitest"
import { classifyHit, workableSlugFromHtml } from "./boards"
import { pickDiscoveryQueries } from "./queries"
import { polishBoardLinks } from "@newrole/offers/polish-boards"
import { WORKDAY_BOARDS } from "src/shared/workday-boards"
import { loadSeedBoards, selectSeedBoards, workdayOutboundLinks } from "config/seed-boards"

describe("discovery", () => {
  it("loads the verified seed catalog and drops known wrong slugs", () => {
    const boards = loadSeedBoards()
    expect(boards.length).toBeGreaterThanOrEqual(220)
    expect(
      boards.some(
        (board) => board.provider === "GREENHOUSE" && board.boardId.toLowerCase() === "wise"
      )
    ).toBe(false)
    expect(
      boards.some(
        (board) => board.provider === "SMARTRECRUITERS" && board.boardId.toLowerCase() === "allegro"
      )
    ).toBe(false)
    expect(
      boards.some(
        (board) => board.provider === "TEAMTAILOR" && board.boardId === "careers.spyro-soft.com"
      )
    ).toBe(true)
    expect(
      boards.some((board) => board.provider === "TRAFFIT" && board.boardId === "stxnext")
    ).toBe(true)
    expect(boards.some((board) => board.provider === "LEVER" && board.boardId === "eu:xtb")).toBe(
      true
    )
    expect(boards.some((board) => board.provider === "BREEZY" && board.boardId === "boldare")).toBe(
      true
    )
    expect(
      boards.some((board) => board.provider === "WORKDAY" && board.boardId === "intive/wd3/Intive")
    ).toBe(true)
    expect(
      boards.some(
        (board) => board.provider === "SUCCESSFACTORS" && board.boardId === "jobs.gft.com"
      )
    ).toBe(true)
    expect(
      boards.some(
        (board) => board.provider === "SUCCESSFACTORS" && board.boardId === "careers.allegro.eu"
      )
    ).toBe(true)
    expect(boards.some((board) => board.boardId === "jobs.allegro.eu")).toBe(false)
    expect(
      boards.some((board) => board.provider === "RECRUITEE" && board.boardId === "callstackpl")
    ).toBe(true)
    expect(boards.find((board) => board.boardId === "careers.epam.com")?.openJobsAtCheck).toBe(225)
    expect(
      boards.some(
        (board) => board.provider === "CAREER_SITE" && board.boardId === "www.pracujwgp.pl"
      )
    ).toBe(true)
    expect(workdayOutboundLinks().map((link) => link.href)).toEqual(
      WORKDAY_BOARDS.map((link) => link.href)
    )
    const picked = selectSeedBoards(boards, 40)
    expect(picked).toHaveLength(40)
    expect(picked[0].priority).toBeGreaterThanOrEqual(picked[39].priority)
    // Every IT role counts the same now: the boards with the most offers go first.
    const most = Math.max(
      ...boards
        .filter((board) => board.provider !== "CAREER_SITE")
        .map((board) => board.openJobsAtCheck)
    )
    expect(picked.some((board) => board.openJobsAtCheck === most)).toBe(true)
  })

  it("caps discovery to live ATS hosts and never queries Polish boards or Workday", () => {
    const queries = pickDiscoveryQueries(
      [
        {
          source: "greenhouse",
          site: "job-boards.greenhouse.io",
          query: "site:job-boards.greenhouse.io head",
        },
        { source: "justjoin", site: "justjoin.it", query: "site:justjoin.it head" },
        { source: "ashby", site: "jobs.ashbyhq.com", query: "site:jobs.ashbyhq.com head" },
        { source: "teamtailor", site: "teamtailor.com", query: "site:teamtailor.com head" },
        { source: "linkedin", site: "linkedin.com/jobs/view", query: "site:linkedin.com head" },
        { source: "lever", site: "jobs.lever.co", query: "site:jobs.lever.co head" },
        { source: "workable", site: "apply.workable.com", query: "site:apply.workable.com head" },
        {
          source: "smartrecruiters",
          site: "jobs.smartrecruiters.com",
          query: "site:jobs.smartrecruiters.com head",
        },
        { source: "pracuj", site: "pracuj.pl", query: "site:pracuj.pl head" },
      ],
      8
    )
    expect(
      queries.some(
        (query) =>
          query.includes("justjoin") || query.includes("pracuj") || query.includes("myworkdayjobs")
      )
    ).toBe(false)
    expect(queries.some((query) => query.includes("teamtailor.com"))).toBe(true)
    expect(queries.some((query) => query.includes("recruitee.com"))).toBe(true)
    expect(queries[0]).toContain("greenhouse")
    expect(new Set(queries.map((query) => query.split(" ")[0])).size).toBe(8)
  })

  it("classifies hits and only link-outs Polish boards", () => {
    expect(classifyHit("https://justjoin.it/job-offers/abc").kind).toBe("polish")
    expect(classifyHit("https://nofluffjobs.com/pl/job/x").kind).toBe("polish")
    expect(classifyHit("https://bulldogjob.pl/companies/jobs/1").kind).toBe("polish")
    expect(classifyHit("https://acme.teamtailor.com/jobs/1")).toMatchObject({
      kind: "ats",
      provider: "TEAMTAILOR",
      boardId: "acme",
    })
    expect(classifyHit("https://huuuge.recruitee.com/o/role")).toMatchObject({
      kind: "ats",
      provider: "RECRUITEE",
      boardId: "huuuge",
    })
    expect(classifyHit("https://stxnext.traffit.com/career/")).toMatchObject({
      kind: "ats",
      provider: "TRAFFIT",
      boardId: "stxnext",
    })
    expect(classifyHit("https://jobs.eu.lever.co/xtb")).toMatchObject({
      kind: "ats",
      provider: "LEVER",
      boardId: "eu:xtb",
    })
    expect(classifyHit("https://jobs.lever.co/gitlab")).toMatchObject({
      kind: "ats",
      provider: "LEVER",
      boardId: "gitlab",
    })
    expect(classifyHit("https://visa.wd5.myworkdayjobs.com/Visa").kind).toBe("workday")
    expect(classifyHit("https://job-boards.eu.greenhouse.io/ramp/jobs/1").kind).toBe(
      "unverified-ats"
    )
    expect(classifyHit("https://apply.workable.com/j/ABC123").kind).toBe("workable-shortcode")
    expect(classifyHit("https://job-boards.greenhouse.io/gitlab/jobs/1")).toMatchObject({
      kind: "ats",
      boardId: "gitlab",
    })
    expect(workableSlugFromHtml(`<a href="https://apply.workable.com/netguru/j/ABC">x</a>`)).toBe(
      "netguru"
    )
    const links = polishBoardLinks("Head of Engineering")
    expect(links).toHaveLength(5)
    expect(links.every((link) => link.href.startsWith("https://"))).toBe(true)
  })
})
