/**
 * Service worker: the only place that talks to the app and holds the token. Content scripts ask
 * it through messages and never see the token. See docs/product/plan-aplikacje.md §5.3 and §5.4.
 */
import { linkedInJobId, statusLine } from "./offer.js"

const DEFAULT_APP = "http://127.0.0.1:43123"
const LOCAL_APPS = [DEFAULT_APP, "http://localhost:43123"]
const ALL_SITES = "https://*/*"
const ALL_SITES_SCRIPT = "nowarola-all-sites"
const OFFER_SITES_SCRIPT = "nowarola-offer-all-sites"
const PAIR_SCRIPT = "nowarola-pair"
const CONTENT_FILE = "content-scripts/content.js"
const OFFER_FILE = "content-scripts/offer.js"
const PAIR_FILE = "content-scripts/pair.js"
const OFFER_FACTS = ["company", "title", "pageTitle", "siteName"]
/** Statuses on the icon, by statusTone in src/shared/applications.ts */
const TONE_COLORS = {
  neutral: "#5b3df5",
  progress: "#5b3df5",
  late: "#3f28b8",
  success: "#0b7a52",
  danger: "#c8281c",
  muted: "#6b6b80",
}

// ---------------------------------------------------------------------- settings

async function settings() {
  const stored = await chrome.storage.local.get([
    "token",
    "apiBase",
    "autoTrack",
    "offerCheck",
    "linkedinAuto",
    "linkedinSlug",
  ])
  return {
    token: stored.token || null,
    apiBase: stored.apiBase || DEFAULT_APP,
    // Both local addresses are the same app; only an https address is a real choice.
    customBase: Boolean(stored.apiBase) && !LOCAL_APPS.includes(stored.apiBase),
    autoTrack: stored.autoTrack !== false,
    /** Say on an open offer whether the person already applied, and the status */
    offerCheck: stored.offerCheck !== false,
    /** Audit the person's own LinkedIn profile whenever they open it */
    linkedinAuto: stored.linkedinAuto !== false,
    /** The profile slug of the last audited profile: how the page is known to be theirs */
    linkedinSlug: stored.linkedinSlug || null,
  }
}

const SLUG = /^[A-Za-z0-9%._~-]{1,120}$/
const LINKEDIN_PROFILE = /^https:\/\/www\.linkedin\.com\/in\/([^/?#]+)\/?(?:[?#].*)?$/

function linkedInSlug(url) {
  const match = LINKEDIN_PROFILE.exec(String(url || ""))
  return match ? match[1] : null
}

function isLinkedIn(url) {
  return /^https:\/\/www\.linkedin\.com\//.test(String(url || ""))
}

/** An app address the extension may call: the local app, or any https site with permission. */
function cleanBase(value) {
  try {
    const url = new URL(String(value).trim())
    if (LOCAL_APPS.includes(url.origin) || url.protocol === "https:") return url.origin
  } catch (_error) {}
  return null
}

// ---------------------------------------------------------------------- API

async function api(path, init = {}, as = "json") {
  const { token, apiBase } = await settings()
  if (!token) return { ok: false, status: 0, error: "not-connected" }
  let response
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    })
  } catch (_error) {
    return { ok: false, status: 0, error: "offline" }
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    return { ok: false, status: response.status, error: body?.error || `HTTP ${response.status}` }
  }
  if (as === "pdf") return { ok: true, status: response.status, response }
  return { ok: true, status: response.status, data: await response.json() }
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

async function cvFile(id) {
  const query = id ? `?id=${encodeURIComponent(id)}` : ""
  const result = await api(`/api/ext/cv${query}`, {}, "pdf")
  if (!result.ok) return result
  const name = decodeURIComponent(result.response.headers.get("X-Cv-Name") || "CV.pdf")
  const buffer = await result.response.arrayBuffer()
  return { ok: true, data: { base64: toBase64(buffer), name, type: "application/pdf" } }
}

// ---------------------------------------------------------------------- badge

