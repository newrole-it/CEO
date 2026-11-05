/**
 * Pure form logic for the content script: labels, field collection, React-safe filling and the
 * never-touch rules. No chrome.* here, so vitest loads it under jsdom
 * (src/server/autofill/form-dom.test.ts).
 *
 * The server classifies fields again (src/server/autofill/fields.ts); the rules here are the
 * second lock: what they refuse is never filled and its value never leaves the browser.
 */
const MAX_FIELDS = 150
const MAX_LABEL = 500
const MAX_VALUE = 10000
const MAX_OPTIONS = 200
const MAX_PAGE_TEXT = 12000

const KNOWN_ATS =
  /(^|\.)(boards\.greenhouse\.io|job-boards\.greenhouse\.io|job-boards\.eu\.greenhouse\.io|jobs\.lever\.co|jobs\.eu\.lever\.co|jobs\.ashbyhq\.com|apply\.workable\.com|teamtailor\.com|recruitee\.com|jobs\.smartrecruiters\.com|jobs\.personio\.de|jobs\.personio\.com|bamboohr\.com|breezy\.hr|pinpointhq\.com|traffit\.com|jobs\.jobvite\.com|myworkdayjobs\.com|icims\.com)$/i

export function knownAts(hostname) {
  return KNOWN_ATS.test(hostname || "")
}

// ------------------------------------------------------------------ text

export function clean(text) {
  return String(text == null ? "" : text)
    .replace(/\s+/g, " ")
    .trim()
}

/** A label without its "required" mark. */
export function cleanLabel(text) {
  return clean(text)
    .replace(/\s*(\*|✱|\(required\)|\(wymagane\)|required|wymagane)\s*$/i, "")
    .trim()
    .slice(0, MAX_LABEL)
}

