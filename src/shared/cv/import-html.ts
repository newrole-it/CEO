import { emptyCv, type CvLocale } from "./blank"
import { sanitizeInline } from "./sanitize"
import {
  CV_ACCENT,
  cvId,
  MAX_PHOTO_CHARS,
  parseCvContent,
  type CvContent,
  type CvExperienceItem,
  type CvLink,
  type CvSection,
} from "./schema"

/**
 * A CV in the reference HTML layout (header h1 / .headline / .contact / .photo, section h2,
 * .skills .skill, .job / .compact-job with h3 + .role + .dates + p + ul li + .tech, .ventures
 * .venture, .education-item, a languages paragraph, .consent) → CvContent.
 *
 * Takes a Document so it runs on DOMParser in the browser and on jsdom in tests. Anything else
 * in a section is kept as a text section body, so nothing is silently dropped.
 */

const SEP_MARK = ""

function plain(node: Element | null | undefined): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim()
}

/** The separator spans in the reference layout become plain " · " in the body text. */
function inner(node: Element): string {
  const copy = node.cloneNode(true) as Element
  copy
    .querySelectorAll(".sep")
    .forEach((sep) => sep.replaceWith(copy.ownerDocument.createTextNode(SEP_MARK)))
  return sanitizeInline(copy.innerHTML.replace(/\s*\n\s*/g, " ").trim()).replace(/\s*\s*/g, " · ")
}

function isTag(node: Element, ...tags: string[]): boolean {
  return tags.includes(node.tagName.toLowerCase())
}

