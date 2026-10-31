/**
 * Content script on offer pages: asks the app whether the person already applied and, only when
 * they did, says so in the corner of the page with the status and the next step. The form panel
 * (content.js) keeps the bottom corner; this one sits at the top, so both fit on one page.
 */
import { offerKey, readOffer } from "./offer.js"
import { element, formatDate, send, session } from "./page.js"

export function startOffer(options = {}) {
  if (globalThis.__nowaRolaOffer) return
  globalThis.__nowaRolaOffer = true
  if (window.top !== window) return

  const PURPLE = "#5b3df5"
  /** After moving on, details equal to the last offer's count as not replaced yet for this long. */
  const SETTLE_MS = options.settleMs ?? 2000

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
    @media (prefers-color-scheme: dark) {
      .panel { background: #15161d; color: #f2f2f7; border-color: #2a2b36; }
      .x, .msg, .brand { color: #a7a7b8; }
      .link { color: #a99bff; }
      .others { border-color: #2a2b36; }
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
    host.setAttribute("data-nowarola", "offer")
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
    panel.setAttribute("aria-label", "Nowa Rola")
    const head = element("div", "head")
    const close = element("button", "x", "×")
    close.type = "button"
    close.setAttribute("aria-label", "Ukryj")
    close.addEventListener("click", () => {
      session("set", dismissKey())
      host.style.display = "none"
    })
    head.append(element("span", "brand", "Nowa Rola"), close)
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

  function render() {
    const applied = state.data?.applied
    const others = state.data?.sameCompany ?? []
    if ((!applied && !others.length) || session("get", dismissKey())) {
      if (ui.host) ui.host.style.display = "none"
      return
    }
    ensurePanel()
    ui.host.style.display = ""
    ui.body.textContent = ""
    if (applied) ui.body.append(...appliedBlock(applied))
    else ui.body.append(element("div", "lead", "W tej firmie już aplikowano"))
    if (others.length) {
      const block = applied ? element("div", "others") : element("div")
      if (applied) block.append(element("div", "msg", "W tej firmie także:"))
      block.append(sameCompanyList(others))
      ui.body.append(block)
    }
  }

  // -------------------------------------------------------------------- asking

  async function check(offer, asked) {
    const result = await send("offerStatus", { offer })
    if (state.asked !== asked) return
    // The app being off is no news on someone's job offer; the popup says so when opened.
    state.data = result.ok ? result.data : null
    state.marked = Boolean(state.data?.applied || state.data?.sameCompany?.length)
    render()
  }

  function forget() {
    state.asked = ""
    state.data = null
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