/** Lowercase, no diacritics, words separated by single spaces. */
export function fold(value) {
  return String(value == null ? "" : value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** The text of a node without the controls inside it (a select's options are not a label). */
function textWithoutControls(node) {
  const copy = node.cloneNode(true)
  const noise = copy.querySelectorAll(
    "select, textarea, input, button, svg, script, style, [aria-hidden='true'], .required, .asterisk"
  )
  noise.forEach((item) => item.remove())
  return clean(copy.textContent)
}

// ------------------------------------------------------------------ never-touch rules

// At least everything src/server/autofill/fields.ts treats as secret, EEO or consent:
// src/server/autofill/extension-privacy.test.ts fails when the two drift apart.
export const SECRET =
  /\b(password|passwort|haslo|cvv|cvc|card number|credit card|debit card|numer karty|karta platnicza|pesel|iban|social security|ssn|national insurance|national id|passport number|numer paszportu|numer dowodu|id number|tax id|nip|bank account|konto bankowe|routing number)\b/
export const EEO =
  /\b(gender|genders|sex|plec|race(?! conditions?)|racial|ethnicity|ethnic|hispanic|latino|latinx|veteran|veterans|military status|disability|disabilities|disabled|niepelnosprawn\w*|pronoun|pronouns|zaimki|age|wiek|date of birth|birth date|birthdate|birthday|data urodzenia|urodzon\w*|sexual orientation|orientacj\w* seksualn\w*|transgender|lgbt\w*|religion|religious|wyznanie|marital|stan cywilny|self identify|self identification|voluntary self|eeo|eeoc|equal employment)\b/
export const CONSENT =
  /\b(privacy (policy|notice|statement)|polityk\w* prywatnosci|rodo|gdpr|data protection|przetwarzani\w*|przetwarzanie danych|processing of (my )?(personal )?data|personal data|danych osobowych|terms (and|of)|terms (and|&) conditions|terms of (use|service)|regulamin\w*|wyrazam zgode|zgod\w*|zgoda|i consent|consent to|consent|future recruitment|przyszlych rekrutac\w*|talent (pool|community)|newsletter|marketing|i acknowledge|acknowledge that|i certify|i confirm|oswiadczam|potwierdzam|i agree|agree to|accept the|akceptuje|zapoznalem|zapoznalam|information clause|klauzul\w*)\b/
export const EEO_SECTION =
  /\b(eeo|self identification|demographic|voluntary self identification|equal opportunit\w*)\b/
const CONTACT =
  /\b(first name|firstname|last name|lastname|surname|family name|given name|full name|your name|imie|nazwisko|e ?mail|phone|telefon\w*|mobile|komork\w*|address|adres|ulica|street|postal|zip|kod pocztowy|city|miasto|miejscowosc|location|lokalizacja|country|kraj|linkedin|linked in|github|git hub|website|portfolio|strona www|twitter|instagram|facebook)\b/
const BARE_NAME = /^name$/
const ASKS_FOR_THEIRS = /\b(your|twoj\w*|swoj\w*)\b/

function descriptor(field) {
  return fold(
    [field.label, field.placeholder, field.name, field.id, field.autocomplete]
      .filter(Boolean)
      .join(" ")
  )
}

/** fold() keeping "?", as the server folds a label: lengths and "is it a question" agree. */
function foldLabel(value) {
  return String(value == null ? "" : value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** True for fields this extension must never fill or report: secrets, EEO, consents. */
export function neverTouch(field) {
  const type = String(field.type || "").toLowerCase()
  const autocomplete = String(field.autocomplete || "").toLowerCase()
  if (type === "password" || type === "hidden") return true
  if (/(^|\s)(cc-|cc\s|new-password|current-password|one-time-code|bday|sex)/.test(autocomplete))
    return true
  const text = descriptor(field)
  if (SECRET.test(text)) return true
  const label = foldLabel(field.label)
  const visible = fold([field.label, field.placeholder].filter(Boolean).join(" "))
  const asked = label.endsWith("?")
  // A question to write about ("How did you build for disabled users?") is about the work.
  const prose = (type === "textarea" || type === "contenteditable") && (label.length > 40 || asked)
  if (!prose && EEO.test(visible || text)) return true
  // No label, only a name or id that says it: <select name="gender"> under a placeholder.
  if (
    !label &&
    EEO.test(fold([field.name, field.id, field.autocomplete].filter(Boolean).join(" ")))
  )
    return true
  if (EEO_SECTION.test(fold(field.section))) return true
  const single = type === "checkbox" && (!field.options || field.options.length < 2)
  if (single) return true
  if ((type === "checkbox" || type === "radio") && CONSENT.test(visible)) return true
  // A long consent statement, whatever control carries it.
  if (CONSENT.test(visible) && label.length > 60 && !asked && !prose) return true
  return false
}

/**
 * Contact details, profile links and files: filled, but their values are not sent after
 * submission. A question about the work can use the same words ("Have you built mobile apps?",
 * "What is the name of the last product you built?"), so it is sent and the server reads it again.
 */
export function isContactField(field) {
  const type = String(field.type || "").toLowerCase()
  if (type === "email" || type === "tel" || type === "file") return true
  const visible = fold([field.label, field.placeholder].filter(Boolean).join(" "))
  if (visible.length > 60) return false
  const question =
    /\?\s*$/.test(String(field.label || "")) ||
    ((type === "textarea" || type === "contenteditable") && visible.length > 40)
  if (question && !ASKS_FOR_THEIRS.test(visible)) return false
  return BARE_NAME.test(visible) || CONTACT.test(visible || descriptor(field))
}

// ------------------------------------------------------------------ labels

function byIdsText(doc, ids) {
  return clean(
    String(ids || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => {
        const node = doc.getElementById(id)
        return node ? textWithoutControls(node) : ""
      })
      .join(" ")
  )
}

/** Text just before a node: a sibling without controls, or one of its ancestors' siblings. */
function nearestPrecedingText(el, stopAt) {
  let node = el
  for (let depth = 0; depth < 5 && node && node !== stopAt; depth++) {
    let sibling = node.previousElementSibling
    for (let hops = 0; hops < 3 && sibling; hops++) {
      if (!sibling.querySelector("input, select, textarea, button")) {
        const text = textWithoutControls(sibling)
        if (text.length >= 2 && text.length <= 300) return text
      }
      sibling = sibling.previousElementSibling
    }
    node = node.parentElement
  }
  return ""
}

/** The visible label of a control: label, ARIA, legend, ATS markup, then nearby text. */
export function labelFor(el) {
  const doc = el.ownerDocument
  const labelledBy = byIdsText(doc, el.getAttribute("aria-labelledby"))
  if (labelledBy) return cleanLabel(labelledBy)
  const labels = el.labels ? Array.from(el.labels) : []
  for (const label of labels) {
    // Lever: the wrapping <label> holds the question in .application-label.
    const part = label.querySelector(".application-label")
    const text = textWithoutControls(part || label)
    if (text) return cleanLabel(text)
  }
  const wrapping = el.closest("label")
  if (wrapping) {
    const text = textWithoutControls(wrapping)
    if (text) return cleanLabel(text)
  }
  const aria = clean(el.getAttribute("aria-label"))
  if (aria) return cleanLabel(aria)
  const question = el.closest(
    ".application-question, [data-qa='question'], [data-automation-id^='formField']"
  )
  if (question) {
    const part = question.querySelector(
      ".application-label, label, legend, [data-automation-id='formLabel']"
    )
    const text = part ? textWithoutControls(part) : ""
    if (text) return cleanLabel(text)
  }
  const fieldset = el.closest("fieldset")
  if (fieldset) {
    const legend = fieldset.querySelector("legend")
    const controls = fieldset.querySelectorAll("input, select, textarea").length
    if (legend && controls === 1) {
      const text = textWithoutControls(legend)
      if (text) return cleanLabel(text)
    }
  }
  const near = nearestPrecedingText(el, el.closest("form"))
  if (near) return cleanLabel(near)
  return cleanLabel(el.getAttribute("placeholder"))
}

/** The question of a radio or checkbox group. */
export function groupLabel(inputs) {
  const first = inputs[0]
  const doc = first.ownerDocument
  const group = first.closest("[role='radiogroup'], [role='group']")
  if (group) {
    const text =
      byIdsText(doc, group.getAttribute("aria-labelledby")) ||
      clean(group.getAttribute("aria-label"))
    if (text) return cleanLabel(text)
  }
  const fieldset = first.closest("fieldset")
  if (fieldset && inputs.every((input) => fieldset.contains(input))) {
    const legend = fieldset.querySelector("legend")
    const text = legend ? textWithoutControls(legend) : ""
    if (text) return cleanLabel(text)
  }
  const question = first.closest(".application-question")
  if (question) {
    const part = question.querySelector(".application-label")
    const text = part ? textWithoutControls(part) : ""
    if (text) return cleanLabel(text)
  }
  let shared = first.parentElement
  while (shared && !inputs.every((input) => shared.contains(input))) shared = shared.parentElement
  return shared ? cleanLabel(nearestPrecedingText(shared, first.closest("form"))) : ""
}

function optionLabel(input) {
  const labels = input.labels ? Array.from(input.labels) : []
  for (const label of labels) {
    const text = textWithoutControls(label)
    if (text) return text.slice(0, MAX_LABEL)
  }
  const wrapping = input.closest("label")
  if (wrapping) {
    const text = textWithoutControls(wrapping)
    if (text) return text.slice(0, MAX_LABEL)
  }
  return clean(input.getAttribute("aria-label") || input.value).slice(0, MAX_LABEL)
}

/** The heading or legend above a field, e.g. "Voluntary Self-Identification". */
export function sectionFor(el, stopAt) {
  const heading = "h1, h2, h3, h4, h5, legend, [role='heading']"
  let node = el
  for (let depth = 0; depth < 8 && node && node !== stopAt; depth++) {
    let sibling = node.previousElementSibling
    for (let hops = 0; hops < 12 && sibling; hops++) {
      const found = sibling.matches(heading) ? sibling : sibling.querySelector(heading)
      if (found) {
        const text = clean(found.textContent)
        if (text) return text.slice(0, MAX_LABEL)
      }
      sibling = sibling.previousElementSibling
    }
    node = node.parentElement
  }
  return ""
}

// ------------------------------------------------------------------ collecting fields

/** jsdom has no layout: rectangle checks only count where a real page has one. */
function hasLayout(doc) {
  const html = doc.documentElement
  return Boolean(html && html.getBoundingClientRect && html.getBoundingClientRect().width > 0)
}

/** Percentages of an inset() clip-path as [top, right, bottom, left], or null for other units. */
function insetPercents(path) {
  const found = /inset\(([^)]*)\)/.exec(path)
  if (!found) return null
  const parts = found[1]
    .split(/\s+round\s+/)[0]
    .trim()
    .split(/\s+/)
  const values = parts.map((part) =>
    /^-?\d*\.?\d+%$/.test(part) ? parseFloat(part) : part === "0" ? 0 : NaN
  )
  if (!values.length || values.some(Number.isNaN)) return null
  const [top, right = top, bottom = top, left = right] = values
  return [top, right, bottom, left]
}

/** Clipped down to nothing: the "visually hidden" pattern, still in the page and still sent. */
function clippedAway(style) {
  const clip = String(style.clip || "")
  if (/rect\(/.test(clip)) {
    const sizes = (clip.match(/-?\d*\.?\d+/g) || []).map(Number)
    if (sizes.length === 4 && (sizes[1] - sizes[3] <= 1 || sizes[2] - sizes[0] <= 1)) return true
  }
  const path = String(style.clipPath || style.webkitClipPath || "")
  const inset = insetPercents(path)
  if (inset && (inset[0] + inset[2] >= 100 || inset[1] + inset[3] >= 100)) return true
  return /circle\(\s*0(px|%)?[\s)]/.test(path) || /ellipse\(\s*0(px|%)?\s/.test(path)
}

/** Transparent or clipped, itself or inside something that is. */
function concealed(el, view) {
  if (!view || !view.getComputedStyle) return false
  let node = el
  for (let depth = 0; node && node.nodeType === 1 && depth < 15; depth++) {
    const style = view.getComputedStyle(node)
    // A custom select keeps its own input transparent and draws the box around it.
    const ownComboInput = node === el && isCombobox(el)
    if (!ownComboInput && style.opacity !== "" && parseFloat(style.opacity) === 0) return true
    if (clippedAway(style)) return true
    node = node.parentElement
  }
  return false
}

/**
 * Whether the person can see a field. A form can hide one in many ways and still read what is
 * filled into it, so a field only counts when it is on the page, opaque and not clipped away.
 */
function isVisible(el) {
  const doc = el.ownerDocument
  const view = doc.defaultView
  if (el.hidden || el.closest("[hidden]")) return false
  const style = view && view.getComputedStyle ? view.getComputedStyle(el) : null
  if (style && (style.display === "none" || style.visibility === "hidden")) return false
  if (concealed(el, view)) return false
  if (hasLayout(doc)) {
    const rect = el.getBoundingClientRect()
    if (rect.width <= 1 && rect.height <= 1) return false
    if (beforeThePage(el, rect, view)) return false
  }
  return true
}

/**
 * Placed above or left of where any scrolling can reach (left: -9999px). Scrolling the window and
 * every box around the field back to the start moves it by at most what they are scrolled now.
 */
function beforeThePage(el, rect, view) {
  const html = el.ownerDocument.documentElement
  let scrolledX = Math.abs(view.scrollX || 0)
  let scrolledY = Math.abs(view.scrollY || 0)
  for (let node = el.parentElement; node && node !== html; node = node.parentElement) {
    scrolledX += Math.abs(node.scrollLeft || 0)
    scrolledY += Math.abs(node.scrollTop || 0)
  }
  // A right-to-left page grows to the left, so only the top counts there.
  const rtl = view.getComputedStyle && view.getComputedStyle(html).direction === "rtl"
  if (!rtl && rect.right + scrolledX <= 0) return true
  return rect.bottom + scrolledY <= 0
}

const SKIPPED_INPUTS = new Set([
  "hidden",
  "password",
  "submit",
  "button",
  "reset",
  "image",
  "search",
  "range",
  "color",
])

function isCombobox(el) {
  return el.getAttribute("role") === "combobox"
}

/** Whether a control is one we may read: visible, enabled, not a password. File inputs are often hidden. */
function usable(el) {
  if (el.disabled) return false
  const tag = el.tagName
  if (tag === "INPUT") {
    const type = (el.getAttribute("type") || "text").toLowerCase()
    if (SKIPPED_INPUTS.has(type)) return false
    if (type === "file") return true
    if (type === "radio" || type === "checkbox") return true
  }
  if (el.getAttribute("aria-hidden") === "true" && !isCombobox(el)) return false
  if (el.readOnly && !isCombobox(el)) return false
  return isVisible(el)
}

function controlType(el) {
  if (el.tagName === "TEXTAREA") return "textarea"
  if (el.tagName === "SELECT") return "select"
  if (el.isContentEditable || el.hasAttribute("contenteditable")) return "contenteditable"
  if (isCombobox(el)) return "select"
  return (el.getAttribute("type") || "text").toLowerCase()
}

function baseField(el, key, stopAt) {
  const label = labelFor(el)
  const raw = clean(
    el.getAttribute("aria-labelledby")
      ? ""
      : (el.labels && el.labels[0] && el.labels[0].textContent) || ""
  )
  const maxLength = el.maxLength > 0 ? el.maxLength : undefined
  return {
    key,
    label,
    name: el.getAttribute("name") || undefined,
    id: el.id || undefined,
    type: controlType(el),
    autocomplete: el.getAttribute("autocomplete") || undefined,
    placeholder: clean(el.getAttribute("placeholder")) || undefined,
    required:
      Boolean(el.required) ||
      el.getAttribute("aria-required") === "true" ||
      /[*✱]\s*$/.test(raw) ||
      undefined,
    maxLength,
    section: sectionFor(el, stopAt) || undefined,
  }
}

/**
 * Everything fillable under a root. Returns the fields for the API and, by key, the elements
 * behind them. Passwords and hidden inputs are never in the list.
 */
export function collectFields(rootEl) {
  const stopAt = rootEl.tagName === "FORM" ? rootEl : null
  const controls = Array.from(
    rootEl.querySelectorAll(
      "input, textarea, select, [contenteditable='true'], [contenteditable='']"
    )
  ).filter(usable)
  const fields = []
  const entries = new Map()
  const grouped = new Set()
  const seen = new Map()
  // Stable across collections, so what the server said about a field still applies at submit.
  const keyFor = (el) => {
    const base = String(el.getAttribute("name") || el.id || "field").slice(0, 200)
    const count = seen.get(base) || 0
    seen.set(base, count + 1)
    return count ? `${base}#${count}` : base
  }
  for (const el of controls) {
    if (fields.length >= MAX_FIELDS) break
    if (grouped.has(el)) continue
    const type = controlType(el)
    const key = keyFor(el)
    if ((type === "radio" || type === "checkbox") && el.name) {
      const group = controls.filter(
        (other) => other.tagName === "INPUT" && other.type === type && other.name === el.name
      )
      group.forEach((other) => grouped.add(other))
      if (group.length > 1) {
        const field = {
          key,
          label: groupLabel(group),
          name: el.name,
          type,
          options: group.map(optionLabel).slice(0, MAX_OPTIONS),
          required: group.some((input) => input.required) || undefined,
          section: sectionFor(group[0], stopAt) || undefined,
        }
        fields.push(field)
        entries.set(key, { field, inputs: group, kind: "group" })
        continue
      }
    }
    const field = baseField(el, key, stopAt)
    if (el.tagName === "SELECT") {
      field.options = Array.from(el.options)
        .map((option) => clean(option.textContent))
        .slice(0, MAX_OPTIONS)
    }
    fields.push(field)
    entries.set(key, { field, el, kind: isCombobox(el) ? "combobox" : "single" })
  }
  return { fields, entries }
}

// ------------------------------------------------------------------ finding the form

function scoreRoot(rootEl) {
  const { fields } = collectFields(rootEl)
  const types = new Set(fields.map((field) => field.type))
  const hasPassword = Boolean(rootEl.querySelector("input[type='password']"))
  const strong =
    types.has("email") ||
    types.has("file") ||
    types.has("textarea") ||
    fields.some((field) => /e ?mail/.test(fold(`${field.label} ${field.name || ""}`)))
  return { count: fields.length, strong, hasPassword }
}

/**
 * The application form on a page: at least 3 visible fields including an email, a file or a
 * textarea (one such field is enough on a known ATS, or when the person asked to fill).
 * Forms with a password are sign-ups or log-ins, never applications.
 */
export function findApplicationRoot(doc, options) {
  const opts = options || {}
  const minimum = opts.force || knownAts(opts.hostname) ? 1 : 3
  const roots = Array.from(doc.querySelectorAll("form"))
  let best = null
  let bestCount = 0
  for (const candidate of roots) {
    const score = scoreRoot(candidate)
    if (score.hasPassword || !score.strong || score.count < minimum) continue
    if (score.count > bestCount) {
      best = candidate
      bestCount = score.count
    }
  }
  if (best) return best
  if (!doc.body) return null
  // Single-page ATS forms often have no <form> at all.
  const body = scoreRoot(doc.body)
  if (body.hasPassword || !body.strong || body.count < minimum) return null
  return doc.body
}

// ------------------------------------------------------------------ filling

function nativeSetter(el) {
  const view = el.ownerDocument.defaultView
  const proto =
    el.tagName === "TEXTAREA"
      ? view.HTMLTextAreaElement.prototype
      : el.tagName === "SELECT"
      ? view.HTMLSelectElement.prototype
      : view.HTMLInputElement.prototype
  const found = Object.getOwnPropertyDescriptor(proto, "value")
  return found && found.set ? found.set : null
}

function fire(el, type) {
  const view = el.ownerDocument.defaultView
  const Ctor = type === "blur" || type === "focus" ? view.FocusEvent : view.Event
  el.dispatchEvent(
    new Ctor(type, { bubbles: type !== "blur" && type !== "focus", cancelable: false })
  )
}

/**
 * Sets a value the way a person would, so React and Vue notice. Their trackers wrap `value`
 * on the element, so the setter must come from the prototype, followed by real events.
 */
export function setNativeValue(el, value) {
  const setter = nativeSetter(el)
  if (setter) setter.call(el, value)
  else el.value = value
  fire(el, "input")
  fire(el, "change")
  fire(el, "blur")
}

function findOption(texts, wanted) {
  const target = fold(wanted)
  if (!target) return -1
  const folded = texts.map(fold)
  let hit = folded.findIndex((text) => text === target)
  if (hit >= 0) return hit
  // Whole words only: "Not sure" must not match the option "No".
  const words = (text) => ` ${text} `
  hit = folded.findIndex((text) => text && words(text).includes(words(target)))
  if (hit >= 0) return hit
  return folded.findIndex((text) => text && words(target).includes(words(text)))
}

function fillSelect(el, value) {
  const options = Array.from(el.options)
  const hit = findOption(
    options.map((option) => option.textContent),
    value
  )
  if (hit < 0) return false
  setNativeValue(el, options[hit].value)
  return true
}

function fillGroup(inputs, value) {
  const hit = findOption(inputs.map(optionLabel), value)
  if (hit < 0) return false
  if (!inputs[hit].checked) inputs[hit].click()
  return true
}

function fillEditable(el, value) {
  const doc = el.ownerDocument
  el.focus()
  let done = false
  try {
    if (typeof doc.execCommand === "function") {
      doc.execCommand("selectAll", false)
      done = doc.execCommand("insertText", false, value)
    }
  } catch (_error) {
    done = false
  }
  if (!done) el.textContent = value
  const view = doc.defaultView
  el.dispatchEvent(new view.Event("input", { bubbles: true }))
  fire(el, "blur")
  return true
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function comboboxOptions(el) {
  const doc = el.ownerDocument
  const listId = el.getAttribute("aria-controls") || el.getAttribute("aria-owns")
  const list = listId ? doc.getElementById(listId) : null
  const scope = list || doc
  return Array.from(scope.querySelectorAll("[role='option']"))
}

function pressKey(el, key) {
  const view = el.ownerDocument.defaultView
  el.dispatchEvent(
    new view.KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true })
  )
}

/** Opens a custom select for a moment to read its options; the form stays as it was. */
async function readComboboxOptions(el) {
  el.focus()
  pressKey(el, "ArrowDown")
  await wait(60)
  const options = comboboxOptions(el).map((option) => clean(option.textContent))
  pressKey(el, "Escape")
  if (el.blur) el.blur()
  return options.slice(0, MAX_OPTIONS)
}

/** Fills in the options of every custom select in a collection. */
export async function enrichComboboxes(entries) {
  for (const entry of entries.values()) {
    if (entry.kind !== "combobox" || neverTouch(entry.field)) continue
    const options = await readComboboxOptions(entry.el)
    if (options.length) entry.field.options = options
  }
}

async function fillCombobox(el, value) {
  el.focus()
  pressKey(el, "ArrowDown")
  await wait(60)
  let options = comboboxOptions(el)
  let hit = findOption(
    options.map((option) => option.textContent),
    value
  )
  if (hit < 0) {
    // Searchable selects load matches as you type.
    const setter = nativeSetter(el)
    if (setter) setter.call(el, value)
    fire(el, "input")
    await wait(250)
    options = comboboxOptions(el)
    hit = findOption(
      options.map((option) => option.textContent),
      value
    )
  }
  if (hit < 0) {
    pressKey(el, "Escape")
    return false
  }
  const option = options[hit]
  const view = el.ownerDocument.defaultView
  option.dispatchEvent(new view.MouseEvent("mousedown", { bubbles: true, cancelable: true }))
  option.dispatchEvent(new view.MouseEvent("mouseup", { bubbles: true, cancelable: true }))
  option.click()
  return true
}

/** Attaches a file the way a drop or the file dialog does. */
export function fillFile(el, file) {
  const view = el.ownerDocument.defaultView
  const Transfer = view.DataTransfer || globalThis.DataTransfer
  const transfer = new Transfer()
  transfer.items.add(file)
  el.files = transfer.files
  fire(el, "input")
  fire(el, "change")
  return true
}

/** What is in a field now, as text. */
export function readValue(entry) {
  if (entry.kind === "group") {
    return entry.inputs
      .filter((input) => input.checked)
      .map(optionLabel)
      .join(", ")
  }
  const el = entry.el
  if (el.tagName === "SELECT") {
    const option = el.options[el.selectedIndex]
    return option && option.value ? clean(option.textContent) : ""
  }
  if (el.isContentEditable || el.hasAttribute("contenteditable")) return clean(el.textContent)
  if (entry.kind === "combobox" && !el.value) {
    const box = el.closest("[class*='control'], [class*='container']")
    const single = box && box.querySelector("[class*='single-value'], [class*='singleValue']")
    return single ? clean(single.textContent) : ""
  }
  if (el.type === "file") return el.files && el.files.length ? el.files[0].name : ""
  if (el.type === "checkbox" || el.type === "radio") return el.checked ? optionLabel(el) : ""
  return String(el.value == null ? "" : el.value)
}

/**
 * Fills one field. Returns "filled", "exists" (the person already typed something),
 * "refused" (never-touch rule) or "failed" (no matching option).
 */
export async function fillEntry(entry, value) {
  if (neverTouch(entry.field)) return "refused"
  if (readValue(entry)) return "exists"
  const text = String(value == null ? "" : value)
  if (!text) return "failed"
  if (entry.kind === "group") return fillGroup(entry.inputs, text) ? "filled" : "failed"
  if (entry.kind === "combobox") return (await fillCombobox(entry.el, text)) ? "filled" : "failed"
  const el = entry.el
  if (el.tagName === "SELECT") return fillSelect(el, text) ? "filled" : "failed"
  if (el.type === "file") return "failed"
  if (el.isContentEditable || el.hasAttribute("contenteditable"))
    return fillEditable(el, text) ? "filled" : "failed"
  if (el.type === "radio" || el.type === "checkbox") return "failed"
  const limit = el.maxLength > 0 ? el.maxLength : MAX_VALUE
  setNativeValue(el, text.slice(0, limit))
  return "filled"
}

// ------------------------------------------------------------------ submission

const SUBMIT_WORDS = /\b(submit\w*|apply|send|wyslij|wyslac|aplikuj|zaaplikuj|zloz)\b/
const NOT_SUBMIT =
  /\b(linked ?in|indeed|google|xing|seek|facebook|next|dalej|nastepn\w*|continue|kontynuuj|back|wstecz|save|zapisz|cancel|anuluj|upload|attach|dodaj|share|udostepnij|apply for this job|apply to this job|aplikuj na to stanowisko)\b/

function buttonText(el) {
  return fold(el.getAttribute("aria-label") || el.value || el.textContent)
}

/** The control behind a click, when it looks like the form's final submit button. */
export function submitLikeTarget(target) {
  if (!target || !target.closest) return null
  const button = target.closest(
    "button, input[type='submit'], input[type='button'], [role='button'], a"
  )
  if (!button) return null
  const text = buttonText(button)
  if (!text || text.length > 60 || !SUBMIT_WORDS.test(text) || NOT_SUBMIT.test(text)) return null
  return button
}

const NEXT_WORDS = /\b(next|dalej|nastepn\w*|continue|kontynuuj|review|przejrzyj|sprawdz)\b/

/** The control behind a click, when it moves a form in steps on to its next step. */
export function nextStepTarget(target) {
  if (!target || !target.closest) return null
  const button = target.closest(
    "button, input[type='button'], input[type='submit'], [role='button']"
  )
  if (!button) return null
  const text = buttonText(button)
  if (!text || text.length > 60 || SUBMIT_WORDS.test(text)) return null
  return NEXT_WORDS.test(text) ? button : null
}

/** Required fields still empty: the site will refuse the submission, so nothing was sent yet. */
export function hasEmptyRequired(collection) {
  for (const entry of collection.entries.values()) {
    if (!entry.field.required || neverTouch(entry.field)) continue
    if (!readValue(entry)) return true
  }
  return false
}

/** An earlier step's values, then this step's. A step visited again replaces what it said. */
export function mergeSteps(earlier, rows) {
  const labels = new Set(rows.map((row) => row.label))
  return [...earlier.filter((row) => !labels.has(row.label)), ...rows].slice(0, MAX_FIELDS)
}

const APPLICATION_WORDS =
  /\b(jobs?|careers?|kariera|karier\w*|praca|oferta pracy|oferty pracy|ogloszeni\w*|apply|applying|application|aplikuj\w*|aplikacj\w*|rekrut\w*|recruit\w*|vacanc\w*|stanowisk\w*|zatrudni\w*|resume|cv)\b/

/**
 * Whether a form just sent is a job application, so it may be recorded without being asked. With
 * all sites allowed the same click can send a message or a contact form, and what was typed in it
 * would land in the tracker. A whole page on an unknown site is never a form on its own.
 */
export function isApplicationForm(scope, doc, href, hostname) {
  if (knownAts(hostname)) return true
  if (!scope || scope === doc.body) return false
  if (scope.querySelector("input[type='file']")) return true
  const text = fold(`${href} ${doc.title} ${String(scope.textContent).slice(0, 20000)}`)
  return APPLICATION_WORDS.test(text)
}

/**
 * Final values of the answers about the work, for the tracker and the answer bank, salary and
 * notice period included. Personal data stays in the browser: secrets, EEO, consents, contact
 * details, links and files are not in this list.
 */
export function snapshot(collection, kinds) {
  const out = []
  for (const [key, entry] of collection.entries) {
    if (neverTouch(entry.field) || isContactField(entry.field)) continue
    const label = entry.field.label
    if (!label) continue
    const value = clean(readValue(entry)) ? readValue(entry) : ""
    if (!value) continue
    const row = { label, value: value.slice(0, MAX_VALUE), type: entry.field.type }
    const kind = kinds && kinds[key]
    if (kind) row.kind = kind
    out.push(row)
  }
  return out
}

// ------------------------------------------------------------------ page

export function pageInfo(doc, href) {
  const site = doc.querySelector("meta[property='og:site_name']")
  const body = doc.body
  const text = body ? body.innerText || body.textContent || "" : ""
  const info = {
    url: href || (doc.location && doc.location.href) || "",
    title: clean(doc.title).slice(0, MAX_LABEL),
    text: String(text)
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_PAGE_TEXT),
  }
  const siteName = site ? clean(site.getAttribute("content")) : ""
  if (siteName) info.siteName = siteName.slice(0, 200)
  return info
}
