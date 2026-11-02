import { describe, expect, it } from "vitest"
import { canonicalUrl } from "./dedupe"

describe("canonicalUrl", () => {
  it("keeps the Greenhouse job id and drops Greenhouse and UTM tracking", () => {
    expect(canonicalUrl("https://stripe.com/jobs/search?gh_jid=123&gh_src=abc&utm_source=x")).toBe(
      "https://stripe.com/jobs/search?gh_jid=123"
    )
    expect(canonicalUrl("https://stripe.com/jobs/search?gh_jid=1")).not.toBe(
      canonicalUrl("https://stripe.com/jobs/search?gh_jid=2")
    )
  })
})
