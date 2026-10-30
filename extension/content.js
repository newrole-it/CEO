/**
 * Content script: finds the application form, shows a small panel, fills fields on request and
 * records the submission. It never submits a form. Logic that needs no chrome.* is in lib/form.js.
 */
;(function () {
  "use strict"

  // Injected again from the popup, or by both the manifest and the all-sites script.
  if (globalThis.__nowaRolaContent) return
  globalThis.__nowaRolaContent = true

  const F = globalThis.NowaRolaForm
  const PURPLE = "#5b3df5"
  const YELLOW = "#e6a700"

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
  }

  function send(type, payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (response) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: "disconnected" })
          else resolve(response || { ok: false, error: "disconnected" })
        })
      } catch (_error) {
        // The extension was reloaded; this page's script is orphaned.
        resolve({ ok: false, error: "disconnected" })
      }
    })
  }

  function session(action, key) {
    try {
      if (action === "get") return sessionStorage.getItem(key)
      sessionStorage.setItem(key, "1")
    } catch (_error) {}
    return null
  }

  const dismissKey = () => `nr-dismissed:${location.pathname}`
  const sentKey = () => `nr-submitted:${location.pathname}`

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
    list: null,
    toast: null,
  }

  function element(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text != null) node.textContent = text
    return node
  }

  function ensurePanel() {
    if (ui.host) {
      ui.host.style.display = ""
      return
    }
    const host = document.createElement("div")
    host.setAttribute("data-nowarola", "panel")
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
    panel.setAttribute("aria-label", "Nowa Rola")
    const head = element("div", "head")
    ui.title = element("span", "", "Nowa Rola")
    const close = element("button", "x", "×")
    close.type = "button"
    close.setAttribute("aria-label", "Ukryj")
    close.addEventListener("click", () => {
      session("set", dismissKey())
      host.style.display = "none"
    })
    head.append(ui.title, close)
    ui.main = element("button", "btn", "Wypełnij z Nowa Rola")
    ui.main.type = "button"
    ui.main.addEventListener("click", () => void onMainClick())
    ui.save = element("button", "btn alt", "Zapisz jako aplikację")
    ui.save.type = "button"
    ui.save.addEventListener("click", () => void saveManually())
    ui.message = element("div", "msg hidden")
    ui.message.setAttribute("aria-live", "polite")
    ui.list = element("ul", "list hidden")
    ui.toast = element("div", "ok hidden")
    ui.toast.setAttribute("role", "status")
    panel.append(head, ui.main, ui.save, ui.message, ui.list, ui.toast)
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
    ui.main.textContent = state.config.connected ? "Wypełnij z Nowa Rola" : "Połącz rozszerzenie"
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
    ui.toast.append("Zapisano w trackerze: ", link)
  }

  function showDrafts(drafts) {
    ui.list.textContent = ""
    ui.list.className = drafts.length ? "list" : "list hidden"
    for (const draft of drafts) {
      const item = element("li")
      const link = element("button", "link", draft.label || "Pole bez etykiety")
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
    target.title =
      source === "ai" ? "Nowa Rola: szkic AI, sprawdź przed wysłaniem" : "Nowa Rola: uzupełnione"
    return target
  }

  // -------------------------------------------------------------------- filling

  function base64File(data) {
    const binary = atob(data.base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new File([bytes], data.name || "CV.pdf", { type: data.type || "application/pdf" })
  }

  function errorText(result) {
    if (result.status === 401 || result.error === "not-connected") {
      return "Rozszerzenie nie jest połączone. Połącz je ponownie."
    }
    if (result.error === "offline")
      return "Nie mogę połączyć się z aplikacją. Czy Nowa Rola jest uruchomiona?"
    if (result.error === "disconnected")
      return "Rozszerzenie zostało przeładowane. Odśwież tę stronę."
    return result.error || "Coś poszło nie tak. Spróbuj ponownie."
  }

  async function runFill() {
    if (state.busy) return { ok: false, error: "busy" }
    const root = currentRoot(true)
    if (!root) {
      ensurePanel()
      say("Nie widzę tu formularza do wypełnienia.", "error")
      return { ok: false, error: "no-form" }
    }
    ensurePanel()
    state.busy = true
    refreshPanel()
    say("Czytam formularz…")
    showDrafts([])
    try {
      const collection = F.collectFields(root)
      await F.enrichComboboxes(collection.entries)
      // Secrets, EEO and consents do not even leave the page as labels.
      const fields = collection.fields.filter((field) => !F.neverTouch(field))
      if (!fields.length) {
        say("Nie widzę tu pól do wypełnienia.", "error")
        return { ok: false, error: "no-fields" }
      }
      say("Uzupełniam z Twoich danych. Pytania otwarte mogą potrwać kilka sekund…")
      const result = await send("fill", { page: F.pageInfo(document, location.href), fields })
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
    }
    let cv = null
    for (const value of data.values) {
      const entry = collection.entries.get(value.key)
      if (!entry) continue
      state.kinds[value.key] = value.kind
      if (value.source === "skip") {
        summary.skipped += 1
        continue
      }
      if (value.source === "cv") {
        if (F.readValue(entry)) {
          summary.kept += 1
          continue
        }
        if (!cv) cv = await send("cv", {})
        if (!cv.ok) {
          summary.cvError = cv.status === 404 ? "Nie masz jeszcze CV w PDF." : errorText(cv)
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

  function formatDate(value) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pl-PL")
  }

  function summaryText(summary, applied) {
    const known = summary.profile + summary.answers + summary.cv
    const parts = [`Uzupełniono: ${known}`]
    if (summary.ai) parts.push(`szkice AI do sprawdzenia: ${summary.ai}`)
    if (summary.kept) parts.push(`zostawione bez zmian: ${summary.kept}`)
    if (summary.skipped) parts.push(`pominięte: ${summary.skipped}`)
    let text = `${parts.join(", ")}. Sprawdź formularz i wyślij go sam.`
    if (summary.cvError) text += ` ${summary.cvError}`
    if (applied) text += ` Już aplikowano: ${formatDate(applied.appliedAt)}.`
    return text
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
      page: F.pageInfo(document, location.href),
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
    return root ? F.snapshot(F.collectFields(root), state.kinds) : []
  }

  async function saveManually() {
    if (state.busy) return { ok: false, error: "busy" }
    ensurePanel()
    state.busy = true
    refreshPanel()
    say("Zapisuję…")
    try {
      const result = await report(snapshotFields())
      if (!result.ok) {
        say(errorText(result), "error")
        return { ok: false, error: result.error }
      }
      markSent()
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
    if (root.tagName === "FORM" && !root.noValidate && !root.checkValidity()) return
    const collection = F.collectFields(root)
    if (F.hasEmptyRequired(collection)) return
    const anything = [...collection.entries.values()].some((entry) => F.readValue(entry))
    if (!anything) return
    const fields = F.snapshot(collection, state.kinds)
    markSent()
    void report(fields).then((result) => {
      if (result.ok) return
      // Nothing was saved, so a second attempt may report again.
      state.sent = false
      try {
        sessionStorage.removeItem(sentKey())
      } catch (_error) {}
      ensurePanel()
      say(`Nie zapisano w trackerze. ${errorText(result)}`, "error")
    })
  }

  document.addEventListener(
    "submit",
    (event) => {
      const root = state.root
      if (root && event.target && (root === event.target || root.contains(event.target)))
        onSubmission(root)
    },
    true
  )

  document.addEventListener(
    "click",
    (event) => {
      const root = state.root
      if (!root || event.isTrusted === false) return
      const button = F.submitLikeTarget(event.target)
      if (button && root.contains(button)) onSubmission(root)
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
    }
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
    state.statusFor = href
    const result = await send("status", { url: href })
    if (result.ok && result.data?.applied && location.href === href && !state.busy) {
      say(`Już aplikowano: ${formatDate(result.data.applied.appliedAt)}.`)
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
})()
