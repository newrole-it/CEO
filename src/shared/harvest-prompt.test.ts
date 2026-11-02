import { describe, expect, it } from "vitest"
import { cronFor, harvestPrompt } from "./harvest-prompt"

describe("harvest prompt", () => {
  it("never asks for more than one run an hour, and avoids the top of the hour", () => {
    expect(cronFor(60)).toBe("7 * * * *")
    expect(cronFor(120)).toBe("7 */2 * * *")
    expect(cronFor(360)).toBe("7 */6 * * *")
    expect(cronFor(1440)).toBe("7 5 * * *")
  })

  it("names the agent's own branch and the interval the sync page reads back", () => {
    const prompt = harvestPrompt("cursor", 360)
    expect(prompt).toContain("npm run harvest -- --agent cursor --every 360")
    expect(prompt).toContain("cursor/newrole-harvest")
  })
})
