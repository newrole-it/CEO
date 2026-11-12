/**
 * Content script on offer pages: asks the app whether the person already applied and says so in
 * the corner of the page with the status and the next step. On a page that reads as an offer, or
 * an offer the person keeps, the same panel has "Dopasuj CV": the app adds the offer and tailors
 * a CV for it, the panel shows the steps and then the match in short with the way to the editor.
 * The form panel (content.js) keeps the bottom corner; this one sits at the top, so both fit on
 * one page.
 */
import { errorKey, localeOf, translator } from "./copy.js"
import { offerKey, readOffer } from "./offer.js"
import { element, formatDate, send, session } from "./page.js"

export function startOffer(options = {}) {
  if (globalThis.__newRoleOffer) return
  globalThis.__newRoleOffer = true
  if (window.top !== window) return

  const PURPLE = "#5b3df5"
  /** After moving on, details equal to the last offer's count as not replaced yet for this long. */
  const SETTLE_MS = options.settleMs ?? 2000
  /** How often the panel asks for the steps of a run that is going */
  const POLL_MS = options.pollMs ?? 2000
  /** The steps of "Dostosuj CV", in order: TAILOR_STEPS in @newrole/cv-core/progress */
  const STEPS = ["offer", "cv", "match", "tailor", "bullets", "ats", "facts"]
  const MARKS = { waiting: "○", running: "…", done: "✓", skipped: "–", failed: "!" }
  const locale = localeOf(navigator.language)
  const t = translator(locale)

  const state = {
    config: { connected: false, apiBase: "http://127.0.0.1:43123", offerCheck: true },
    href: location.href,
    movedAt: 0,
    /** Company and role of the offer on screen, and of the one before it */
    facts: "",
    before: "",
    asked: "",
    data: null,
    /** The tab's icon says something about this offer */
    marked: false,
    /** What readOffer found on the page for the question now asked */
    offer: null,
    /** The app's answer about the offer as the person's own: its CV, its match, its run */
    fit: null,
    /** The offer's id once "Dopasuj CV" added it: its address alone may not find it again */
    fitJobId: null,
    /** Why the last "Dopasuj CV" started nothing: { text, link? } */
    fitNote: null,
    starting: false,
  }

  const dismissKey = () => `nr-offer-dismissed:${offerKey(location.href)}`

  // -------------------------------------------------------------------- panel

  const STYLE = `
    :host { all: initial; }
    .panel {
      position: fixed; right: 16px; top: 72px; z-index: 2147483647;
      display: grid; gap: 8px; width: 300px; max-width: calc(100vw - 32px); max-height: 70vh;
      overflow: auto; padding: 12px; box-sizing: border-box; border-radius: 12px;
      border: 1px solid #e4e4ec; background: #fff; color: #14141f;
      box-shadow: 0 8px 24px rgb(20 20 31 / 0.18);
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 650; }
    .brand { font-size: 12px; font-weight: 600; color: #55556a; }
    .x { all: unset; cursor: pointer; padding: 0 6px; font-size: 16px; line-height: 1; color: #55556a; }
    .x:focus-visible, .link:focus-visible { outline: 2px solid ${PURPLE}; outline-offset: 2px; }
    .lead { font-size: 14px; font-weight: 650; }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .chip { padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #f0f0f5; color: #14141f; }
    .chip.progress { background: #ece9fe; color: #3f28b8; }
    .chip.late { background: #dcd6fd; color: #2f1d96; }
    .chip.success { background: #dcf5ea; color: #0b6b48; }
    .chip.danger { background: #fde6e4; color: #a8200f; }
    .chip.muted { background: #ececf1; color: #55556a; }
    .msg { color: #55556a; }
    .link { color: ${PURPLE}; text-decoration: underline; overflow-wrap: anywhere; }
    .list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .others { display: grid; gap: 6px; padding-top: 8px; border-top: 1px solid #e4e4ec; }
    .fit { display: grid; gap: 8px; }
    .fit.after { padding-top: 8px; border-top: 1px solid #e4e4ec; }
    .name { font-weight: 650; overflow-wrap: anywhere; }
    .score { font-size: 18px; font-weight: 700; }
    .err { color: #a8200f; }
    .btn {
      all: unset; box-sizing: border-box; cursor: pointer; padding: 7px 12px; border-radius: 8px;
      text-align: center; font-weight: 650; background: ${PURPLE}; color: #fff;
    }
    .btn:focus-visible { outline: 2px solid ${PURPLE}; outline-offset: 2px; }
    .steps { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
    .step { display: flex; gap: 8px; color: #55556a; }
    .step[data-state="running"] { color: inherit; font-weight: 650; }
    .step[data-state="done"] { color: inherit; }
    .step[data-state="failed"] { color: #a8200f; }
    .mark { flex: none; width: 14px; text-align: center; }
    .gaps { margin: 0; padding-left: 18px; }
    @media (prefers-color-scheme: dark) {
      .panel { background: #15161d; color: #f2f2f7; border-color: #2a2b36; }
      .x, .msg, .brand { color: #a7a7b8; }
      .link { color: #a99bff; }
      .others, .fit.after { border-color: #2a2b36; }
      .step { color: #a7a7b8; }
      .err, .step[data-state="failed"] { color: #ffb4ac; }
      .chip { background: #24252f; color: #f2f2f7; }
      .chip.progress { background: #2a2456; color: #cfc6ff; }
      .chip.late { background: #372c78; color: #e0daff; }
      .chip.success { background: #123a2b; color: #7fe0b6; }
      .chip.danger { background: #47201c; color: #ffb4ac; }
      .chip.muted { background: #24252f; color: #a7a7b8; }
    }
  `

  const ui = { host: null, body: null }

  function ensurePanel() {
    if (ui.host) return
    const host = document.createElement("div")
    host.setAttribute("data-newrole", "offer")
    const shadow = host.attachShadow({ mode: "closed" })
    try {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(STYLE)
      shadow.adoptedStyleSheets = [sheet]
    } catch (_error) {
      shadow.append(element("style", "", STYLE))
    }
    const panel = element("div", "panel")
    panel.setAttribute("role", "status")
    panel.setAttribute("aria-label", "newrole.it")
    const head = element("div", "head")
    const close = element("button", "x", "×")
    close.type = "button"
    close.setAttribute("aria-label", "Ukryj")
    close.addEventListener("click", () => {
      session("set", dismissKey())
      host.style.display = "none"
    })
    head.append(element("span", "brand", "newrole.it"), close)
    ui.body = element("div", "list")
    panel.append(head, ui.body)
    shadow.append(panel)
    document.documentElement.append(host)
    ui.host = host
  }

  function chip(application) {
    return element("span", `chip ${application.tone || ""}`, application.statusLabel)
  }

  function trackerLink(application, text) {
    const link = element("a", "link", text)
    link.href = `${state.config.apiBase}/applications?id=${encodeURIComponent(application.id)}`
    link.target = "_blank"
    link.rel = "noreferrer noopener"
    return link
  }

  function dates(application) {
    const sent = `Wysłano ${formatDate(application.appliedAt)}`
    if (application.status === "APPLIED") return sent
    return `${sent} · status od ${formatDate(application.statusChangedAt)}`
  }

  function nextStep(application) {
    const when = application.nextStepAt ? formatDate(application.nextStepAt) : ""
    const parts = [application.nextStep, when].filter(Boolean)
    return parts.length ? `Następny krok: ${parts.join(", ")}` : ""
  }

  function whyLikely(applied) {
    return applied.companyMatch === "similar"
      ? "Inny adres. Stanowisko się zgadza, a nazwa firmy jest podobna."
      : "Inny adres, ale zgadzają się firma i stanowisko."
  }

  function appliedBlock(applied) {
    const lead =
      applied.match === "role"
        ? "Prawdopodobnie już aplikowano na tę ofertę"
        : "Już aplikowano na tę ofertę"
    const status = element("div", "row")
    status.append(chip(applied))
    if (applied.stageNote) status.append(element("span", "msg", applied.stageNote))
    const nodes = [
      element("div", "lead", lead),
      status,
      element("div", "", ""),
      element("div", "msg", dates(applied)),
    ]
    nodes[2].append(trackerLink(applied, `${applied.company} · ${applied.title}`))
    if (applied.match === "role") nodes.splice(1, 0, element("div", "msg", whyLikely(applied)))
    const next = nextStep(applied)
    if (next) nodes.push(element("div", "", next))
    return nodes
  }

  function sameCompanyList(rows) {
    const list = element("ul", "list")
    for (const row of rows) {
      const item = element("li", "row")
      item.append(trackerLink(row, row.title), chip(row))
      list.append(item)
    }
    return list
  }

  // -------------------------------------------------------------------- "Dopasuj CV"

  function appLink(path, text, className) {
    const link = element("a", className, text)
    link.href = `${state.config.apiBase}${path}`
    link.target = "_blank"
    link.rel = "noreferrer noopener"
    return link
  }

  /** The steps of the run as the app reports them; the ones not reached yet wait. */
  function runBlock(run) {
    if (!run) return [element("div", "msg", t("fit.starting"))]
    const list = element("ol", "steps")
    for (const step of STEPS) {
      const stepState = run.steps.find((entry) => entry.step === step)?.state ?? "waiting"
      const item = element("li", "step")
      item.dataset.state = stepState
      item.title = t(`fit.state.${stepState}`)
      const mark = element("span", "mark", MARKS[stepState])
      mark.setAttribute("aria-hidden", "true")
      item.append(mark, element("span", "", t(`fit.step.${step}`)))
      list.append(item)
    }
    return [list, element("div", "msg", t("fit.running"))]
  }

  /** The match of the CV written for the offer, in short, and the way to the editor. */
  function summaryBlock(cv) {
    const nodes = []
    const summary = cv.summary
    if (!summary) nodes.push(element("div", "msg", t("fit.noMatch")))
    else {
      if (summary.score == null) nodes.push(element("div", "msg", t("fit.noScore")))
      else {
        nodes.push(element("div", "score", t("fit.score", { n: summary.score })))
        if (summary.band) nodes.push(element("div", "msg", t(`fit.band.${summary.band}`)))
      }
      if (summary.required.total) {
        nodes.push(element("div", "", t("fit.required", summary.required)))
        if (summary.required.partial)
          nodes.push(element("div", "msg", t("fit.partial", summary.required)))
      }
      if (summary.gaps.length) {
        const gaps = element("ul", "gaps")
        for (const gap of summary.gaps) gaps.append(element("li", "", gap))
        nodes.push(element("div", "msg", t("fit.gaps")), gaps)
      }
      if (summary.ats.after != null) {
        const key = summary.ats.before == null ? "fit.ats.after" : "fit.ats"
        nodes.push(element("div", "msg", t(key, summary.ats)))
      }
    }
    nodes.push(
      appLink(cv.path, t("fit.openEditor"), "btn"),
      appLink(cv.matchPath, t("fit.openMatch"), "link")
    )
    return nodes
  }

  /** Something to say about tailoring: the offer is the person's, or the page reads as an offer. */
  function fitShown() {
    return Boolean(state.fit && (state.fit.offer || (state.offer?.company && state.offer.title)))
  }

  function fitBlock(after) {
    const fit = state.fit
    const block = element("div", after ? "fit after" : "fit")
    const named = fit.offer ?? state.offer
    const head = element("div", "row")
    if (fit.cv) head.append(element("span", "chip success", t("fit.stage.cv")))
    else if (fit.offer) head.append(element("span", "chip progress", t("fit.stage.saved")))
    if (named?.company && named.title) head.append(element("span", "name", t("fit.offer", named)))
    block.append(head)
    if (state.starting || fit.run?.state === "running") {
      block.append(...runBlock(fit.run?.state === "running" ? fit.run : null))
      return block
    }
    if (fit.cv) {
      block.append(...summaryBlock(fit.cv))
      return block
    }
    const failed = fit.run?.state === "failed"
    if (failed) block.append(element("div", "err", t(errorKey(fit.run.error))))
    if (state.fitNote) {
      block.append(element("div", "err", state.fitNote.text))
      if (state.fitNote.link)
        block.append(appLink(state.fitNote.link.path, state.fitNote.link.text, "link"))
    }
    const start = element("button", "btn", t(failed ? "fit.retry" : "fit.tailor"))
    start.type = "button"
    start.addEventListener("click", () => void startTailor())
    block.append(start)
    if (fit.offer) block.append(appLink(fit.offer.path, t("fit.openOffer"), "link"))
    return block
  }

  let poll = null
  /** Asks again while a run is going; the answer after its last step has the CV and its match. */
  function followRun() {
    if (poll || state.fit?.run?.state !== "running") return
    poll = setTimeout(() => {
      poll = null
      void refreshFit()
    }, POLL_MS)
  }

  async function refreshFit() {
    const asked = state.asked
    if (!asked || !state.offer) return
    const result = await send("offerFit", { url: state.offer.url, jobId: state.fitJobId })
    if (state.asked !== asked) return
    // The app not answering once is no reason to drop a run from the screen.
    if (result.ok) state.fit = result.data
    render()
    followRun()
  }

  async function startTailor() {
    const asked = state.asked
    if (!state.offer || state.starting) return
    state.starting = true
    state.fitNote = null
    render()
    const result = await send("tailorOffer", { url: state.offer.url, locale })
    if (state.asked !== asked) return
    state.starting = false
    const data = result.ok ? result.data : null
    if (!data) {
      const code = result.status === 401 ? "not-connected" : result.error
      state.fitNote = { text: t(errorKey(code)) }
    } else if (data.kind === "draft") {
      state.fitNote = {
        text: t("fit.draft"),
        link: { path: data.path, text: t("fit.draft.link") },
      }
    } else if (data.kind === "invalid" || data.kind === "limited") {
      state.fitNote = { text: t(`fit.${data.kind}`) }
    } else {
      state.fitJobId = data.jobId
      await refreshFit()
      return
    }
    render()
  }

  function render() {
    const applied = state.data?.applied
    const others = state.data?.sameCompany ?? []
    const fit = fitShown()
    if ((!applied && !others.length && !fit) || session("get", dismissKey())) {
      if (ui.host) ui.host.style.display = "none"
      return
    }
    ensurePanel()
    ui.host.style.display = ""
    ui.body.textContent = ""
    if (applied) ui.body.append(...appliedBlock(applied))
    else if (others.length) ui.body.append(element("div", "lead", "W tej firmie już aplikowano"))
    if (others.length) {
      const block = applied ? element("div", "others") : element("div")
      if (applied) block.append(element("div", "msg", "W tej firmie także:"))
      block.append(sameCompanyList(others))
      ui.body.append(block)
    }
    if (fit) ui.body.append(fitBlock(Boolean(applied || others.length)))
  }

  // -------------------------------------------------------------------- asking

  async function check(offer, asked) {
    const [result, fit] = await Promise.all([
      send("offerStatus", { offer }),
      send("offerFit", { url: offer.url, jobId: state.fitJobId }),
    ])
    if (state.asked !== asked) return
    // The app being off is no news on someone's job offer; the popup says so when opened.
    state.data = result.ok ? result.data : null
    state.marked = Boolean(state.data?.applied || state.data?.sameCompany?.length)
    state.fit = fit.ok ? (fit.data ?? null) : null
    render()
    followRun()
  }

  function forget() {
    state.asked = ""
    state.data = null
    state.offer = null
    state.fit = null
    state.fitJobId = null
    state.fitNote = null
    state.starting = false
    if (poll) clearTimeout(poll)
    poll = null
    render()
    if (state.marked) void send("offerLeft", {})
    state.marked = false
  }

  function scan() {
    if (location.href !== state.href) {
      // Single-page navigation: a new offer, or none.
      state.href = location.href
      state.before = state.facts
      state.movedAt = Date.now()
      forget()
    }
    const off = !state.config.connected || !state.config.offerCheck
    const offer =
      off || location.origin === state.config.apiBase ? null : readOffer(document, location.href)
    if (!offer) {
      if (state.asked || state.marked) forget()
      return
    }
    const facts = offer.company ? `${offer.company}|${offer.title}` : ""
    // LinkedIn swaps the offer in place: the old details stay on screen under the new address.
    if (facts && facts === state.before && Date.now() - state.movedAt < SETTLE_MS) {
      // A last look when this runs out: two offers can read the same, and then nothing changes.
      if (!settling) {
        settling = setTimeout(() => {
          settling = null
          scan()
        }, SETTLE_MS)
      }
      return
    }
    state.facts = facts
    const asked = JSON.stringify(offer)
    if (asked === state.asked) return
    state.asked = asked
    state.offer = offer
    void check(offer, asked)
  }

  let settling = null
  let timer = null
  function scheduleScan() {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      scan()
    }, 800)
  }

  async function refreshConfig() {
    const result = await send("config", {})
    if (result.ok) state.config = result.data
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "nr:fit") {
      // The popup started "Dopasuj CV" for this tab: the panel follows the same run.
      if (message.jobId) state.fitJobId = message.jobId
      void refreshFit()
      return false
    }
    if (message?.type !== "nr:offer") return false
    sendResponse(state.data ? { ok: true, data: state.data } : null)
    return false
  })

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") void refreshConfig().then(scan)
  })

  async function start() {
    await refreshConfig()
    scan()
    // Offers that render late, and single-page sites.
    new MutationObserver(() => scheduleScan()).observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
  }

  void start()
}
