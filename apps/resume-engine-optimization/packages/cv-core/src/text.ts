import { inlineToText } from "./sanitize"
import type { CvContent } from "./schema"

/** A CV as plain text for prompts and for reading in chat. Hidden sections are left out. */
export function cvPlainText(content: CvContent): string {
  const lines: string[] = []
  const header = content.header
  if (header.name.trim()) lines.push(header.name.trim())
  if (header.headline.trim()) lines.push(header.headline.trim())
  const contact = [header.location, header.email, header.phone]
    .map((value) => value.trim())
    .filter(Boolean)
  if (contact.length) lines.push(contact.join(" · "))
  for (const link of header.links) {
    const value = [link.label.trim(), link.url.trim()].filter(Boolean).join(": ")
    if (value) lines.push(value)
  }
  for (const section of content.sections) {
    if (section.hidden) continue
    if (section.type === "letter") {
      lines.push("")
      const head = [section.date, section.recipient, section.subject, section.greeting]
      const paragraphs = section.paragraphs.map((paragraph) => inlineToText(paragraph))
      for (const line of [...head, ...paragraphs, section.closing, section.signature]) {
        if (line.trim()) lines.push(line.trim())
      }
      continue
    }
    lines.push("", section.title.trim().toUpperCase())
    if (section.type === "text") {
      lines.push(inlineToText(section.body))
    } else if (section.type === "skills") {
      for (const item of section.items) {
        const label = item.label.trim().replace(/:\s*$/, "")
        lines.push(`${label ? `${label}: ` : ""}${inlineToText(item.text)}`)
      }
    } else if (section.type === "experience") {
      for (const item of section.items) {
        const head = [item.company.trim(), item.role.trim()].filter(Boolean).join(" · ")
        lines.push(`${head}${item.dates.trim() ? ` (${item.dates.trim()})` : ""}`)
        const summary = inlineToText(item.summary)
        if (summary.trim()) lines.push(summary)
        for (const bullet of item.bullets) {
          const text = inlineToText(bullet)
          if (text.trim()) lines.push(`- ${text}`)
        }
        const tech = inlineToText(item.tech)
        if (tech.trim()) lines.push(tech)
      }
    } else if (section.type === "cards") {
      for (const item of section.items) {
        lines.push(item.title.trim())
        const body = inlineToText(item.body)
        if (body.trim()) lines.push(body)
      }
    } else {
      for (const item of section.items) {
        const school = [item.school.trim(), item.degree.trim()].filter(Boolean).join(", ")
        lines.push(`${school}${item.dates.trim() ? ` (${item.dates.trim()})` : ""}`)
      }
    }
  }
  return lines.join("\n").trim()
}

/** One section as plain text, without the header: what a reader sees of it. */
export function sectionPlainText(content: CvContent, sectionId: string): string {
  const section = content.sections.find((entry) => entry.id === sectionId)
  if (!section) return ""
  const header = { ...content.header, name: "", headline: "", location: "", email: "", phone: "" }
  return cvPlainText({ ...content, header: { ...header, links: [] }, sections: [section] }).trim()
}
