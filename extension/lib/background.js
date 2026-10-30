/**
 * Service worker: the only place that talks to the app and holds the token. Content scripts ask
 * it through messages and never see the token. See docs/product/plan-aplikacje.md §5.3 and §5.4.
 */

const DEFAULT_APP = "http://127.0.0.1:43123"
const LOCAL_APPS = [DEFAULT_APP, "http://localhost:43123"]
const ALL_SITES = "https://*/*"
const ALL_SITES_SCRIPT = "nowarola-all-sites"
const PAIR_SCRIPT = "nowarola-pair"
const CONTENT_FILE = "content-scripts/content.js"
const PAIR_FILE = "content-scripts/pair.js"

// ---------------------------------------------------------------------- settings

async function settings() {
  const stored = await chrome.storage.local.get(["token", "apiBase", "autoTrack"])
  return {
    token: stored.token || null,
    apiBase: stored.apiBase || DEFAULT_APP,
    // Both local addresses are the same app; only an https address is a real choice.
    customBase: Boolean(stored.apiBase) && !LOCAL_APPS.includes(stored.apiBase),
    autoTrack: stored.autoTrack !== false,
  }
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

async function updateBadge(tabId, url) {
  const { token, apiBase } = await settings()
  if (!token || !isWebUrl(url) || url.startsWith(apiBase)) return setBadge(tabId, false)
  const result = await api(`/api/ext/status?url=${encodeURIComponent(url)}`)
  await setBadge(tabId, Boolean(result.ok && result.data?.applied))
}

// ---------------------------------------------------------------------- dynamic scripts

async function syncScript(id, wanted, definition) {
  const found = await chrome.scripting.getRegisteredContentScripts({ ids: [id] })
  if (wanted && !found.length)
    await chrome.scripting.registerContentScripts([{ id, ...definition }])
  if (!wanted && found.length) await chrome.scripting.unregisterContentScripts({ ids: [id] })
}

/** The form script on every https site, once the person allowed it. */
async function syncAllSites() {
  const wanted = await chrome.permissions.contains({ origins: [ALL_SITES] })
  await syncScript(ALL_SITES_SCRIPT, wanted, {
    matches: [ALL_SITES],
    js: [CONTENT_FILE],
    runAt: "document_idle",
    allFrames: true,
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
      const { token, apiBase, autoTrack, customBase } = await settings()
      return { ok: true, data: { connected: Boolean(token), apiBase, autoTrack, customBase } }
    }
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
      return api(`/api/ext/status?url=${encodeURIComponent(String(message.url || ""))}`)
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
  // Without the "tabs" permission Chrome only reveals tab.url where the extension has host access,
  // so this only ever asks about known ATS pages and pages the person opened it on.
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
