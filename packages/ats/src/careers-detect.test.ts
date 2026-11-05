import { describe, expect, it } from "vitest"
import {
  companyDomain,
  findAtsMarkers,
  findCareersLinks,
  isAggregatorHost,
  jobLinks,
  looksLikeJobPath,
  siteName,
} from "./careers-detect"

const HOME = `
<html><head><title>Acme Software | Home</title>
<meta property="og:site_name" content="Acme Software"></head>
<body>
<nav>
  <a href="/o-nas">O nas</a>
  <a href="/kariera">Kariera</a>
  <a href="https://www.linkedin.com/company/acme/jobs">LinkedIn jobs</a>
  <a href="https://justjoin.it/acme">Our offers on justjoin</a>
  <a href="/blog/careers-in-tech">Blog: careers in tech</a>
  <a href="https://other.com/careers">Partner careers</a>
</nav>
<footer><a href="https://acme.teamtailor.com/jobs" aria-label="Join us">Teamtailor</a></footer>
</body></html>`

describe("findCareersLinks", () => {
  it("ranks same-site careers pages and ATS boards, drops job boards and other sites", () => {
    const links = findCareersLinks(HOME, "https://www.acme.pl/")
    const urls = links.map((link) => link.url)
    expect(urls[0]).toBe("https://acme.teamtailor.com/jobs")
    expect(urls).toContain("https://www.acme.pl/kariera")
    expect(urls.some((url) => url.includes("linkedin"))).toBe(false)
    expect(urls.some((url) => url.includes("justjoin"))).toBe(false)
    expect(urls.some((url) => url.includes("other.com"))).toBe(false)
    const blog = links.find((link) => link.url.includes("/blog/"))
    expect(!blog || blog.score < links.find((link) => link.url.endsWith("/kariera"))!.score).toBe(
      true
    )
  })

  it("matches Polish wording like dołącz do nas", () => {
    const html = `<a href="/dolacz-do-nas">Dołącz do nas</a><a href="/produkt">Produkt</a>`
    expect(findCareersLinks(html, "https://firma.pl/").map((link) => link.url)).toEqual([
      "https://firma.pl/dolacz-do-nas",
    ])
  })
})

describe("findAtsMarkers", () => {
  it("reads embed snippets for Greenhouse, Lever, Ashby, Workable, SmartRecruiters", () => {
    const html = `
      <script src="https://boards.greenhouse.io/embed/job_board/js?for=acmesoftware"></script>
      <script>fetch("https://api.lever.co/v0/postings/acme-lever?mode=json")</script>
      <iframe src="https://jobs.ashbyhq.com/acme-ashby/embed"></iframe>
      <script src="https://apply.workable.com/api/v1/widget/accounts/acme-wk"></script>
      <script>var u = "https:\\/\\/api.smartrecruiters.com\\/v1\\/companies\\/AcmeSR\\/postings"</script>`
    const boards = findAtsMarkers(html, "https://acme.pl/kariera").filter(
      (marker) => marker.kind === "board"
    )
    const keys = boards.map((marker) =>
      marker.kind === "board" ? `${marker.provider}:${marker.boardId}` : ""
    )
    expect(keys).toEqual(
      expect.arrayContaining([
        "GREENHOUSE:acmesoftware",
        "LEVER:acme-lever",
        "ASHBY:acme-ashby",
        "WORKABLE:acme-wk",
        "SMARTRECRUITERS:AcmeSR",
      ])
    )
  })

  it("reads tenant links for Teamtailor, Recruitee, Personio, Traffit, Breezy, Pinpoint, BambooHR", () => {
    const html = [
      "https://acme.teamtailor.com/jobs/123-dev",
      "https://acme.recruitee.com/o/backend",
      "https://acme.jobs.personio.de/job/1",
      "https://acme.traffit.com/career/",
      "https://acme.breezy.hr/p/abc",
      "https://acme.pinpointhq.com/",
      "https://acme.bamboohr.com/careers/12",
    ]
      .map((url) => `<a href="${url}">x</a>`)
      .join("")
    const providers = findAtsMarkers(html, "https://acme.pl/").map((marker) =>
      marker.kind === "board" ? marker.provider : marker.vendor
    )
    expect(providers).toEqual([
      "TEAMTAILOR",
      "RECRUITEE",
      "PERSONIO",
      "TRAFFIT",
      "BREEZY",
      "PINPOINT",
      "BAMBOOHR",
    ])
  })

  it("marks eRecruiter and Workday as link-only and ignores vendor CDN hosts", () => {
    const html = `
      <a href="https://kariera.erecruiter.pl/?cfg=abc">Oferty</a>
      <a href="https://acme.wd3.myworkdayjobs.com/Acme">Jobs</a>
      <script src="https://scripts.teamtailor-cdn.com/widget.js"></script>
      <link href="https://app.teamtailor.com/assets/x.css">`
    const markers = findAtsMarkers(html, "https://acme.pl/")
    expect(markers.map((marker) => marker.kind)).toEqual(["link-only", "link-only", "board"])
    const board = markers.find((marker) => marker.kind === "board")
    expect(board).toMatchObject({ provider: "TEAMTAILOR", boardId: "acme.pl" })
  })

  it("finds nothing on a plain page", () => {
    expect(findAtsMarkers("<a href='/kontakt'>Kontakt</a>", "https://acme.pl/")).toEqual([])
  })
})

describe("page helpers", () => {
  it("reads the site name, domain, and job-looking links", () => {
    expect(siteName(HOME)).toBe("Acme Software")
    expect(companyDomain("https://kariera.acme.pl/oferty")).toBe("acme.pl")
    expect(companyDomain("https://www.acme.pl/")).toBe("acme.pl")
    expect(isAggregatorHost("pl.linkedin.com")).toBe(true)
    expect(isAggregatorHost("nofluffjobs.com")).toBe(true)
    expect(isAggregatorHost("acme.pl")).toBe(false)
    expect(looksLikeJobPath("/kariera/senior-java-developer")).toBe(true)
    expect(looksLikeJobPath("/kariera")).toBe(false)
    const html = `<a href="/kariera/senior-java">Senior Java</a><a href="/kariera/qa-tester#apply">QA</a><a href="https://x.com/kariera/abc">x</a>`
    expect(jobLinks(html, "https://acme.pl/kariera")).toEqual([
      "https://acme.pl/kariera/senior-java",
      "https://acme.pl/kariera/qa-tester",
    ])
  })
})
