import { describe, expect, it } from "vitest"
import { hashCacheKey, isPersonalLlmPurpose, shouldStoreLlmCache } from "./client"

describe("llm cache scope", () => {
  it("keeps a CV prompt out of the shared cache unless it is tied to a user", () => {
    expect(isPersonalLlmPurpose("profile-audit")).toBe(true)
    expect(isPersonalLlmPurpose("candidate-profile")).toBe(true)
    expect(isPersonalLlmPurpose("job-industry")).toBe(false)
    expect(shouldStoreLlmCache("profile-audit")).toBe(false)
    expect(shouldStoreLlmCache("profile-audit", 4)).toBe(true)
    expect(shouldStoreLlmCache("job-industry")).toBe(true)
  })

  it("changes the cache key when the user changes", () => {
    const shared = hashCacheKey("profile-audit", "m", "system", "cv text")
    const first = hashCacheKey("profile-audit", "m", "system", "cv text", 1)
    const second = hashCacheKey("profile-audit", "m", "system", "cv text", 2)
    expect(first).not.toBe(shared)
    expect(first).not.toBe(second)
  })
})
