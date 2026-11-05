import { describe, expect, it } from "vitest"
import { rememberCompanyPage } from "./company-pages"

describe("company pages a search reads for JSON-LD", () => {
  it("keeps Synerise job pages from search and skips link-only hosts", () => {
    const pages: string[] = []
    rememberCompanyPage(pages, "https://www.synerise.com/api/cms/job-postings")
    rememberCompanyPage(pages, "https://revolut.com/careers/position/abc")
    rememberCompanyPage(pages, "https://www.synerise.com/careers")
    rememberCompanyPage(pages, "https://www.synerise.com/careers/data-engineer")
    rememberCompanyPage(pages, "https://example.com/about")
    rememberCompanyPage(pages, "https://example.com/jobs/1")
    rememberCompanyPage(pages, "https://example.com/jobs/2")
    expect(pages).toEqual([
      "https://www.synerise.com/careers/data-engineer",
      "https://example.com/about",
      "https://example.com/jobs/1",
    ])
  })
})
