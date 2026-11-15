/**
 * Content script: finds the application form, shows a small panel, fills fields on request and
 * records the submission. It never submits a form. Logic that needs no chrome.* is in form.js.
 */
import * as F from "./form.js"
import { readOffer, statusLine } from "./offer.js"
import { COPY, localeOf, translator } from "./copy.js"
import { formatDate, pluralKind } from "./i18n.js"
import { connectionError, element, send, session } from "./page.js"

export function startContent() {
  // Injected again from the popup, or by both the manifest and the all-sites script.
  if (globalThis.__newRoleContent) return
  globalThis.__newRoleContent = true

  const locale = localeOf(navigator.language)
  const t = translator(locale)

  const PURPLE = "#5b3df5"
  const YELLOW = "#e6a700"
  // The app writes the letter apart: Chrome stops waiting for a response after 30 s.
  const LETTER_POLL_MS = 2000
  const LETTER_WAIT_MS = 4 * 60 * 1000

  const state = {
    config: { connected: false, apiBase: "http://127.0.0.1:43123", autoTrack: true },
    root: null,
    kinds: {},
    job: null,
    sent: false,
    busy: false,
    forced: false,
    href: location.href,
    statusFor: null,
    // Answers from earlier steps of the form. In memory only: page scripts can read sessionStorage.
    earlier: [],
    stepDialog: null,
  }

  const dismissKey = () => `nr-dismissed:${location.pathname}`
  // With the query: on LinkedIn's search page each offer is ?currentJobId= on the same path.
  const sentKey = () => `nr-submitted:${location.pathname}${location.search}`

  // -------------------------------------------------------------------- panel

  const STYLE = `
    :host { all: initial; }
    .panel {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      display: grid; gap: 8px; width: 280px; max-height: 70vh; overflow: auto; padding: 12px;
      box-sizing: border-box; border-radius: 12px; border: 1px solid #e4e4ec;
      background: #fff; color: #14141f; box-shadow: 0 8px 24px rgb(20 20 31 / 0.18);
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 650; }
    .x { all: unset; cursor: pointer; padding: 0 6px; font-size: 16px; line-height: 1; color: #55556a; }
    .x:focus-visible, .btn:focus-visible, .link:focus-visible { outline: 2px solid ${PURPLE}; outline-offset: 2px; }
    .btn {
      all: unset; box-sizing: border-box; display: block; width: 100%; padding: 8px 10px; cursor: pointer;
      border-radius: 8px; text-align: center; font-weight: 600; background: ${PURPLE}; color: #fff;
    }
    .btn[disabled] { opacity: 0.6; cursor: default; }
    .btn.alt { background: #f0f0f5; color: #14141f; }
    .msg { color: #55556a; }
    .err { color: #c8281c; }
    .ok { color: #0b7a52; }
    .list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
    .link { all: unset; cursor: pointer; color: ${PURPLE}; text-decoration: underline; overflow-wrap: anywhere; }
    .hidden { display: none; }
    @media (prefers-color-scheme: dark) {
      .panel { background: #15161d; color: #f2f2f7; border-color: #2a2b36; }
      .x, .msg { color: #a7a7b8; }
      .btn.alt { background: #24252f; color: #f2f2f7; }
      .link { color: #a99bff; }
      .ok { color: #4cc794; }
      .err { color: #ff8a80; }
    }
  `

  const ui = {
    host: null,
    title: null,
    main: null,
    save: null,
    message: null,
    letter: null,
    list: null,
    toast: null,
  }

  function ensurePanel() {
    if (ui.host) {
      ui.host.style.display = ""
      return
    }
    const host = document.createElement("div")
    host.setAttribute("data-newrole", "panel")
    const shadow = host.attachShadow({ mode: "closed" })
    try {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(STYLE)
      shadow.adoptedStyleSheets = [sheet]
    } catch (_error) {
      shadow.append(element("style", "", STYLE))
    }
    const panel = element("div", "panel")
    panel.setAttribute("role", "region")
    panel.setAttribute("aria-label", "newrole.it")
    const head = element("div", "head")
    ui.title = element("span", "", "newrole.it")
    const close = element("button", "x", "×")
    close.type = "button"
    close.setAttribute("aria-label", t("fill.hide"))
    close.addEventListener("click", () => {
      session("set", dismissKey())
      host.style.display = "none"
    })
    head.append(ui.title, close)
    ui.main = element("button", "btn", t("fill.main"))
    ui.main.type = "button"
    ui.main.addEventListener("click", () => void onMainClick())
    ui.save = element("button", "btn alt", t("fill.save"))
    ui.save.type = "button"
    ui.save.addEventListener("click", () => void saveManually())
    ui.message = element("div", "msg hidden")
    ui.message.setAttribute("aria-live", "polite")
    ui.letter = element("div", "msg hidden")
    ui.letter.setAttribute("aria-live", "polite")
    ui.list = element("ul", "list hidden")
    ui.toast = element("div", "ok hidden")
    ui.toast.setAttribute("role", "status")
    panel.append(head, ui.main, ui.save, ui.message, ui.letter, ui.list, ui.toast)
    shadow.append(panel)
    document.documentElement.append(host)
    ui.host = host
    refreshPanel()
  }

  function say(text, tone) {
    if (!ui.message) return
    ui.message.textContent = text || ""
    ui.message.className = `${tone === "error" ? "err" : "msg"}${text ? "" : " hidden"}`
  }

  function refreshPanel() {
    if (!ui.main) return
    ui.main.textContent = t(state.config.connected ? "fill.main" : "fill.connect")
    ui.main.disabled = state.busy
    ui.save.className = state.config.connected ? "btn alt" : "btn alt hidden"
    ui.save.disabled = state.busy
  }

  function appLink(path) {
    return `${state.config.apiBase}${path}`
  }

  /** "Zapisano w trackerze: Firma · Stanowisko" with a link to the application. */
  function showSaved(application) {
    ensurePanel()
    ui.toast.textContent = ""
    ui.toast.className = "ok"
    const link = element("a", "link", `${application.company} · ${application.title}`)
    link.href = appLink(`/applications?id=${encodeURIComponent(application.id)}`)
    link.target = "_blank"
    link.rel = "noreferrer noopener"
    // One sentence with the link inside it: the words around {link} differ between languages.
    const [before, after] = t("fill.saved", { link: "\u0000" }).split("\u0000")
    ui.toast.append(before, link, after ?? "")
  }

  /** The cover letter's line, with a link to the letter in the app when it is kept there. */
  function showLetter(text, tone, documentId) {
    if (!ui.letter) return
    ui.letter.textContent = text || ""
    ui.letter.className = `${tone === "error" ? "err" : "msg"}${text ? "" : " hidden"}`
    if (!text || !documentId) return
    const link = element("a", "link", t("fill.letter.open"))
    link.href = appLink(`/cv/${encodeURIComponent(documentId)}`)
    link.target = "_blank"
    link.rel = "noreferrer noopener"
    ui.letter.append(" ", link)
  }

  function showDrafts(drafts) {
    ui.list.textContent = ""
    ui.list.className = drafts.length ? "list" : "list hidden"
    for (const draft of drafts) {
      const item = element("li")
      const link = element("button", "link", draft.label || t("fill.noLabel"))
      link.type = "button"
      link.addEventListener("click", () => {
        draft.target.scrollIntoView({ block: "center", behavior: "smooth" })
        if (draft.target.focus) draft.target.focus({ preventScroll: true })
      })
      item.append(link)
      ui.list.append(item)
    }
  }

  // -------------------------------------------------------------------- marking

  function markTarget(entry) {
    if (entry.kind === "group")
      return entry.inputs[0].closest("fieldset") || entry.inputs[0].parentElement
    const el = entry.el
    if (el.type === "file")
      return el.getBoundingClientRect().width > 1 ? el : el.parentElement || el
    if (entry.kind === "combobox") return el.closest("[class*='control']") || el
    return el
  }

  function mark(entry, source) {
    const target = markTarget(entry)
    if (!target || !target.style) return target
    const color = source === "ai" ? YELLOW : PURPLE
    target.style.setProperty("outline", `2px solid ${color}`, "important")
    target.style.setProperty("outline-offset", "1px", "important")
    target.title = t(source === "ai" ? "fill.badge.ai" : "fill.badge.filled")
    return target
  }

  // -------------------------------------------------------------------- filling

  function base64File(data) {
    const binary = atob(data.base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new File([bytes], data.name || "CV.pdf", { type: data.type || "application/pdf" })
  }

  /** A failed call in the person's language. What the server said is never shown. */
  function errorText(result) {
    return connectionError(result, t) ?? t("err.generic.retry")
  }

  /** The page for the server, with the company and role its own data names, when it does. */
  function pageFacts() {
    const info = F.pageInfo(document, location.href)
    const offer = readOffer(document, location.href)
    return offer?.company ? { ...info, company: offer.company, role: offer.title } : info
  }

  async function runFill() {
    if (state.busy) return { ok: false, error: "busy" }
    const root = currentRoot(true)
    if (!root) {
      ensurePanel()
      say(t("fill.noForm"), "error")
      return { ok: false, error: "no-form" }
    }
    ensurePanel()
    state.busy = true
    refreshPanel()
    say(t("fill.reading"))
    showDrafts([])
    showLetter("")
    try {
      const collection = F.collectFields(root)
      await F.enrichComboboxes(collection.entries)
      // Secrets, EEO and consents do not even leave the page as labels.
      const fields = collection.fields.filter((field) => !F.neverTouch(field))
      if (!fields.length) {
        say(t("err.no-fields"), "error")
        return { ok: false, error: "no-fields" }
      }
      say(t("fill.working"))
      const result = await send("fill", { page: pageFacts(), fields })
      if (!result.ok) {
        if (result.status === 401) await refreshConfig()
        say(errorText(result), "error")
        return { ok: false, error: result.error }
      }
      const summary = await applyValues(collection, result.data)
      say(summaryText(summary, result.data.applied))
      showDrafts(summary.drafts)
      if (result.data.job) {
        state.job = { company: result.data.job.company, title: result.data.job.title }
        ui.title.textContent = `${result.data.job.company} · ${result.data.job.title}`
      }
      const letterId = result.data.letter?.id
      if (letterId && summary.letters.length) {
        showLetter(t("fill.letter.working"))
        const done = await waitForLetter(letterId)
        if (!done.letter) {
          showLetter(done.error, "error")
        } else {
          const outcome = await fillLetter(summary.letters, letterId, done.letter)
          showDrafts([...summary.drafts, ...outcome.drafts])
          showLetter(letterLine(done.letter, outcome), outcome.error ? "error" : "", outcome.link)
        }
      }
      return { ok: true }
    } finally {
      state.busy = false
      refreshPanel()
    }
  }

  async function applyValues(collection, data) {
    const summary = {
      profile: 0,
      answers: 0,
      ai: 0,
      cv: 0,
      kept: 0,
      skipped: 0,
      cvError: null,
      drafts: [],
      // Filled once the letter is written: { entry }
      letters: [],
    }
    // By CV id: the CV written for this offer, or the default one when there is none.
    const cvs = new Map()
    for (const value of data.values) {
      const entry = collection.entries.get(value.key)
      if (!entry) continue
      state.kinds[value.key] = value.kind
      if (value.source === "skip") {
        summary.skipped += 1
        continue
      }
      if (value.source === "letter") {
        if (entry.el && !F.neverTouch(entry.field)) summary.letters.push({ entry })
        continue
      }
      if (value.source === "cv") {
        if (F.readValue(entry)) {
          summary.kept += 1
          continue
        }
        const id = value.documentId || ""
        if (!cvs.has(id)) cvs.set(id, await send("cv", id ? { id } : {}))
        const cv = cvs.get(id)
        if (!cv.ok) {
          summary.cvError = cv.status === 404 ? t("fill.cv.none") : errorText(cv)
          continue
        }
        F.fillFile(entry.el, base64File(cv.data))
        mark(entry, "cv")
        summary.cv += 1
        continue
      }
      const outcome = await F.fillEntry(entry, value.value)
      if (outcome === "filled") {
        const target = mark(entry, value.source)
        summary[value.source] += 1
        if (value.source === "ai") summary.drafts.push({ label: entry.field.label, target })
      } else if (outcome === "exists") {
        summary.kept += 1
      } else {
        summary.skipped += 1
      }
    }
    return summary
  }

  function summaryText(summary, applied) {
    const known = summary.profile + summary.answers + summary.cv
    // Each part is a sentence of its own, so no language has to fit another's word order.
    const parts = [t("fill.sum.filled", { n: known })]
    if (summary.ai) parts.push(t("fill.sum.ai", { n: summary.ai }))
    if (summary.kept) parts.push(t("fill.sum.kept", { n: summary.kept }))
    if (summary.skipped) parts.push(t("fill.sum.skipped", { n: summary.skipped }))
    parts.push(t("fill.sum.check"))
    if (summary.cvError) parts.push(summary.cvError)
    if (applied) {
      parts.push(t("fill.sum.applied", { date: formatDate(applied.appliedAt, locale) }))
    }
    return parts.join(" ")
  }

  // -------------------------------------------------------------------- cover letter

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /** The letter the fill started, asked for every 2 s: { letter } or { error }. */
  async function waitForLetter(id) {
    const until = Date.now() + LETTER_WAIT_MS
    while (Date.now() < until) {
      await wait(LETTER_POLL_MS)
      const result = await send("letter", { id })
      if (result.status === 404) return { error: t("fill.letter.err.gone") }
      if (!result.ok) return { error: errorText(result) }
      if (result.data?.status === "done") return { letter: result.data.letter }
      if (result.data?.status === "failed") {
        const key = `fill.letter.err.${result.data.code}`
        return { error: t(key in COPY.pl ? key : "fill.letter.err.failed") }
      }
    }
    return { error: t("fill.letter.err.timeout") }
  }

  /**
   * The letter in its text boxes, marked as a draft to read. One letter per application: the PDF
   * goes to a file field only when the form has no text box for the letter.
   */
  async function fillLetter(letters, id, letter) {
    const outcome = { filled: 0, attached: 0, kept: 0, drafts: [], error: null, link: null }
    const live = letters.map(({ entry }) => entry).filter((entry) => entry.el.isConnected)
    const boxes = live.filter((entry) => entry.el.type !== "file")
    for (const entry of boxes) {
      const result = await F.fillEntry(entry, letter.text)
      if (result === "filled") {
        outcome.filled += 1
        outcome.drafts.push({ label: entry.field.label, target: mark(entry, "ai") })
      } else if (result === "exists") {
        outcome.kept += 1
      }
    }
    if (!boxes.length) {
      for (const entry of live) {
        if (F.readValue(entry)) {
          outcome.kept += 1
          continue
        }
        const file = await send("letterFile", { id })
        if (!file.ok) {
          outcome.error = file.status === 404 ? t("fill.letter.err.pdf") : errorText(file)
          break
        }
        F.fillFile(entry.el, base64File(file.data))
        outcome.attached += 1
        outcome.drafts.push({ label: entry.field.label, target: mark(entry, "ai") })
      }
    }
    if (letter.documentId) outcome.link = letter.documentId
    return outcome
  }

  function letterLine(letter, outcome) {
    if (outcome.error) return outcome.error
    if (!outcome.filled && !outcome.attached) return outcome.kept ? t("fill.letter.kept") : ""
    const past = letter.pastLetters
    const how = !letter.created
      ? "existing"
      : letter.general
        ? "fromGeneral"
        : past > 0
          ? `fromPast.${pluralKind(past, locale)}`
          : "new"
    const attached = outcome.attached && !outcome.filled ? ".attached" : ""
    return t(`fill.letter.${how}${attached}`, { n: past })
  }

  async function onMainClick() {
    if (!state.config.connected) {
      await send("openOptions", {})
      return
    }
    await runFill()
  }

  // -------------------------------------------------------------------- tracking

  function markSent() {
    state.sent = true
    session("set", sentKey())
  }

  async function report(fields) {
    const result = await send("submitted", {
      page: pageFacts(),
      job: state.job || undefined,
      fields,
    })
    if (result.ok) {
      showSaved(result.data.application)
      // Shown here, so the next page in this tab should not repeat it.
      await send("takeToast", {})
    }
    return result
  }

  function snapshotFields() {
    const root = currentRoot(state.forced)
    const rows = root ? F.snapshot(F.collectFields(root), state.kinds) : []
    return F.mergeSteps(state.earlier, rows)
  }

  /** A form in steps shows only the current one, so each is kept until the form is sent. */
  function rememberStep(scope, button) {
    state.earlier = F.mergeSteps(state.earlier, F.snapshot(F.collectFields(scope), state.kinds))
    state.stepDialog = button.closest("[role='dialog']")
  }

  function forgetSteps() {
    state.earlier = []
    state.stepDialog = null
  }

  /**
   * A last step often has no fields, so no form is found there. Only the step before it vouches
   * for the button: the same open dialog, or a known ATS. Elsewhere "Wyślij" may be a chat. (i18n-ignore: names a button on the page)
   */
  function endsSteps(button) {
    if (!state.earlier.length) return false
    if (state.stepDialog) return state.stepDialog.isConnected && state.stepDialog.contains(button)
    return F.knownAts(location.hostname)
  }

  async function saveManually() {
    if (state.busy) return { ok: false, error: "busy" }
    ensurePanel()
    state.busy = true
    refreshPanel()
    say(t("fill.saving"))
    try {
      const result = await report(snapshotFields())
      if (!result.ok) {
        say(errorText(result), "error")
        return { ok: false, error: result.error }
      }
      markSent()
      forgetSteps()
      say("")
      return { ok: true, application: result.data.application }
    } finally {
      state.busy = false
      refreshPanel()
    }
  }

  /** The values are read now: the page may clear them or navigate right after this event. */
  function onSubmission(root) {
    if (state.sent || !state.config.connected || !state.config.autoTrack) return
    if (!F.isApplicationForm(root, document, location.href, location.hostname)) return
    if (root.tagName === "FORM" && !root.noValidate && !root.checkValidity()) return
    const collection = F.collectFields(root)
    if (F.hasEmptyRequired(collection)) return
    const anything =
      state.earlier.length || [...collection.entries.values()].some((entry) => F.readValue(entry))
    if (!anything) return
    const fields = F.mergeSteps(state.earlier, F.snapshot(collection, state.kinds))
    markSent()
    forgetSteps()
    void report(fields).then((result) => {
      if (result.ok) return
      // Nothing was saved, so a second attempt may report again.
      state.earlier = fields
      state.sent = false
      try {
        sessionStorage.removeItem(sentKey())
      } catch (_error) {}
      ensurePanel()
      say(t("fill.notSaved", { reason: errorText(result) }), "error")
    })
  }

  document.addEventListener(
    "submit",
    (event) => {
      // A page can dispatch a synthetic submit to plant an application and answers.
      if (event.isTrusted === false) return
      const root = state.root
      if (root && event.target && (root === event.target || root.contains(event.target)))
        onSubmission(root)
    },
    true
  )

  document.addEventListener(
    "click",
    (event) => {
      if (event.isTrusted === false) return
      const root = state.root && state.root.isConnected ? state.root : null
      const next = F.nextStepTarget(event.target)
      if (next) {
        const dialog = next.closest("[role='dialog']")
        const scope = dialog || (root && root.contains(next) ? root : next.closest("form"))
        if (scope) rememberStep(scope, next)
        return
      }
      const button = F.submitLikeTarget(event.target)
      if (!button) return
      const dialog = button.closest("[role='dialog']")
      if (root && root.contains(button))
        onSubmission(dialog && root.contains(dialog) ? dialog : root)
      else if (endsSteps(button)) onSubmission(dialog || button.closest("form") || document.body)
    },
    true
  )

  // -------------------------------------------------------------------- finding the form

  function currentRoot(force) {
    if (state.root && state.root.isConnected) return state.root
    state.root = F.findApplicationRoot(document, {
      hostname: location.hostname,
      force: Boolean(force),
    })
    return state.root
  }

  async function refreshConfig() {
    const result = await send("config", {})
    if (result.ok) state.config = result.data
    refreshPanel()
  }

  function scan() {
    if (location.href !== state.href) {
      // Single-page navigation: a new posting, a new submission.
      state.href = location.href
      state.root = null
      state.job = null
      state.kinds = {}
      state.sent = Boolean(session("get", sentKey()))
      forgetSteps()
    }
    // Answers of a closed dialog must not travel to the next offer opened on the same page.
    if (state.stepDialog && !state.stepDialog.isConnected) forgetSteps()
    if (window.innerWidth < 250) return
    const root = currentRoot(state.forced)
    if (root && !session("get", dismissKey())) {
      ensurePanel()
      void showApplied()
    }
  }

  /** Warns as soon as the form shows, so nobody applies to the same posting twice. */
  async function showApplied() {
    const href = location.href
    if (state.statusFor === href || !state.config.connected) return
    if (state.config.offerCheck === false) return
    state.statusFor = href
    const result = await send("status", { url: href })
    if (result.ok && result.data?.applied && location.href === href && !state.busy) {
      say(statusLine(result.data, t, locale))
    }
  }

  let timer = null
  function scheduleScan() {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      scan()
    }, 800)
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "nr:fill" && message?.type !== "nr:save") return false
    state.forced = true
    const root = currentRoot(true)
    // Greenhouse embeds: the form is in one frame. Frames without one stay silent so that their
    // answer cannot beat the real one; with no answer at all the popup says there is no form.
    // Saving the page as an application also works with no form, from the top frame.
    if (!root && !(message.type === "nr:save" && window.top === window)) return false
    const action = message.type === "nr:fill" ? runFill() : saveManually()
    action.then(sendResponse, (error) =>
      sendResponse({ ok: false, error: String(error?.message || error) })
    )
    return true
  })

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") void refreshConfig()
  })

  async function start() {
    state.sent = Boolean(session("get", sentKey()))
    await refreshConfig()
    const toast = await send("takeToast", {})
    if (toast.ok && toast.data) showSaved(toast.data)
    scan()
    // Forms that render late, and single-page ATS.
    new MutationObserver(scheduleScan).observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
  }

  void start()
}
