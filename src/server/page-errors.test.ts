import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

// the test transform compiles JSX to React.createElement, which Next does for the real pages
Object.assign(globalThis, { React })

/**
 * Pages that load data must tell "not there" from "the database failed": the first is a 404 or
 * an empty state, the second has to reach error.tsx instead of posing as missing data.
 */

// read only when a mocked function is called, so the hoisted vi.mock factories may refer to it
const state = {
  detail: vi.fn(),
  profile: vi.fn(),
  summary: vi.fn(),
}

vi.mock("db", () => ({ default: {} }))
vi.mock("next/link", () => ({ default: () => null }))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}))
vi.mock("src/app/i18n/server", () => ({ getLocale: async () => "pl" }))
vi.mock("src/app/components/site/SiteFrame", () => ({ SiteFrame: () => null }))
vi.mock("src/app/components/ds/primitives", () => ({ LinkTabs: () => null }))
vi.mock("src/app/jobs/[id]/OfferPage", () => ({ OfferPage: () => null }))
vi.mock("src/app/profile/ProfileEditor", () => ({ ProfileEditor: () => null }))
vi.mock("src/app/users/queries/getCurrentUser", () => ({ default: "getCurrentUser" }))
vi.mock("src/app/profile/queries/getProfile", () => ({ default: "getProfile" }))
vi.mock("src/app/blitz-server", () => ({
  invoke: async (query: string) => {
    if (query === "getCurrentUser") return { id: 7, role: "USER" }
    if (query === "getProfile") return state.profile()
    throw new Error(`unexpected query ${query}`)
  },
}))
vi.mock("src/server/preferences/detail", () => ({
  getOfferDetail: (...args: unknown[]) => state.detail(...args),
}))
vi.mock("src/server/preferences/model", () => ({
  getPreferenceSummary: (...args: unknown[]) => state.summary(...args),
}))

import OfferDetailPage, { generateMetadata } from "src/app/jobs/[id]/page"
import ProfilePage from "src/app/profile/page"

const params = Promise.resolve({ id: "job-1" })

beforeEach(() => {
  state.detail.mockReset()
  state.profile.mockReset()
  state.summary.mockReset()
  state.summary.mockResolvedValue(null)
})

describe("offer page", () => {
  it("answers 404 when the offer is gone", async () => {
    state.detail.mockResolvedValue(null)
    await expect(OfferDetailPage({ params })).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("lets a database failure reach the error page instead of a 404", async () => {
    state.detail.mockRejectedValue(new Error("connection refused"))
    await expect(OfferDetailPage({ params })).rejects.toThrow("connection refused")
  })

  it("names the offer itself as canonical, not the home page", async () => {
    state.detail.mockResolvedValue({ offer: { title: "Backend Developer", company: "Acme" } })
    const metadata = await generateMetadata({ params })
    expect(metadata.title).toBe("Backend Developer · Acme")
    expect(metadata.alternates?.canonical).toBe("/jobs/job-1")
  })

  it("titles a missing offer as gone and does not fake a title on a failure", async () => {
    state.detail.mockResolvedValue(null)
    expect((await generateMetadata({ params })).title).toBe("Ta oferta nie jest już dostępna.")
    state.detail.mockRejectedValue(new Error("connection refused"))
    await expect(generateMetadata({ params })).rejects.toThrow("connection refused")
  })
})

describe("profile page", () => {
  it("renders the empty profile when there is none", async () => {
    state.profile.mockResolvedValue({ draft: null })
    await expect(ProfilePage()).resolves.toBeTruthy()
  })

  it("lets a database failure reach the error page instead of showing no profile", async () => {
    state.profile.mockRejectedValue(new Error("connection refused"))
    await expect(ProfilePage()).rejects.toThrow("connection refused")
  })

  it("still renders the profile when only the taste summary fails", async () => {
    state.profile.mockResolvedValue({ draft: null })
    state.summary.mockRejectedValue(new Error("summary broke"))
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(ProfilePage()).resolves.toBeTruthy()
    error.mockRestore()
  })
})
