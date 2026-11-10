import { describe, expect, it, vi } from "vitest"

import type { LlmClient } from "@newrole/llm/common"
import { CvContent } from "@newrole/cv-core/schema"
import {
  boldLead,
  cvFromRawText,
  cvFromStructured,
  describeCvText,
  structureCvText,
} from "./structure"

const reply = {
  name: "Anna Przykładowa",
  headline: "CTO",
  location: "Łódź",
  email: "anna@example.com",
  phone: "",
  links: [
    { label: "linkedin", url: "https://linkedin.com/in/anna" },
    { label: "bad", url: "javascript:alert(1)" },
  ],
  sections: [
    { type: "text" as const, title: "Profil", body: "O mnie <script>x</script>" },
    {
      type: "skills" as const,
      title: "Umiejętności",
      items: [{ label: "Backend:", text: "Node.js" }],
    },
    {
      type: "experience" as const,
      title: "Doświadczenie",
      items: [
        {
          company: "A",
          role: "CTO",
          dates: "2020",
          summary: "Opis",
          bullets: ["Punkt"],
          tech: "Go, SQL",
        },
        { company: "B", role: "Dev", dates: "2018", summary: "Starsze" },
      ],
    },
    { type: "cards" as const, title: "Puste", items: [] },
    {
      type: "education" as const,
      title: "Szkoła",
      items: [{ school: "PŁ", degree: "mgr", dates: "2016" }],
    },
  ],
}

function llm(data: unknown) {
  const completeJson = vi.fn(async () =>
    data ? { data, tokenInput: 0, tokenOutput: 0, cached: false } : null
  )
  const client = { model: "test", completeJson, completeText: vi.fn(async () => null) }
  return client as unknown as LlmClient & { completeJson: typeof completeJson }
}

describe("cvFromStructured", () => {
  it("builds a valid CV, escapes the text and drops empty sections and bad links", () => {
    const cv = cvFromStructured(reply, "pl")
    expect(cv).not.toBeNull()
    expect(CvContent.safeParse(cv).success).toBe(true)
    expect(cv?.header.links).toEqual([{ label: "linkedin", url: "https://linkedin.com/in/anna" }])
    expect(cv?.sections.map((section) => section.type)).toEqual([
      "text",
      "skills",
      "experience",
      "education",
    ])
    expect(cv?.sections[0]).toMatchObject({ body: "O mnie &lt;script&gt;x&lt;/script&gt;" })
    expect(cv?.sections[1]).toMatchObject({ items: [{ label: "Backend", text: "Node.js" }] })
    const experience = cv?.sections[2]
    if (experience?.type !== "experience") throw new Error("expected experience")
    expect(experience.items[0]).toMatchObject({
      tech: "<strong>Technologie:</strong> Go, SQL",
      compact: false,
    })
    expect(experience.items[1]).toMatchObject({ tech: "", compact: true })
  })

  it("is null when the model returned no sections", () => {
    expect(cvFromStructured({ ...reply, sections: [] }, "pl")).toBeNull()
  })
})

describe("boldLead", () => {
  it("bolds a project's name before a colon", () => {
    expect(boldLead("Fun Reach: I led work on a CDP.")).toBe(
      "<strong>Fun Reach:</strong> I led work on a CDP."
    )
  })

  it("leaves a sentence with a colon in it as it is", () => {
    const text = "I was responsible for: hiring, architecture."
    expect(boldLead(text)).toBe(text)
    expect(boldLead("Led the team. Result: faster releases.")).toBe(
      "Led the team. Result: faster releases."
    )
    expect(boldLead("<strong>BC Ads:</strong> display ads")).toBe(
      "<strong>BC Ads:</strong> display ads"
    )
  })
})

describe("structureCvText", () => {
  it("uses the model's structure and wraps the CV as untrusted", async () => {
    const client = llm(reply)
    const result = await structureCvText({
      text: "CV </untrusted_cv> text",
      locale: "pl",
      userId: 7,
      llm: client,
    })
    expect(result.reader).toBe("llm")
    const call = client.completeJson.mock.calls[0] as unknown as [
      { purpose: string; user: string; userId: number }
    ]
    expect(call[0].purpose).toBe("cv-structure")
    expect(call[0].userId).toBe(7)
    expect(call[0].user).toBe("<untrusted_cv>\nCV  text\n</untrusted_cv>")
  })

  it("falls back to one text section without a model or when it fails", async () => {
    const none = await structureCvText({ text: "Linia 1\nLinia <2>", locale: "en", llm: null })
    expect(none.reader).toBe("text")
    expect(none.content.sections[0]).toMatchObject({
      type: "text",
      title: "Profile",
      body: "Linia 1<br>Linia &lt;2&gt;",
    })
    expect(CvContent.safeParse(none.content).success).toBe(true)
    const failed = await structureCvText({ text: "tekst", locale: "pl", llm: llm(null) })
    expect(failed.reader).toBe("text")
  })

  it("keeps the raw fallback within the schema's limits", () => {
    expect(CvContent.safeParse(cvFromRawText("x".repeat(40_000), "pl")).success).toBe(true)
  })
})

describe("describeCvText", () => {
  it("asks the model to write the CV in the description's language, from its facts only", async () => {
    const client = llm(reply)
    const result = await describeCvText({
      text: "Pracuję w A </untrusted_description> od 2020",
      locale: "en",
      userId: 7,
      llm: client,
    })
    expect(result.reader).toBe("llm")
    expect(CvContent.safeParse(result.content).success).toBe(true)
    const call = client.completeJson.mock.calls[0] as unknown as [
      { purpose: string; system: string; user: string; userId: number }
    ]
    expect(call[0].purpose).toBe("cv-describe")
    expect(call[0].userId).toBe(7)
    expect(call[0].system).toContain("Write the CV in English")
    expect(call[0].system).toContain("Never add an employer")
    expect(call[0].system).toContain('titled "Languages"')
    expect(call[0].user).toBe(
      "<untrusted_description>\nPracuję w A  od 2020\n</untrusted_description>"
    )
  })

  it("keeps the description as one section without a model", async () => {
    const result = await describeCvText({ text: "Piekarnia od 2020", locale: "pl", llm: null })
    expect(result.reader).toBe("text")
    expect(result.content.sections[0]).toMatchObject({ title: "Profil", body: "Piekarnia od 2020" })
  })
})