function isWebUrl(url) {
  return typeof url === "string" && /^https?:/i.test(url)
}

async function setBadge(tabId, applied) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#5b3df5" }).catch(() => undefined)
  await chrome.action.setBadgeText({ tabId, text: applied ? "✓" : "" }).catch(() => undefined)
}

/** The profile score on the tab's icon; green from 80, amber under 60. */
async function setScoreBadge(tabId, score, slug) {
  const color = score >= 80 ? "#0b7a52" : score >= 60 ? "#5b3df5" : "#b45309"
  await chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => undefined)
  await chrome.action.setBadgeText({ tabId, text: String(score) }).catch(() => undefined)
  if (!chrome.storage.session) return
  await chrome.storage.session.set({ [`score:${tabId}`]: { slug, score } }).catch(() => undefined)
}

/** LinkedIn pages never get the "applied" check; a profile tab keeps the score it was given. */
async function linkedInBadge(tabId, url) {
  const slug = linkedInSlug(url)
  const key = `score:${tabId}`
  const stored = chrome.storage.session
    ? await chrome.storage.session.get(key).catch(() => ({}))
    : {}
  const kept = stored[key]
  if (slug && kept && kept.slug === slug) return setScoreBadge(tabId, kept.score, slug)
  return setBadge(tabId, false)
}

/** ✓ in the colour of the status; a dot for another role at this company; else nothing. */
async function setOfferBadge(tabId, data) {
  const applied = data?.applied
  const text = applied ? "✓" : data?.sameCompany?.length ? "•" : ""
  const color = applied ? TONE_COLORS[applied.tone] || TONE_COLORS.neutral : TONE_COLORS.muted
  const title = text ? `Nowa Rola: ${statusLine(data)}` : ""
  await chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => undefined)
  await chrome.action.setBadgeText({ tabId, text }).catch(() => undefined)
  await chrome.action.setTitle({ tabId, title }).catch(() => undefined)
}

/** Offers are left to the script on the page: it asks with the company and role it read there. */
async function updateBadge(tabId, url) {
  const { token, apiBase } = await settings()
  if (!token || !isWebUrl(url) || url.startsWith(apiBase)) return setBadge(tabId, false)
  if (isLinkedIn(url) && !linkedInJobId(url)) return linkedInBadge(tabId, url)
}

function statusPath(offer) {
  const query = new URLSearchParams({ url: String(offer?.url || "") })
  for (const name of OFFER_FACTS) {
    if (offer?.[name]) query.set(name, String(offer[name]))
  }
  return `/api/ext/status?${query}`
}

// ---------------------------------------------------------------------- dynamic scripts

async function syncScript(id, wanted, definition) {
  const found = await chrome.scripting.getRegisteredContentScripts({ ids: [id] })
  if (wanted && !found.length)
    await chrome.scripting.registerContentScripts([{ id, ...definition }])
  if (!wanted && found.length) await chrome.scripting.unregisterContentScripts({ ids: [id] })
}

/** The form script and the offer check on every https site, once the person allowed it. */
async function syncAllSites() {
  const wanted = await chrome.permissions.contains({ origins: [ALL_SITES] })
  await syncScript(ALL_SITES_SCRIPT, wanted, {
    matches: [ALL_SITES],
    js: [CONTENT_FILE],
    runAt: "document_idle",
    allFrames: true,
  })
  await syncScript(OFFER_SITES_SCRIPT, wanted, {
    matches: [ALL_SITES],
    js: [OFFER_FILE],
    runAt: "document_idle",
  })
}

/** Pairing on a self-hosted app address; the two local addresses are in the manifest. */
async function syncPairScript() {
  const { apiBase, customBase } = await settings()
  const origin = `${apiBase}/*`
  const wanted = customBase && (await chrome.permissions.contains({ origins: [origin] }))
  await syncScript(PAIR_SCRIPT, false, {})
  if (wanted) {
    await syncScript(PAIR_SCRIPT, true, {
      matches: [`${apiBase}/connect/extension*`, `${apiBase}/setup*`],
      js: [PAIR_FILE],
      runAt: "document_start",
    })
  }
}

