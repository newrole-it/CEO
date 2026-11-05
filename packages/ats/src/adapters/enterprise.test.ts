import { describe, expect, it } from "vitest"
import type { HttpClient } from "../host"
import { avatureEntriesToJobs, parseAvatureDetail, pickAvatureSitemap } from "./avature"
import {
  erecruiterOfferUrl,
  isErecruiterCfg,
  listErecruiter,
  offersLinkFromPage,
  parseErecruiterOffer,
  parseErecruiterOffers,
  parseErecruiterWidgetRows,
} from "./erecruiter"
import { innerHtmlOfId, polandOrRemote, removeElementById, titleFromSlug } from "./html-bits"
import { jobviteSlug, parseJobviteListing } from "./jobvite"
import { listPhenom, parsePhenomDetail, parsePhenomSearch, phenomJobUrl } from "./phenom"

type Route = (url: string, body?: string) => { status: number; body: string; url?: string }

function fakeHttp(route: Route): HttpClient & { calls: string[] } {
  const calls: string[] = []
  const answer = (url: string, body?: string) => {
    calls.push(url)
    const out = route(url, body)
    return { url: out.url ?? url, status: out.status, body: out.body, contentType: "text/plain" }
  }
  return {
    calls,
    async get(url) {
      return answer(url)
    },
    async post(url, body) {
      return answer(url, body)
    },
  }
}

const WIDGET_PAGE = `({"htm":"<tr jobOfferId='3595256' offerId='5015393' class='skk_row_odd' externalJobOfferId='625767' externalJobOfferRegionId='323316' comId='20002054' skkResult='offer' ><td class='skk_positionName'>M\\u0142odszy Specjalista ds. ESG</td><td>Wroc\\u0142aw</td></tr><tr jobOfferId='3592142' offerId='5011939' class='skk_row_even' externalJobOfferId='623916' externalJobOfferRegionId='322876' comId='20002054' skkResult='offer' ><td class='skk_positionName'>In\\u017cynier Budowy</td><td>Warszawa</td></tr><tr tp='1' tr='2' pn='1' ps='15' style='display:none;'></tr>"})`

const OFFER_PAGE = `<html><head>
<meta name="description"content="Praca w Echo Investment S.A.: Inżynier Budowy | Oferta pracy w Warszawa, mazowieckie. eRecruiter" >
</head><body><div id="offCont"><div id="sOW2"><div class="job1"><div class="job">
<div id="JobTitle">Inżynier Budowy</div>
<div id="WorkPlace">Miejsce pracy: Warszawa</div></div></div>
<div id="t1"><p><strong>Twój zakres obowiązków</strong></p><ul><li>Nadzór nad budową</li></ul></div>
<div id="t1"><p><strong>Nasze wymagania</strong></p><ul><li>3 lata doświadczenia</li></ul></div>
<div class="job1"><a href="https://system.erecruiter.pl/FormTemplates/RecruitmentForm.aspx?webid=X&amp;skkcfg=4d3dd27fca3d40c79e01bee9745902b7" class="button">Aplikuj</a>
<div id="Clause"><p><em>Administratorem Twoich danych osobowych jest Echo Investment S.A.</em></p></div></div>
</div></div></body></html>`

describe("html-bits", () => {
  it("extracts nested blocks by id and removes them", () => {
    const html = `<div id="a"><div id="b"><p>inner</p></div><span>tail</span></div>`
    expect(innerHtmlOfId(html, "a")).toBe(`<div id="b"><p>inner</p></div><span>tail</span>`)
    expect(removeElementById(html, "b")).toBe(`<div id="a"><span>tail</span></div>`)
    expect(titleFromSlug("senior-java-developer-%28remote%29")).toBe(
      "Senior Java Developer (Remote)"
    )
    expect(polandOrRemote("PL-Warsaw")).toBe(true)
    expect(polandOrRemote("Kuala Lumpur, Malaysia")).toBe(false)
    expect(polandOrRemote(undefined)).toBe(true)
  })
})

