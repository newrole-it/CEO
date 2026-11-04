import { describe, expect, it } from "vitest"
import type { HttpClient, HttpResponse } from "./http"
import { readPosting } from "./posting"

function fakeHttp(pages: Record<string, Partial<HttpResponse>>): HttpClient & { urls: string[] } {
  const urls: string[] = []
  const get = async (url: string): Promise<HttpResponse> => {
    urls.push(url)
    const page = pages[url]
    if (!page) return { url, status: 404, body: "", contentType: "text/html" }
    return { url, status: 200, body: "", contentType: "text/html", ...page }
  }
  return { urls, get, post: async (url) => get(url) }
}

const JOB_URL = "https://careers.example.com/jobs/42"

const jsonLdPage = (extra = "") => `<!doctype html><html><head>
<title>Careers</title>${extra}
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "Example" },
    {
      "@type": "JobPosting",
      title: "Senior Platform Engineer",
      hiringOrganization: { "@type": "Organization", name: "Example Sp. z o.o." },
      jobLocation: {
        "@type": "Place",
        address: { addressLocality: "Kraków", addressCountry: "PL" },
      },
      description:
        "<p>We need <strong>Kubernetes</strong> and Go.</p><p>Write to jan.kowalski@example.com</p>",
    },
  ],
})}</script></head><body><main>Ignored when JSON-LD is there</main></body></html>`

describe("readPosting", () => {
  it("reads the JobPosting, without the recruiter's email", async () => {
    const http = fakeHttp({
      "https://careers.example.com/robots.txt": { body: "User-agent: *\nAllow: /" },
      [JOB_URL]: { body: jsonLdPage() },
    })
    const result = await readPosting(JOB_URL, http)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.posting).toMatchObject({
      url: JOB_URL,
      title: "Senior Platform Engineer",
      company: "Example Sp. z o.o.",
      location: "Kraków, PL",
      source: "jsonld",
      withheld: false,
    })
    expect(result.posting.text).toContain("We need Kubernetes and Go.")
    expect(result.posting.text).not.toContain("@example.com")
  })

  it("falls back to the page's own text without navigation or footer", async () => {
    const http = fakeHttp({
      "https://careers.example.com/robots.txt": { status: 404 },
      [JOB_URL]: {
        body: `<html><head><meta property="og:title" content="Data Engineer &amp; Analyst">
<meta property="og:site_name" content="Acme"></head><body><nav>Home Jobs</nav>
<main><h1>Data Engineer</h1><p>SQL and Python.</p></main><footer>© Acme</footer></body></html>`,
      },
    })
    const result = await readPosting(JOB_URL, http)
    expect(result.ok && result.posting).toMatchObject({
      title: "Data Engineer & Analyst",
      company: "Acme",
      location: null,
      source: "page",
    })
    if (!result.ok) return
    expect(result.posting.text).toContain("SQL and Python.")
    expect(result.posting.text).not.toMatch(/Home Jobs|© Acme/)
  })

  it("finds the company in a title that names the role, as Greenhouse's job boards have it", async () => {
    const url = "https://job-boards.greenhouse.io/adyen/jobs/7586281"
    const http = fakeHttp({
      "https://job-boards.greenhouse.io/robots.txt": { body: "" },
      [url]: {
        body: `<html><head><title>Job Application for  Account Manager at Adyen</title>
<meta property="og:title" content=" Account Manager"/></head><body><main>Paris</main></body></html>`,
      },
    })
    const result = await readPosting(url, http)
    expect(result.ok && result.posting).toMatchObject({
      title: "Account Manager",
      company: "Adyen",
    })

    const plain = fakeHttp({
      "https://careers.example.com/robots.txt": { body: "" },
      [JOB_URL]: { body: "<html><head><title>Meet us at Kraków</title></head></html>" },
    })
    const other = await readPosting(JOB_URL, plain)
    expect(other.ok && other.posting.company).toBe("careers.example.com")
  })

  it("keeps no text from a site that opts out of AI use", async () => {
    const http = fakeHttp({
      "https://careers.example.com/robots.txt": { body: "" },
      [JOB_URL]: { body: jsonLdPage('<meta name="tdm-reservation" content="1">') },
    })
    const result = await readPosting(JOB_URL, http)
    expect(result.ok && result.posting).toMatchObject({ withheld: true, text: "" })
  })

  it("respects robots.txt and never fetches LinkedIn", async () => {
    const blocked = fakeHttp({
      "https://careers.example.com/robots.txt": { body: "User-agent: *\nDisallow: /jobs/" },
      [JOB_URL]: { body: jsonLdPage() },
    })
    const robots = await readPosting(JOB_URL, blocked)
    expect(robots).toMatchObject({ ok: false, linkOnly: true })
    expect(blocked.urls).not.toContain(JOB_URL)

    const linkedin = fakeHttp({})
    const refused = await readPosting("https://www.linkedin.com/jobs/view/123", linkedin)
    expect(refused).toMatchObject({ ok: false, linkOnly: true })
    expect(linkedin.urls).toEqual([])
  })

  it("says so when the page holds no offer", async () => {
    const http = fakeHttp({
      "https://careers.example.com/robots.txt": { body: "" },
      [JOB_URL]: { body: "<html><body></body></html>" },
    })
    expect(await readPosting(JOB_URL, http)).toMatchObject({ ok: false, linkOnly: false })
  })
})
