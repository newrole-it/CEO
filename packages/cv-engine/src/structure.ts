import { z } from "zod"
import type { LlmClient } from "@newrole/llm/common"
import { defaultConsent, emptyCv, SECTION_TITLES, type CvLocale } from "@newrole/cv-core/blank"
import { textToInline } from "@newrole/cv-core/sanitize"
import { cvId, parseCvContent, type CvContent, type CvSection } from "@newrole/cv-core/schema"

/** CV text (from a PDF, pdf.ts) → editable CV: the model structures it; plain text is the fallback. */

const MAX_TEXT = 14_000

const str = z.string().max(6000).catch("")
const list = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(item).max(max).catch([])

const llmSchema = z.object({
  name: str,
  headline: str,
  location: str,
  email: str,
  phone: str,
  links: list(z.object({ label: str, url: str }), 8),
  sections: list(
    z.object({
      type: z.enum(["text", "skills", "experience", "cards", "education"]),
      title: str,
      body: str.optional(),
      items: z
        .array(
          z.object({
            label: str.optional(),
            text: str.optional(),
            company: str.optional(),
            role: str.optional(),
            dates: str.optional(),
            summary: str.optional(),
            bullets: z.array(z.string().max(3000)).max(40).optional(),
            tech: str.optional(),
            title: str.optional(),
            body: str.optional(),
            school: str.optional(),
            degree: str.optional(),
          })
        )
        .max(60)
        .optional(),
    }),
    40
  ),
})

type LlmCv = z.infer<typeof llmSchema>

const SYSTEM = `You turn the text of a CV into structured JSON. Copy the person's wording exactly, in the CV's own language. Never invent, translate, summarise or improve anything; leave a field empty when the CV does not say it. Skip page numbers and consent clauses.

Reply with this shape:
{"name":"","headline":"","location":"","email":"","phone":"","links":[{"label":"linkedin.com/in/x","url":"https://..."}],
"sections":[
 {"type":"text","title":"Profile","body":"paragraph"},
 {"type":"skills","title":"Skills","items":[{"label":"Area","text":"what"}]},
 {"type":"experience","title":"Experience","items":[{"company":"","role":"","dates":"","summary":"one paragraph","bullets":["..."],"tech":"comma list without a label"}]},
 {"type":"cards","title":"Projects","items":[{"title":"","body":""}]},
 {"type":"education","title":"Education","items":[{"school":"","degree":"","dates":""}]},
 {"type":"text","title":"Languages","body":"Polish · English"}
]}
Keep the sections in the order of the CV and use the CV's own section titles. Text fields are plain text.`

function toSection(raw: LlmCv["sections"][number], locale: CvLocale): CvSection | null {
  const id = cvId("s")
  const title = raw.title.trim().slice(0, 120)
  const items = raw.items ?? []
  if (raw.type === "text") {
    const body = textToInline((raw.body ?? "").trim())
    return body ? { id, type: "text", title, body } : null
  }
  if (raw.type === "skills") {
    const parsed = items
      .map((item) => ({
        id: cvId("i"),
        label: (item.label ?? "").trim().replace(/:\s*$/, ""),
        text: textToInline((item.text ?? "").trim()),
      }))
      .filter((item) => item.label || item.text)
    return parsed.length ? { id, type: "skills", title, items: parsed } : null
  }
  if (raw.type === "experience") {
    const techLabel = locale === "pl" ? "Technologie" : "Technology"
    const parsed = items
      .map((item) => {
        const bullets = (item.bullets ?? [])
          .map((bullet) => textToInline(bullet.trim()))
          .filter(Boolean)
        const tech = (item.tech ?? "").trim()
        return {
          id: cvId("i"),
          company: (item.company ?? "").trim(),
          role: (item.role ?? "").trim(),
          dates: (item.dates ?? "").trim(),
          summary: textToInline((item.summary ?? "").trim()),
          bullets,
          tech: tech ? `<strong>${techLabel}:</strong> ${textToInline(tech)}` : "",
          compact: bullets.length === 0,
        }
      })
      .filter((item) => item.company || item.role || item.summary || item.bullets.length)
    return parsed.length ? { id, type: "experience", title, items: parsed } : null
  }
  if (raw.type === "cards") {
    const parsed = items
      .map((item) => ({
        id: cvId("i"),
        title: (item.title ?? "").trim(),
        body: textToInline((item.body ?? "").trim()),
      }))
      .filter((item) => item.title || item.body)
    return parsed.length ? { id, type: "cards", title, items: parsed } : null
  }
  const parsed = items
    .map((item) => ({
      id: cvId("i"),
      school: (item.school ?? "").trim(),
      degree: (item.degree ?? "").trim(),
      dates: (item.dates ?? "").trim(),
    }))
    .filter((item) => item.school || item.degree)
  return parsed.length ? { id, type: "education", title, items: parsed } : null
}

/** The model's reply as a valid CV, or null when it has nothing usable. */
export function cvFromStructured(raw: LlmCv, locale: CvLocale): CvContent | null {
  const sections = raw.sections
    .map((section) => toSection(section, locale))
    .filter((section): section is CvSection => Boolean(section))
  if (!sections.length) return null
  const links = raw.links
    .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
    .filter((link) => /^(https?:\/\/|mailto:|tel:)/i.test(link.url))
  return parseCvContent({
    ...emptyCv(),
    header: {
      name: raw.name.trim().slice(0, 120),
      headline: raw.headline.trim().slice(0, 300),
      location: raw.location.trim().slice(0, 160),
      email: raw.email.trim().slice(0, 200),
      phone: raw.phone.trim().slice(0, 60),
      links: links.slice(0, 8),
      photo: null,
    },
    sections,
    consent: defaultConsent(locale),
  })
}

/** The fallback: the whole text in one section, so the person still has something to edit. */
export function cvFromRawText(text: string, locale: CvLocale): CvContent {
  const body = textToInline(
    text
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 9000)
  )
  return {
    ...emptyCv(),
    sections: [{ id: cvId("s"), type: "text", title: SECTION_TITLES[locale].profile, body }],
    consent: null,
  }
}

function wrapCvText(text: string): string {
  const safe = text.replace(/<\/?untrusted_[a-z0-9_]+>/gi, "").slice(0, MAX_TEXT)
  return `<untrusted_cv>\n${safe}\n</untrusted_cv>`
}

/** Structures CV text with the given model; null means rules only (the fallback). */
export async function structureCvText(input: {
  text: string
  locale: CvLocale
  userId?: number
  llm: LlmClient | null
}): Promise<{ content: CvContent; reader: "llm" | "text" }> {
  const { llm } = input
  if (llm) {
    try {
      const result = await llm.completeJson({
        purpose: "cv-structure",
        system: SYSTEM,
        user: wrapCvText(input.text),
        // .catch() widens the schema's input type; its output is what the client returns
        schema: llmSchema as unknown as z.ZodType<LlmCv>,
        maxTokens: 6000,
        userId: input.userId,
      })
      const content = result?.data ? cvFromStructured(result.data, input.locale) : null
      if (content) return { content, reader: "llm" }
    } catch (error) {
      console.error("cv-structure failed", error instanceof Error ? error.message : error)
    }
  }
  return { content: cvFromRawText(input.text, input.locale), reader: "text" }
}
