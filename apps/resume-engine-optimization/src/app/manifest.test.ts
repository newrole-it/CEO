import { describe, expect, it, vi } from "vitest"
import { translator } from "./i18n/copy"
import { getLocale } from "./i18n/server"
import manifest from "./manifest"

vi.mock("./i18n/server", () => ({ getLocale: vi.fn() }))

describe("the web app manifest", () => {
  it("describes the app in the language of the request", async () => {
    vi.mocked(getLocale).mockResolvedValue("en")
    const english = await manifest()
    expect(english.lang).toBe("en")
    expect(english.description).toBe(translator("en")("meta.description"))

    vi.mocked(getLocale).mockResolvedValue("pl")
    const polish = await manifest()
    expect(polish.lang).toBe("pl")
    expect(polish.description).toBe(translator("pl")("meta.description"))
    expect(polish.description).not.toBe(english.description)
  })
})