async function syncScripts() {
  await syncAllSites().catch((error) => console.warn("all sites script", error))
  await syncPairScript().catch((error) => console.warn("pair script", error))
}

// ---------------------------------------------------------------------- on-demand injection

async function inject(tabId) {
  const files = [CONTENT_FILE]
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files })
  } catch (_error) {
    await chrome.scripting.executeScript({ target: { tabId }, files })
  }
}

/** Asks the LinkedIn script in the tab to audit the profile; the manifest already injects it. */
async function auditInTab(tabId) {
  try {
    const answer = await chrome.tabs.sendMessage(tabId, { type: "nr:linkedin" })
    return answer || { ok: false, error: "not-profile" }
  } catch (_error) {
    return { ok: false, error: "not-profile" }
  }
}

/** Runs a content action in the active tab, injecting the script when the page has none yet. */
async function runInTab(tabId, type) {
  try {
    await inject(tabId)
  } catch (_error) {
    return { ok: false, error: "restricted" }
  }
  try {
    const answer = await chrome.tabs.sendMessage(tabId, { type })
    return answer || { ok: false, error: "no-form" }
  } catch (_error) {
    return { ok: false, error: "no-form" }
  }
}

// ---------------------------------------------------------------------- toast after navigation

/** A submission usually navigates away; the next page in the tab shows what the old one could not. */
async function rememberToast(tabId, application) {
  if (tabId == null || !chrome.storage.session) return
  await chrome.storage.session.set({ [`toast:${tabId}`]: application }).catch(() => undefined)
}

async function takeToast(tabId) {
  if (tabId == null || !chrome.storage.session) return null
  const key = `toast:${tabId}`
  const stored = await chrome.storage.session.get(key).catch(() => ({}))
  if (stored[key]) await chrome.storage.session.remove(key).catch(() => undefined)
  return stored[key] || null
}

// ---------------------------------------------------------------------- messages

/**
 * The popup, or the options page, which runs in a tab. Content scripts share the extension's id,
 * so a tab only counts when the sender's own address is inside the extension.
 */
function fromExtensionPage(sender) {
  if (sender.id !== chrome.runtime.id) return false
  if (!sender.tab) return true
  return typeof sender.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""))
}

function isPairingPath(path) {
  return path.startsWith("/connect/extension") || path === "/setup" || path.startsWith("/setup/")
}

async function fromPairingPage(sender) {
  if (fromExtensionPage(sender)) return true
  const { apiBase, customBase } = await settings()
  try {
    const url = new URL(sender.url)
    const allowed = customBase ? [apiBase] : LOCAL_APPS
    return allowed.includes(url.origin) && isPairingPath(url.pathname)
  } catch (_error) {
    return false
  }
}

