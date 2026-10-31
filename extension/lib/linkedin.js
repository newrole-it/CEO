/**
 * Reads the person's own LinkedIn profile page into sections for the audit. Plain DOM, no
 * chrome.*, so a jsdom test runs it as well as the content script. LinkedIn's markup is not an
 * API: sections are found by their anchors and then by their headings, entries by their list
 * items, dates by their shape. Nothing here clicks or loads more.
 */

export const PROFILE_PATH = /^\/in\/([^/]+)\/?$/

/** "jan-kowalski" for /in/jan-kowalski/; null for details, edit and every other page. */
export function profileSlug(pathname) {
  const match = PROFILE_PATH.exec(pathname || "")
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch (_error) {
    return match[1]
  }
}

const HEADINGS = {
  about: /^(about|informacje|o mnie)$/i,
  experience: /^(experience|doświadczenie)$/i,
  education: /^(education|wykształcenie)$/i,
  skills: /^(skills|umiejętności)$/i,
  certifications:
    /^(licenses\s*&\s*certifications|licencje i certyfikaty|certifications|certyfikaty)$/i,
  languages: /^(languages|języki)$/i,
}

const ANCHORS = {
  about: "about",
  experience: "experience",
  education: "education",
  skills: "skills",
  certifications: "licenses_and_certifications",
  languages: "languages",
}

const YEAR = /\b(?:19|20)\d{2}\b/g
const HAS_YEAR = /\b(?:19|20)\d{2}\b/
const PRESENT = /\b(present|current|obecnie|teraz|nadal|dziś)\b/i
const FOOTER = /^(show all|pokaż wszystkie|zobacz wszystkie|wyświetl wszystkie)/i
const TOP_SKILLS = /^(top skills|najważniejsze umiejętności)/i

/** "Jan 2021 - Present · 2 yrs", "sty 2019 – gru 2020", "2010 - 2015". */
export function isDateLine(line) {
  if (!line || line.length > 90) return false
  const years = line.match(YEAR) || []
  if (!years.length) return false
  return years.length >= 2 || PRESENT.test(line) || /[-–—]/.test(line)
}

function clean(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
}

const BLOCKS = new Set(["DIV", "P", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "SECTION", "BR"])

/**
 * Text with the line breaks a person sees. LinkedIn writes most text twice, once for the eye and
 * once for a screen reader, so the hidden copy is skipped; each visible copy is one line, as the
 * spans sit in a column. Nested list items are skipped too: an entry's own lines must not include
 * the entries inside it.
 */
export function textOf(root) {
  const out = []
  const walk = (node) => {
    if (node.nodeType === 3) {
      out.push(node.nodeValue)
      return
    }
    if (node.nodeType !== 1) return
    const tag = node.tagName
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "BUTTON" || tag === "IMG") return
    if (node !== root && tag === "LI") return
    if (node.classList.contains("visually-hidden") || node.classList.contains("a11y-text")) return
    const block = BLOCKS.has(tag) || (tag === "SPAN" && node.getAttribute("aria-hidden") === "true")
    if (block) out.push("\n")
    for (const child of node.childNodes) walk(child)
    if (block) out.push("\n")
  }
  walk(root)
  const lines = out
    .join("")
    .split("\n")
    .map((line) => clean(line))
    .filter(Boolean)
  // Markup without the hidden-copy class still repeats itself: the copies come one after another.
  return lines.filter((line, index) => line !== lines[index - 1]).join("\n")
}

export function linesOf(root) {
  return textOf(root).split("\n").filter(Boolean)
}

function sectionFor(doc, main, key) {
  const anchor = doc.getElementById(ANCHORS[key])
  if (anchor) return anchor.closest("section") || anchor.parentElement
  for (const section of main.querySelectorAll("section")) {
    const heading = section.querySelector("h2")
    if (heading && HEADINGS[key].test(clean(textOf(heading)))) return section
  }
  return null
}

/** The entries of a section: list items that are not inside another item of that section. */
function topItems(section) {
  return [...section.querySelectorAll("li")].filter((item) => {
    const outer = item.parentElement && item.parentElement.closest("li")
    return !outer || !section.contains(outer)
  })
}

function nestedItems(item) {
  return [...item.querySelectorAll("li")].filter(
    (nested) => nested.parentElement && nested.parentElement.closest("li") === item
  )
}

function topCard(main) {
  const heading = main.querySelector("h1")
  if (!heading) return { card: null, name: "", headline: "", location: "" }
  const card = heading.closest("section") || heading.parentElement
  const name = clean(heading.textContent)
  let headline = ""
  const headlineEl = card.querySelector(".text-body-medium")
  if (headlineEl) headline = clean(textOf(headlineEl))
  if (!headline) {
    const lines = linesOf(card)
    headline = lines[lines.indexOf(name) + 1] || ""
  }
  let location = ""
  for (const el of card.querySelectorAll(".text-body-small")) {
    const text = clean(textOf(el))
    if (!text || /\d/.test(text) || /contact|kontakt/i.test(text)) continue
    location = text
    break
  }
  return { card, name, headline, location }
}

function aboutText(section) {
  if (!section) return ""
  const more = section.querySelector(".inline-show-more-text")
  let lines = linesOf(more || section)
  if (!more && lines.length && HEADINGS.about.test(lines[0])) lines = lines.slice(1)
  const topSkills = lines.findIndex((line) => TOP_SKILLS.test(line))
  if (topSkills >= 0) lines = lines.slice(0, topSkills)
  return lines
    .join("\n")
    .replace(/…\s*(see more|more|zobacz więcej|więcej)\s*$/i, "")
    .trim()
}

