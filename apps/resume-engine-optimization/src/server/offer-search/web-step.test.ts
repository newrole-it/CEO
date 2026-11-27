import { describe, expect, test } from "vitest"
import type { ClaudeRunArgs } from "@newrole/llm/claude-cli"
import { filtersFromProfile } from "./filters"
import { findCandidates, parseCandidates, searchPrompt } from "./web-step"

describe("web step", () => {
  test("the prompt holds the filters and nothing about the person", () => {
    const f = {
      ...filtersFromProfile(null),
      roles: ["Data Engineer"],
      skills: ["dbt"],
      places: ["Wrocław"],
    }
    const { system, prompt } = searchPrompt(f, new Date("2026-11-27"))
    expect(prompt).toContain("Data Engineer")
    expect(prompt).toContain("dbt")
    expect(prompt).toContain("Wrocław")
    expect(prompt).toContain("2026-11-27")
    expect(system).toContain("12")
    expect(system).toContain("25")
    expect(prompt).not.toMatch(/minimum pay/i)
    expect(prompt).not.toMatch(/\bany\b/i)
  })

  test("parseCandidates keeps unique http links, capped", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ url: `https://jobs.lever.co/acme/${i}` }))
    const text = `Here you go:\n${JSON.stringify({
      offers: [
        { url: "https://boards.greenhouse.io/x/jobs/1?utm_source=a" },
        { url: "https://boards.greenhouse.io/x/jobs/1" },
        { url: "javascript:alert(1)" },
        { url: "not a url" },
        ...many,
      ],
    })}`
    const urls = parseCandidates(text)
    expect(urls[0]).toContain("greenhouse.io/x/jobs/1")
    expect(urls.filter((u) => u.includes("greenhouse"))).toHaveLength(1)
    expect(urls.every((u) => u.startsWith("http"))).toBe(true)
    expect(urls).toHaveLength(25)
  })

  test("parseCandidates drops a link longer than 2048 characters", () => {
    const at = (length: number) => {
      const head = `https://jobs.lever.co/acme/${length}/`
      return head + "a".repeat(length - head.length)
    }
    const text = JSON.stringify({ offers: [{ url: at(2049) }, { url: at(2048) }] })
    expect(parseCandidates(text)).toEqual([at(2048)])
  })

  test("parseCandidates gives [] for prose", () => {
    expect(parseCandidates("Sorry, nothing found.")).toEqual([])
  })

  test("findCandidates passes WebSearch only, and reports a failed run", async () => {
    const calls: ClaudeRunArgs[] = []
    const ok = await findCandidates(filtersFromProfile(null), {
      today: new Date(),
      run: async (a) => {
        calls.push(a)
        return { text: '{"offers":[{"url":"https://jobs.lever.co/a/1"}]}' }
      },
    })
    expect(ok).toEqual({ ok: true, urls: ["https://jobs.lever.co/a/1"] })
    expect(calls[0].allowedTools).toEqual(["WebSearch"])
    expect(calls[0].purpose).toBe("offer-search")
    expect(calls[0].maxTurns).toBe(16)
    expect(
      await findCandidates(filtersFromProfile(null), { today: new Date(), run: async () => null })
    ).toEqual({ ok: false, code: "web-failed" })
    expect(
      await findCandidates(filtersFromProfile(null), {
        today: new Date(),
        run: async () => {
          throw new Error("boom")
        },
      })
    ).toEqual({ ok: false, code: "web-failed" })
  })
})