function readContact(root: Element | null): {
  location: string
  email: string
  phone: string
  links: CvLink[]
} {
  const found = { location: "", email: "", phone: "", links: [] as CvLink[] }
  if (!root) return found
  const classify = (text: string, href: string) => {
    if (/^mailto:/i.test(href)) found.email = text
    else if (/^tel:/i.test(href)) found.phone = text
    else if (/^https?:\/\//i.test(href)) found.links.push({ label: text, url: href })
    else if (text.includes("@") && !found.email) found.email = text
    else if (/^\+?[\d\s()-]{7,}$/.test(text) && !found.phone) found.phone = text
    else if (text && !found.location) found.location = text
  }
  const pieces = [...root.children].filter(
    (child) => isTag(child, "span", "a") && !child.classList.contains("sep")
  )
  for (const piece of pieces) {
    const anchor = isTag(piece, "a") ? piece : piece.querySelector("a")
    classify(plain(piece), anchor?.getAttribute("href")?.trim() ?? "")
  }
  if (!pieces.length) {
    for (const text of plain(root).split(/\s*[·|]\s*/)) classify(text.trim(), "")
  }
  return found
}

function readJob(job: Element): CvExperienceItem {
  const heading = job.querySelector("h3")
  const role = plain(heading?.querySelector(".role")).replace(/^[·•|–—-]\s*/, "")
  let company = plain(heading)
  const roleNode = heading?.querySelector(".role")
  if (heading && roleNode) {
    const copy = heading.cloneNode(true) as Element
    copy.querySelector(".role")?.remove()
    company = plain(copy)
  }
  const paragraphs = [...job.children].filter((child) => isTag(child, "p"))
  const summary = paragraphs.filter((paragraph) => !paragraph.classList.contains("tech"))
  const tech = job.querySelector(".tech")
  const bullets = [...job.querySelectorAll("li")].map((item) => inner(item)).filter(Boolean)
  return {
    id: cvId("i"),
    company,
    role,
    dates: plain(job.querySelector(".dates")),
    summary: summary
      .map((paragraph) => inner(paragraph))
      .filter(Boolean)
      .join("<br>"),
    bullets,
    tech: tech ? inner(tech) : "",
    compact: job.classList.contains("compact-job"),
  }
}

/** One <section> (or the nodes after an h2) → a typed section; null when it has no content. */
function readSection(title: string, nodes: Element[]): CvSection | null {
  const id = cvId("s")
  const within = (selector: string): Element[] =>
    nodes.flatMap((node) => [
      ...(node.matches(selector) ? [node] : []),
      ...node.querySelectorAll(selector),
    ])

  const skills = within(".skill")
  if (skills.length) {
    return {
      id,
      type: "skills",
      title,
      items: skills.map((skill) => {
        const copy = skill.cloneNode(true) as Element
        const strong = copy.querySelector("strong, b")
        const label = plain(strong).replace(/:\s*$/, "")
        strong?.remove()
        return { id: cvId("i"), label, text: inner(copy) }
      }),
    }
  }
  const jobs = within(".job, .compact-job")
  if (jobs.length) {
    return { id, type: "experience", title, items: jobs.map(readJob) }
  }
  const ventures = within(".venture")
  if (ventures.length) {
    return {
      id,
      type: "cards",
      title,
      items: ventures.map((venture) => {
        const heading = venture.querySelector("h3, h4")
        const body = [...venture.querySelectorAll("p")]
          .map((paragraph) => inner(paragraph))
          .filter(Boolean)
          .join("<br>")
        return { id: cvId("i"), title: plain(heading), body }
      }),
    }
  }
  const schools = within(".education-item")
  if (schools.length) {
    return {
      id,
      type: "education",
      title,
      items: schools.map((school) => ({
        id: cvId("i"),
        school: plain(school.querySelector("strong, b")),
        degree: plain(school.querySelector(".small")),
        dates: plain(school.querySelector(".dates")),
      })),
    }
  }
  const body = nodes
    .map((node) => inner(node))
    .filter(Boolean)
    .join("<br>")
  return body ? { id, type: "text", title, body } : null
}

/** The sections of the document: <section> elements with an h2, or a flat h2 + siblings. */
function readSections(root: Element): CvSection[] {
  const out: CvSection[] = []
  const sections = [...root.querySelectorAll("section")].filter((section) =>
    section.querySelector("h2")
  )
  if (sections.length) {
    for (const section of sections) {
      const heading = section.querySelector("h2")
      const nodes = [...section.children].filter((child) => child !== heading)
      const parsed = readSection(plain(heading), nodes)
      if (parsed) out.push(parsed)
    }
    return out
  }
  root.querySelectorAll("h2").forEach((heading) => {
    const nodes: Element[] = []
    let next = heading.nextElementSibling
    while (next && !isTag(next, "h2")) {
      if (!next.classList.contains("consent")) nodes.push(next)
      next = next.nextElementSibling
    }
    const parsed = readSection(plain(heading), nodes)
    if (parsed) out.push(parsed)
  })
  return out
}

/** Accent colour from the document's :root variables, when it declares one. */
function readAccent(doc: Document): string {
  const css = [...doc.querySelectorAll("style")].map((style) => style.textContent ?? "").join("\n")
  const match = css.match(/--accent\s*:\s*(#[0-9a-fA-F]{6})\b/)
  return match ? match[1] : CV_ACCENT
}

function readLocale(doc: Document): CvLocale {
  return doc.documentElement?.getAttribute("lang")?.toLowerCase().startsWith("en") ? "en" : "pl"
}

/**
 * Parses the document. Throws when it does not look like a CV at all (no name and no
 * sections), so the UI can say so instead of creating an empty document.
 */
export function importCvHtml(doc: Document): {
  content: CvContent
  language: CvLocale
  title: string
} {
  const body = doc.body
  const header = body.querySelector("header") ?? body
  const name = plain(header.querySelector("h1"))
  const contact = readContact(header.querySelector(".contact"))
  const photoNode = header.querySelector("img.photo, .photo img, img")
  const photoSrc = photoNode?.getAttribute("src")?.trim() ?? ""
  const photoData = photoSrc.replace(/\s+/g, "").replace(/^data:image\/jpg;/, "data:image/jpeg;")
  const photo =
    /^data:image\/(?:jpeg|png|webp);base64,/.test(photoData) && photoData.length <= MAX_PHOTO_CHARS
      ? photoData
      : null
  const sections = readSections(body)
  if (!name && !sections.length) throw new Error("not-a-cv")

  const consent = plain(body.querySelector(".consent"))
  const language = readLocale(doc)
  const content: CvContent = {
    ...emptyCv(),
    header: {
      name,
      headline: plain(header.querySelector(".headline")),
      location: contact.location,
      email: contact.email,
      phone: contact.phone,
      links: contact.links.slice(0, 8),
      photo,
    },
    sections,
    consent: consent || null,
    theme: { accent: readAccent(doc) },
  }
  const parsed = parseCvContent(content)
  if (!parsed) throw new Error("not-a-cv")
  return { content: parsed, language, title: name ? `CV ${name}` : "CV" }
}