async function handle(message, sender) {
  const tabId = sender.tab?.id
  switch (message?.type) {
    case "config": {
      const { token, apiBase, autoTrack, offerCheck, customBase, linkedinAuto, linkedinSlug } =
        await settings()
      return {
        ok: true,
        data: {
          connected: Boolean(token),
          apiBase,
          autoTrack,
          offerCheck,
          customBase,
          linkedinAuto,
          linkedinSlug,
        },
      }
    }
    case "linkedinAudit": {
      const result = await api("/api/ext/linkedin-profile", {
        method: "POST",
        body: JSON.stringify({
          sections: message.sections,
          force: Boolean(message.force),
          profileUrl: message.profileUrl,
          locale: "pl",
        }),
      })
      if (!result.ok) return result
      const slug = typeof message.slug === "string" && SLUG.test(message.slug) ? message.slug : null
      if (tabId != null) await setScoreBadge(tabId, result.data.audit.score, slug)
      // From now on this slug is the person's own profile, however the page looks.
      if (slug) await chrome.storage.local.set({ linkedinSlug: slug }).catch(() => undefined)
      return result
    }
    case "linkedinLatest":
      return api("/api/ext/linkedin-profile?locale=pl")
    case "linkedinTab":
      if (!fromExtensionPage(sender)) return { ok: false, error: "forbidden" }
      return auditInTab(message.tabId)
    case "me":
      return api("/api/ext/me")
    case "fill":
      return api("/api/ext/fill", {
        method: "POST",
        body: JSON.stringify({ page: message.page, fields: message.fields }),
      })
    case "submitted": {
      const result = await api("/api/ext/submitted", {
        method: "POST",
        body: JSON.stringify({ page: message.page, job: message.job, fields: message.fields }),
      })
      if (result.ok && tabId != null) {
        await setBadge(tabId, true)
        await rememberToast(tabId, result.data.application)
      }
      return result
    }
    case "status":
      return api(statusPath({ url: message.url }))
    case "offerStatus": {
      const result = await api(statusPath(message.offer))
      if (tabId != null) await setOfferBadge(tabId, result.ok ? result.data : null)
      return result
    }
    case "offerLeft":
      if (tabId != null) {
        await setOfferBadge(tabId, null)
        await linkedInBadge(tabId, sender.tab.url)
      }
      return { ok: true }
    case "cv":
      return cvFile(message.id)
    case "takeToast":
      return { ok: true, data: await takeToast(tabId) }
    case "setToken": {
      if (!(await fromPairingPage(sender))) return { ok: false, error: "forbidden" }
      const token = String(message.token || "").trim()
      if (!/^nr_[A-Za-z0-9_-]{20,100}$/.test(token)) return { ok: false, error: "invalid-token" }
      const { customBase } = await settings()
      const update = { token }
      // Paired from the other local address: use the one the person really opens.
      if (!customBase && LOCAL_APPS.includes(message.origin)) update.apiBase = message.origin
      await chrome.storage.local.set(update)
      return { ok: true }
    }
    case "openOptions":
      await chrome.runtime.openOptionsPage()
      return { ok: true }
    case "clearToken":
      if (!fromExtensionPage(sender)) return { ok: false, error: "forbidden" }
      await chrome.storage.local.remove("token")
      return { ok: true }
    case "setApiBase": {
      if (!fromExtensionPage(sender)) return { ok: false, error: "forbidden" }
      const base = cleanBase(message.apiBase)
      if (!base) return { ok: false, error: "invalid-url" }
      await chrome.storage.local.set({ apiBase: base })
      await syncPairScript().catch(() => undefined)
      return { ok: true, data: { apiBase: base } }
    }
    case "fillTab":
    case "saveTab":
      if (!fromExtensionPage(sender)) return { ok: false, error: "forbidden" }
      return runInTab(message.tabId, message.type === "fillTab" ? "nr:fill" : "nr:save")
    default:
      return { ok: false, error: "unknown-message" }
  }
}

// ---------------------------------------------------------------------- start

/** The first run continues in the app. chrome.tabs.create needs no permission. */
async function openSetup() {
  const { apiBase } = await settings()
  await chrome.tabs.create({ url: `${apiBase}/setup?ext=installed` })
}

/** Chrome only wakes a service worker for listeners added in its first turn: keep this synchronous. */
export function startBackground() {
  // Without the "tabs" permission Chrome only reveals tab.url where the extension has host access
  // and on pages the person opened it on.
  chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.status === "complete" && tab.url) void updateBadge(tabId, tab.url)
  })
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.get(tabId).then(
      (tab) => {
        if (tab.url) void updateBadge(tabId, tab.url)
      },
      () => undefined
    )
  })

  chrome.runtime.onInstalled.addListener(({ reason }) => {
    void syncScripts()
    if (reason === "install") void openSetup().catch((error) => console.warn("setup tab", error))
  })
  chrome.runtime.onStartup.addListener(() => void syncScripts())
  chrome.permissions.onAdded.addListener(() => void syncScripts())
  chrome.permissions.onRemoved.addListener(() => void syncScripts())

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false
    handle(message, sender).then(sendResponse, (error) =>
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
    )
    return true
  })
}