describe("eRecruiter", () => {
  it("reads widget rows, the total marker, and the offer page", () => {
    const parsed = parseErecruiterWidgetRows(WIDGET_PAGE)
    expect(parsed.total).toBe(2)
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0]).toMatchObject({
      offerId: "5015393",
      city: "Wrocław",
      title: "Młodszy Specjalista ds. ESG",
    })
    expect(erecruiterOfferUrl(parsed.rows[1], "4d3dd27fca3d40c79e01bee9745902b7")).toBe(
      "https://skk.erecruiter.pl/Offer.aspx?oid=5011939&cfg=4d3dd27fca3d40c79e01bee9745902b7&ejoId=623916&ejorId=322876&comId=20002054"
    )
    const detail = parseErecruiterOffer(OFFER_PAGE)
    expect(detail.title).toBe("Inżynier Budowy")
    expect(detail.location).toBe("Warszawa")
    expect(detail.employer).toBe("Echo Investment S.A.")
    expect(detail.descriptionHtml).toContain("Nadzór nad budową")
    expect(detail.descriptionHtml).not.toContain("Administratorem")
    expect(detail.descriptionHtml).not.toContain("Inżynier Budowy</div>")
    expect(isErecruiterCfg("4D3DD27FCA3D40C79E01BEE9745902B7")).toBe(true)
    expect(isErecruiterCfg("zabka")).toBe(false)
  })

  it("lists a widget board and names the employer from the first offer", async () => {
    const http = fakeHttp((url) => {
      if (url.includes("GetHtml.ashx")) return { status: 200, body: WIDGET_PAGE }
      if (url.includes("Offer.aspx")) return { status: 200, body: OFFER_PAGE }
      return { status: 404, body: "" }
    })
    const listed = await listErecruiter("4D3DD27FCA3D40C79E01BEE9745902B7", http)
    expect(listed.proven).toBe(true)
    expect(listed.companyName).toBe("Echo Investment S.A.")
    expect(listed.jobs).toHaveLength(2)
    expect(listed.jobs[0].needsHydration).toBe(true)
    expect(listed.jobs[0].sourceType).toBe("ERECRUITER")
    expect(http.calls.filter((call) => call.includes("GetHtml"))).toHaveLength(1)
    const wrong = await listErecruiter("4D3DD27FCA3D40C79E01BEE9745902B7", http, "Allegro")
    expect(wrong.proven).toBe(false)
    expect(wrong.note).toMatch(/Echo Investment/)
  })

  it("reads a pracujunas.pl career site through its offers.json link", async () => {
    const page = `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"companyData":{"companyName":"18802512","subDomainName":"zabka","offersLink":"https://offers.erecruiter.pl/skk/company/18802512/offers.json?hash=24F0DD"}}}}</script>`
    expect(offersLinkFromPage(page)).toBe(
      "https://offers.erecruiter.pl/skk/company/18802512/offers.json?hash=24F0DD"
    )
    const offers = {
      jobs: [
        {
          title: "Senior Data Engineer",
          url: "https://skk.erecruiter.pl/Offer.aspx?oid=4990172&ejoId=822507&ejorId=554552&comId=18802512",
          company: "Żabka Polska Sp. z o.o. ",
          location: "Poznań",
          region: { name: "wielkopolskie" },
          country: { isoCode: "PL" },
          publishDate: "2026-10-04",
          jobOfferRegionId: "4990172",
          positionDescription: "<p>Build pipelines</p>",
          requirements: "<ul><li>Spark</li></ul>",
          compensationPackage: {
            salaryRanges: [{ min: 20000, max: 26000, currency: "PLN", period: "month" }],
          },
        },
      ],
    }
    const http = fakeHttp((url) => {
      if (url === "https://zabka.pracujunas.pl/") return { status: 200, body: page }
      if (url.startsWith("https://offers.erecruiter.pl/"))
        return { status: 200, body: JSON.stringify(offers) }
      return { status: 404, body: "" }
    })
    const listed = await listErecruiter("zabka", http)
    expect(listed.proven).toBe(true)
    expect(listed.complete).toBe(true)
    expect(listed.companyName).toBe("Żabka Polska Sp. z o.o.")
    expect(listed.jobs[0].locationText).toBe("Poznań, wielkopolskie, Poland")
    expect(listed.jobs[0].descriptionText).toContain("Spark")
    expect(listed.jobs[0].salaryText).toBe("20000-26000 PLN month")
    expect(listed.jobs[0].needsHydration).toBe(false)
    expect(parseErecruiterOffers({ jobs: [{ title: "No url" }] }, "zabka")).toEqual([])
  })
})

