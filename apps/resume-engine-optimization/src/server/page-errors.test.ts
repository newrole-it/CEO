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
  profile: vi.fn(),
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
vi.mock("@newrole/ui/primitives", () => ({ LinkTabs: () => null }))
vi.mock("src/app/profile/ProfileEditor", () => ({ ProfileEditor: () => null }))
vi.mock("src/app/profile/FactList", () => ({ FactList: () => null }))
vi.mock("src/server/profile/facts", () => ({ listFacts: async () => [] }))
vi.mock("src/app/setup/back", () => ({ setupBack: async () => null }))
vi.mock("src/app/users/queries/getCurrentUser", () => ({ default: "getCurrentUser" }))
vi.mock("src/app/profile/queries/getProfile", () => ({ default: "getProfile" }))
vi.mock("src/app/blitz-server", () => ({
  invoke: async (query: string) => {
    if (query === "getCurrentUser") return { id: 7, role: "USER" }
    if (query === "getProfile") return state.profile()
    throw new Error(`unexpected query ${query}`)
  },
}))

import ProfilePage from "src/app/profile/page"

beforeEach(() => {
  state.profile.mockReset()
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
})