function looksLocation(line) {
  return (
    line.length < 80 &&
    !/[.!?]$/.test(line) &&
    (/,/.test(line) ||
      /\b(remote|hybrid|on-site|onsite|zdalnie|hybrydowo|stacjonarnie|poland|polska)\b/i.test(line))
  )
}

/** One position from its lines: title, "Company · Full-time", the dates, a place, the text. */
function positionFrom(lines, company) {
  const dateAt = lines.findIndex(isDateLine)
  if (dateAt < 0) {
    return {
      title: lines[0] || "",
      company: company || lines[1] || "",
      dates: "",
      location: "",
      description: lines.slice(company ? 1 : 2).join("\n"),
    }
  }
  const before = lines.slice(0, dateAt)
  const after = lines.slice(dateAt + 1)
  let location = ""
  if (after.length && looksLocation(after[0])) location = after.shift()
  return {
    title: before[0] || "",
    company: company || before[1] || "",
    dates: lines[dateAt],
    location,
    description: after.join("\n"),
  }
}

/** An entry's lines with the text of the items inside it, except items that are entries too. */
function entryLines(item) {
  const own = linesOf(item)
  const extra = nestedItems(item)
    .filter((nested) => !linesOf(nested).some(isDateLine))
    .flatMap((nested) => entryLines(nested))
  return [...own, ...extra].filter((line) => !FOOTER.test(line))
}

function firstLines(section) {
  if (!section) return []
  return topItems(section)
    .map((item) => linesOf(item))
    .filter((lines) => lines.length && !FOOTER.test(lines[0]))
}

/**
 * The sections of the page, in the shape the app's LinkedIn import takes, and the elements they
 * came from, so a note can point back at its place on the page.
 */
export function readProfile(doc) {
  const main = doc.querySelector("main") || doc.body
  const top = topCard(main)
  const sections = {
    name: top.name,
    headline: top.headline,
    location: top.location,
    about: "",
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    languages: [],
  }
  const targets = { top: top.card, about: null, experience: [], education: [], skills: null }

  const about = sectionFor(doc, main, "about")
  sections.about = aboutText(about)
  targets.about = about

  const experience = sectionFor(doc, main, "experience")
  if (experience) {
    for (const item of topItems(experience)) {
      const own = linesOf(item)
      if (!own.length || FOOTER.test(own[0])) continue
      const positions = nestedItems(item).filter((nested) => linesOf(nested).some(isDateLine))
      if (positions.length) {
        // Several roles at one company: the company is the entry, the roles are inside it.
        for (const nested of positions) {
          sections.experience.push(positionFrom(entryLines(nested), own[0]))
          targets.experience.push(nested)
        }
      } else {
        sections.experience.push(positionFrom(entryLines(item)))
        targets.experience.push(item)
      }
    }
  }

  const education = sectionFor(doc, main, "education")
  if (education) {
    for (const item of topItems(education)) {
      const lines = linesOf(item)
      if (!lines.length || FOOTER.test(lines[0])) continue
      const dates = lines.find((line) => line.length < 60 && HAS_YEAR.test(line)) || ""
      sections.education.push({
        school: lines[0],
        degree: lines[1] && lines[1] !== dates ? lines[1] : "",
        dates,
      })
      targets.education.push(item)
    }
  }

  const skills = sectionFor(doc, main, "skills")
  targets.skills = skills
  sections.skills = firstLines(skills).map((lines) => lines[0])

  sections.certifications = firstLines(sectionFor(doc, main, "certifications")).map((lines) =>
    lines[1] && !isDateLine(lines[1]) ? `${lines[0]} · ${lines[1]}` : lines[0]
  )
  sections.languages = firstLines(sectionFor(doc, main, "languages")).map((lines) =>
    lines[1] ? `${lines[0]} · ${lines[1]}` : lines[0]
  )
  return { sections, targets }
}

export function hasContent(sections) {
  return Boolean(
    sections.headline || sections.about || sections.experience.length || sections.skills.length
  )
}

/**
 * Whether the page is the person's own profile. Their own profile has edit controls and no
 * "Connect"; a slug the app already audited counts as well, so the check survives a redesign.
 */
export function ownProfile(doc, pathname, knownSlug) {
  const slug = profileSlug(pathname)
  if (!slug) return false
  if (slug === "me") return true
  if (knownSlug && slug === knownSlug) return true
  const main = doc.querySelector("main") || doc.body
  if (main.querySelector('a[href*="/edit/"], a[href*="/add-edit/"]')) return true
  for (const control of main.querySelectorAll("button, a")) {
    const label = clean(control.getAttribute("aria-label") || "") || clean(textOf(control))
    if (/^(edit|edytuj)\b/i.test(label)) return true
    if (/^(add profile section|dodaj sekcję profilu)/i.test(label)) return true
  }
  return false
}

/** The element on the page a note's section came from, or null. */
export function sectionTarget(targets, sectionId) {
  if (!targets) return null
  if (sectionId === "headline") return targets.top
  if (sectionId === "about") return targets.about
  if (sectionId === "skills") return targets.skills
  const match = /^(experience|education)-(\d+)$/.exec(sectionId)
  if (!match) return null
  return targets[match[1]][Number(match[2]) - 1] || null
}