describe("Phenom", () => {
  const search = {
    refineSearch: {
      totalHits: 2,
      data: {
        jobs: [
          {
            jobSeqNo: "DPDHGLOBALAV364698ENGLOBALEXTERNAL",
            title: "Ekspert ds. optymalizacji",
            city: "Łódź",
            state: "Łódzkie",
            country: "Poland",
            multi_location: ["Łódź, Łódzkie, Poland"],
            locale: "en_GLOBAL",
            postedDate: "2026-10-05T09:16:41.275+0000",
            descriptionTeaser: "DHL eCommerce (Poland) to lider rynku...",
          },
          {
            jobSeqNo: "DPDHGLOBALAV1ENGLOBALEXTERNAL",
            title: "Backend Developer",
            cityStateCountry: "Warsaw, Poland",
            locale: "en_GLOBAL",
          },
        ],
      },
    },
  }

  it("parses the refineSearch page and builds locale URLs", () => {
    const parsed = parsePhenomSearch(search, "careers.dhl.com", "DHL")
    expect(parsed.totalHits).toBe(2)
    expect(parsed.jobs).toHaveLength(2)
    expect(parsed.jobs[0].originalUrl).toBe(
      "https://careers.dhl.com/global/en/job/DPDHGLOBALAV364698ENGLOBALEXTERNAL"
    )
    expect(parsed.jobs[0].locationText).toBe("Łódź, Łódzkie, Poland")
    expect(parsed.jobs[0].publishedAt?.toISOString()).toBe("2026-10-05T09:16:41.275Z")
    expect(parsed.jobs[0].descriptionText).toContain("lider rynku")
    expect(parsed.jobs[0].needsHydration).toBe(true)
    expect(phenomJobUrl("careers.dhl.com", undefined, "X")).toBe("https://careers.dhl.com/job/X")
    expect(
      parsePhenomDetail({
        jobDetail: { data: { job: { description: "<p>Full</p>", companyName: "DHL" } } },
      })
    ).toMatchObject({
      description: "<p>Full</p>",
      companyName: "DHL",
    })
  })

  it("lists through the widgets POST and stops at the stated total", async () => {
    const http = fakeHttp((url, body) => {
      if (!url.endsWith("/widgets")) return { status: 404, body: "" }
      const parsed = JSON.parse(body ?? "{}") as {
        ddoKey: string
        selected_fields?: { country?: string[] }
      }
      if (parsed.ddoKey !== "refineSearch" || !parsed.selected_fields?.country?.includes("Poland"))
        return { status: 400, body: "" }
      return { status: 200, body: JSON.stringify(search) }
    })
    const listed = await listPhenom("careers.dhl.com", http)
    expect(listed.proven).toBe(true)
    expect(listed.complete).toBe(true)
    expect(listed.companyName).toBe("dhl")
    expect(listed.jobs).toHaveLength(2)
    expect(http.calls).toHaveLength(1)
    const empty = await listPhenom(
      "careers.example.com",
      fakeHttp(() => ({
        status: 200,
        body: JSON.stringify({ refineSearch: { totalHits: 0, data: { jobs: [] } } }),
      }))
    )
    expect(empty.proven).toBe(true)
    expect(empty.jobs).toEqual([])
    const notPhenom = await listPhenom(
      "careers.example.com",
      fakeHttp(() => ({ status: 200, body: "{}" }))
    )
    expect(notPhenom.proven).toBe(false)
  })
})

describe("Avature", () => {
  it("prefers the Polish locale sitemap and ranks Polish slugs first", () => {
    expect(
      pickAvatureSitemap([
        "https://x/en_US/careers/sitemap.xml",
        "https://x/pl_PL/careers/sitemap.xml",
      ])
    ).toContain("pl_PL")
    expect(pickAvatureSitemap(["https://x/careers/sitemap.xml"])).toBe(
      "https://x/careers/sitemap.xml"
    )
    const jobs = avatureEntriesToJobs(
      [
        { loc: "https://careers.qatarairways.com/global/AgentCreate" },
        {
          loc: "https://careers.qatarairways.com/global/JobDetail/Doha-Cabin-Crew/61000",
          lastmod: "2026-09-01",
        },
        {
          loc: "https://careers.qatarairways.com/global/JobDetail/Wroclaw-Poland-Contact-Centre-Agent/62533",
          lastmod: "2026-10-01",
        },
      ],
      "careers.qatarairways.com/global",
      "Qatar Airways"
    )
    expect(jobs.map((job) => job.externalId)).toEqual(["62533", "61000"])
    expect(jobs[0].title).toBe("Wroclaw Poland Contact Centre Agent")
    expect(jobs[0].needsHydration).toBe(true)
  })

  it("reads og:title, the Location field and the richest prose field from a JobDetail page", () => {
    const html = `<head><meta property="og:title" content="Wroclaw, Poland | Airline Customer Contact Centre Agent"></head>
<article><div class="article__content__view__field"><div class="article__content__view__field__label">Ref #</div><div class="article__content__view__field__value">2600008R</div></div>
<div class="article__content__view__field"><div class="article__content__view__field__label">Location</div><div class="article__content__view__field__value">Poland-Wroclaw</div></div>
<div class="article__content__view__field"><div class="article__content__view__field__label">Work Model</div><div class="article__content__view__field__value">Hybrid</div></div>
<div class="article__content__view__field"><div class="article__content__view__field__label">Description</div><div class="article__content__view__field__value"><p>About the role</p><ul><li>Handle customer contacts in Polish and English, every day, with care and attention to detail.</li></ul></div></div></article>`
    const detail = parseAvatureDetail(html)
    expect(detail.title).toBe("Airline Customer Contact Centre Agent")
    expect(detail.location).toBe("Poland-Wroclaw")
    expect(detail.workplace).toBe("HYBRID")
    expect(detail.descriptionHtml).toContain("Handle customer contacts")
  })
})

describe("Jobvite", () => {
  it("reads job links and codes from a listing", () => {
    const html = `<a href="/acme/job/oXk7ifwL">Senior Engineer</a><div class="jv-job-list-location">Warsaw, Poland</div>
<a href="https://jobs.jobvite.com/acme/job/oXk7ifwL">Senior Engineer (dup)</a><a href="/acme/jobs">All jobs</a>`
    const links = parseJobviteListing(html, "https://jobs.jobvite.com/acme/jobs")
    expect(links).toEqual([
      {
        url: "https://jobs.jobvite.com/acme/job/oXk7ifwL",
        code: "oXk7ifwL",
        title: "Senior Engineer",
        location: "Warsaw, Poland",
      },
    ])
    expect(jobviteSlug("https://jobs.jobvite.com/careers/acme/jobs")).toBe("acme")
  })
})
