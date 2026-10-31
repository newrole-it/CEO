/**
 * Content script on linkedin.com: on the person's own profile it reads the sections, sends them
 * to the app and shows the audit in a panel: the score, what to change, and text to paste. The
 * page is never edited; the person makes every change in LinkedIn's own editor.
 */
import * as L from "./linkedin.js"
import { connectionError, element, formatDate, send, session } from "./page.js"

export function startLinkedIn(options = {}) {
  if (globalThis.__nowaRolaLinkedIn) return
  globalThis.__nowaRolaLinkedIn = true
  if (window.top !== window) return

  const PURPLE = "#5b3df5"
  /** The page must look the same twice, this far apart, before it is sent: sections load late. */
  const SETTLE_MS = options.settleMs ?? 2500
  /** Between two audits of one page, so an edit in progress does not become five audits. */
  const MIN_GAP_MS = options.minGapMs ?? 20_000

  const state = {
    config: {
      connected: false,
      apiBase: "http://127.0.0.1:43123",
      linkedinAuto: true,
      linkedinSlug: null,
    },
    href: location.href,
    busy: false,
    stage: "",
    audit: null,
    error: null,
    targets: null,
    sent: "",
    sentAt: 0,
    settling: "",
    settlingAt: 0,
    forced: false,
  }

  const dismissKey = () => `nr-linkedin-dismissed:${L.profileSlug(location.pathname) || ""}`

  // -------------------------------------------------------------------- panel

  const STYLE = `
    :host { all: initial; }
    .panel {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      display: grid; gap: 10px; width: 340px; max-height: 80vh; overflow: auto; padding: 14px;
      box-sizing: border-box; border-radius: 12px; border: 1px solid #e4e4ec;
      background: #fff; color: #14141f; box-shadow: 0 8px 24px rgb(20 20 31 / 0.18);
      font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 650; }
    .x { all: unset; cursor: pointer; padding: 0 6px; font-size: 16px; line-height: 1; color: #55556a; }
    .x:focus-visible, .btn:focus-visible, .link:focus-visible, .small:focus-visible, summary:focus-visible {
      outline: 2px solid ${PURPLE}; outline-offset: 2px;
    }
    .btn {
      all: unset; box-sizing: border-box; display: block; width: 100%; padding: 8px 10px; cursor: pointer;
      border-radius: 8px; text-align: center; font-weight: 600; background: ${PURPLE}; color: #fff;
    }
    .btn[disabled] { opacity: 0.6; cursor: default; }
    .btn.alt { background: #f0f0f5; color: #14141f; }
    .msg { color: #55556a; }
    .err { color: #c8281c; }
    .score { display: flex; align-items: baseline; gap: 8px; }
    .score b { font-size: 34px; line-height: 1; font-weight: 700; }
    .score.good b { color: #0b7a52; }
    .score.mid b { color: ${PURPLE}; }
    .score.low b { color: #b45309; }
    .score span { color: #55556a; }
    h3 { margin: 4px 0 0; font-size: 13px; font-weight: 650; }
    .notes { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .note { display: grid; gap: 4px; padding: 8px 10px; border-radius: 8px; background: #f7f7fa; }
    .chip { display: inline-block; padding: 1px 6px; border-radius: 999px; font-size: 11px; font-weight: 600; background: #ece8ff; color: #4326d9; }
    .chip.keywords { background: #ffe9d6; color: #9a3412; }
    .chip.gaps { background: #ffe1e0; color: #a4221a; }
    .chip.format { background: #e3f2ea; color: #0b5c3f; }
    .where { font-size: 11px; color: #55556a; }
    .quote { font-style: italic; color: #55556a; overflow-wrap: anywhere; }
    .rewrite { white-space: pre-wrap; padding: 6px 8px; border-left: 3px solid ${PURPLE}; background: #fff; overflow-wrap: anywhere; }
    .row { display: flex; gap: 6px; flex-wrap: wrap; }
    .small { all: unset; cursor: pointer; padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; background: #ece8ff; color: #4326d9; }
    .small.done { background: #e3f2ea; color: #0b5c3f; }
    details > summary { cursor: pointer; font-weight: 650; }
    details .notes { margin-top: 8px; }
    .demand { margin: 0; padding-left: 18px; color: #14141f; }
    .demand li { margin: 2px 0; }
    .link { all: unset; cursor: pointer; color: ${PURPLE}; text-decoration: underline; overflow-wrap: anywhere; }
    .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .foot .btn { width: auto; padding: 6px 10px; }
    .hidden { display: none; }
    @media (prefers-color-scheme: dark) {
      .panel { background: #15161d; color: #f2f2f7; border-color: #2a2b36; }
      .x, .msg, .where, .quote, .score span { color: #a7a7b8; }
      .btn.alt { background: #24252f; color: #f2f2f7; }
      .note { background: #1d1e27; }
      .rewrite { background: #15161d; }
      .link { color: #a99bff; }
      .err { color: #ff8a80; }
      .score.good b { color: #4cc794; }
      .score.mid b { color: #a99bff; }
      .score.low b { color: #f0b35b; }
      .chip { background: #2c2559; color: #c9bfff; }
      .chip.keywords { background: #4a2a13; color: #ffc89a; }
      .chip.gaps { background: #4a1f1c; color: #ffb3ad; }
      .chip.format { background: #163a2b; color: #9be0c2; }
      .small { background: #2c2559; color: #c9bfff; }
      .small.done { background: #163a2b; color: #9be0c2; }
    }
  `

  const ui = { host: null, body: null }

  function ensurePanel() {
    if (ui.host) {
      ui.host.style.display = ""
      return
    }
    const host = document.createElement("div")
    host.setAttribute("data-nowarola", "linkedin")
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
    panel.setAttribute("aria-label", "Nowa Rola: ocena profilu LinkedIn")
    const head = element("div", "head")
    const close = element("button", "x", "×")
    close.type = "button"
    close.setAttribute("aria-label", "Ukryj")
    close.addEventListener("click", () => {
      session("set", dismissKey())
      host.style.display = "none"
    })
    head.append(element("span", "", "Nowa Rola · Profil LinkedIn"), close)
    ui.body = element("div", "")
    ui.body.style.display = "grid"
    ui.body.style.gap = "10px"
    ui.body.setAttribute("aria-live", "polite")
    panel.append(head, ui.body)
    shadow.append(panel)
    document.documentElement.append(host)
    ui.host = host
  }

  function hidePanel() {
    if (ui.host) ui.host.style.display = "none"
  }

  function appLink(path) {
    return `${state.config.apiBase}${path}`
  }

  function errorText(result) {
    const known = connectionError(result)
    if (known) return known
    if (result.error === "no-sections")
      return "Nie widzę tu sekcji profilu. Przewiń stronę, żeby LinkedIn je załadował, i spróbuj ponownie."
    return result.error || "Coś poszło nie tak. Spróbuj ponownie."
  }

  function button(text, className, onClick) {
    const node = element("button", className, text)
    node.type = "button"
    node.addEventListener("click", onClick)
    return node
  }

  async function copyText(text, node) {
    let done = false
    try {
      await navigator.clipboard.writeText(text)
      done = true
    } catch (_error) {
      const area = document.createElement("textarea")
      area.value = text
      area.setAttribute("readonly", "")
      area.style.position = "fixed"
      area.style.opacity = "0"
      document.body.append(area)
      area.select()
      try {
        done = document.execCommand("copy")
      } catch (_err) {}
      area.remove()
    }
    node.textContent = done ? "Skopiowano" : "Nie udało się skopiować"
    node.className = done ? "small done" : "small"
    setTimeout(() => {
      node.textContent = "Kopiuj"
      node.className = "small"
    }, 2000)
  }

  function reveal(sectionId) {
    const target = L.sectionTarget(state.targets, sectionId)
    if (!target || !target.scrollIntoView) return
    target.scrollIntoView({ block: "center", behavior: "smooth" })
    target.style.setProperty("outline", `2px solid ${PURPLE}`, "important")
    target.style.setProperty("outline-offset", "4px", "important")
    target.style.setProperty("border-radius", "8px", "important")
    setTimeout(() => {
      target.style.removeProperty("outline")
      target.style.removeProperty("outline-offset")
      target.style.removeProperty("border-radius")
    }, 2500)
  }

  function noteCard(note) {
    const item = element("li", "note")
    const top = element("div", "row")
    top.append(element("span", `chip ${note.category}`, note.label))
    top.append(element("span", "where", note.section))
    item.append(top)
    if (note.quote && note.quote.length <= 160)
      item.append(element("div", "quote", `„${note.quote}”`))
    item.append(element("div", "", note.why))
    if (note.rewrite) item.append(element("div", "rewrite", note.rewrite))
    const row = element("div", "row")
    if (note.rewrite) {
      const copy = element("button", "small", "Kopiuj")
      copy.type = "button"
      copy.addEventListener("click", () => void copyText(note.rewrite, copy))
      row.append(copy)
    }
    if (L.sectionTarget(state.targets, note.sectionId)) {
      row.append(button("Pokaż", "small", () => reveal(note.sectionId)))
    }
    if (row.childNodes.length) item.append(row)
    return item
  }

  function readLine(read) {
    if (!read) return null
    const parts = []
    if (read.about) parts.push("O mnie")
    if (read.experience)
      parts.push(`${read.experience} ${plural(read.experience, "rola", "role", "ról")}`)
    if (read.education)
      parts.push(`${read.education} ${plural(read.education, "szkoła", "szkoły", "szkół")}`)
    if (read.skills)
      parts.push(
        `${read.skills} ${plural(read.skills, "umiejętność", "umiejętności", "umiejętności")}`
      )
    return `Oceniam to, co widać na tej stronie: ${
      parts.join(", ") || "nagłówek"
    }. Wpisy schowane pod „Pokaż wszystkie” nie są czytane.`
  }

  function plural(count, one, few, many) {
    if (count === 1) return one
    const mod10 = count % 10
    const mod100 = count % 100
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
    return many
  }

  function renderAudit(audit) {
    const body = ui.body
    const tone = audit.score >= 80 ? "good" : audit.score >= 60 ? "mid" : "low"
    const score = element("div", `score ${tone}`)
    score.append(element("b", "", String(audit.score)), element("span", "", "/ 100"))
    body.append(score)
    const when = [`Ocena z ${formatDate(audit.auditedAt)}`]
    if (audit.progress) when.push(audit.progress)
    else if (!audit.fresh) when.push("profil bez zmian od ostatniej oceny")
    body.append(element("div", "msg", when.join(" · ")))
    body.append(element("div", "", audit.summary))

    const top = audit.notes.slice(0, 5)
    const rest = audit.notes.slice(5)
    if (top.length) {
      body.append(element("h3", "", "Najważniejsze zmiany"))
      const list = element("ul", "notes")
      for (const note of top) list.append(noteCard(note))
      body.append(list)
    } else {
      body.append(element("div", "msg", "Brak uwag. Ten profil czyta się dobrze."))
    }
    if (rest.length) {
      const details = element("details")
      details.append(element("summary", "", `Pozostałe uwagi (${rest.length})`))
      const list = element("ul", "notes")
      for (const note of rest) list.append(noteCard(note))
      details.append(list)
      body.append(details)
    }
    if (audit.demand.length) {
      body.append(element("h3", "", "Czego szukają oferty dla Ciebie"))
      const list = element("ul", "demand")
      for (const fact of audit.demand.slice(0, 6)) {
        list.append(
          element(
            "li",
            "",
            `${fact.percent}% ofert „${fact.role}” wspomina: ${fact.phrase} (${fact.matchingOffers} z ${fact.totalOffers}). W profilu tego nie ma.`
          )
        )
      }
      body.append(list)
    }
    const read = readLine(audit.read)
    if (read) body.append(element("div", "msg", read))
    const foot = element("div", "foot")
    const link = element("a", "link", "Profil w Nowa Rola")
    link.href = appLink("/profile")
    link.target = "_blank"
    link.rel = "noreferrer noopener"
    foot.append(
      button("Oceń ponownie", "btn alt", () => void run({ force: true })),
      link
    )
    body.append(foot)
  }

  function render() {
    if (!ui.body) return
    const body = ui.body
    body.textContent = ""
    if (!state.config.connected) {
      body.append(
        element("div", "msg", "Połącz rozszerzenie z Nowa Rola, żeby ocenić ten profil."),
        button("Połącz rozszerzenie", "btn", () => void send("openOptions", {}))
      )
      return
    }
    if (state.busy) {
      body.append(element("div", "msg", state.stage))
      return
    }
    if (state.error) {
      body.append(element("div", "err", state.error))
      body.append(button("Spróbuj ponownie", "btn", () => void run({ force: true })))
      return
    }
    if (state.audit) {
      renderAudit(state.audit)
      return
    }
    body.append(
      element(
        "div",
        "msg",
        "Ocena pokaże, jak ten profil czytają rekruterzy i czego brakuje mu wobec ofert dla Ciebie."
      ),
      button("Oceń mój profil", "btn", () => void run({ force: true }))
    )
  }

  // -------------------------------------------------------------------- the audit

  async function run({ force }) {
    if (state.busy) return { ok: false, error: "busy" }
    const { sections, targets } = L.readProfile(document)
    if (!L.hasContent(sections)) {
      ensurePanel()
      state.error = errorText({ error: "no-sections" })
      render()
      return { ok: false, error: "no-sections" }
    }
    const key = JSON.stringify(sections)
    if (!force && key === state.sent && state.audit) return { ok: true, score: state.audit.score }
    if (!force && state.sentAt && Date.now() - state.sentAt < MIN_GAP_MS) {
      return { ok: false, error: "busy" }
    }
    ensurePanel()
    state.targets = targets
    state.busy = true
    state.error = null
    state.stage = "Czytam profil i oceniam go. To może potrwać kilkanaście sekund…"
    render()
    try {
      const slug = L.profileSlug(location.pathname)
      const result = await send("linkedinAudit", {
        sections,
        force: Boolean(force),
        profileUrl: `${location.origin}${location.pathname}`,
        slug: slug === "me" ? null : slug,
      })
      state.sentAt = Date.now()
      if (!result.ok) {
        if (result.status === 401) await refreshConfig()
        state.error = errorText(result)
        return { ok: false, error: result.error }
      }
      state.audit = result.data.audit
      state.sent = key
      return { ok: true, score: state.audit.score }
    } finally {
      state.busy = false
      render()
    }
  }

  // -------------------------------------------------------------------- watching the page

  async function refreshConfig() {
    const result = await send("config", {})
    if (result.ok) state.config = result.data
    render()
  }

  function scan() {
    if (location.href !== state.href) {
      state.href = location.href
      state.audit = null
      state.error = null
      state.targets = null
      state.sent = ""
      state.settling = ""
      state.forced = false
      hidePanel()
    }
    if (!L.profileSlug(location.pathname)) {
      hidePanel()
      return
    }
    if (session("get", dismissKey())) return
    const own = state.forced || L.ownProfile(document, location.pathname, state.config.linkedinSlug)
    if (!own) return
    ensurePanel()
    if (!state.config.connected || !state.config.linkedinAuto || state.busy) {
      render()
      return
    }
    // Sections render one after another: wait until the page has stopped changing.
    const { sections } = L.readProfile(document)
    const key = JSON.stringify(sections)
    if (key !== state.settling) {
      state.settling = key
      state.settlingAt = Date.now()
      render()
      scheduleScan(SETTLE_MS)
      return
    }
    if (Date.now() - state.settlingAt < SETTLE_MS - 100) {
      scheduleScan(SETTLE_MS)
      return
    }
    if (L.hasContent(sections) && key !== state.sent) void run({ force: false })
    else render()
  }

  let timer = null
  function scheduleScan(delay = 800) {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      scan()
    }, delay)
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "nr:linkedin") return false
    if (!L.profileSlug(location.pathname)) return false
    // The person asked from the popup: this is their profile, whatever the page looks like.
    state.forced = true
    run({ force: true }).then(sendResponse, (error) =>
      sendResponse({ ok: false, error: String(error?.message || error) })
    )
    return true
  })

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") void refreshConfig().then(scan)
  })

  async function start() {
    await refreshConfig()
    scan()
    new MutationObserver(() => scheduleScan()).observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
  }

  void start()
}
