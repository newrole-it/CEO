/** Popup: connection state, actions for the current tab, and the switches. */
import { linkedInJobId, statusLine } from "./offer.js"

const ALL_SITES = "https://*/*"

const ERRORS = {
  restricted: "Na tej stronie Chrome nie pozwala działać rozszerzeniom.",
  "no-form": "Nie widzę tu formularza.",
  "no-fields": "Nie widzę tu pól do wypełnienia.",
  offline: "Nie mogę połączyć się z aplikacją. Czy Nowa Rola jest uruchomiona?",
  disconnected: "Odśwież tę stronę i spróbuj ponownie.",
  busy: "Już nad tym pracuję.",
  "not-profile": "Otwórz swój profil LinkedIn (linkedin.com/in/…) i spróbuj ponownie.",
  "no-sections": "Nie widzę sekcji profilu. Przewiń stronę i spróbuj ponownie.",
}

const LINKEDIN_PROFILE = /^https:\/\/www\.linkedin\.com\/in\/[^/?#]+\/?(?:[?#].*)?$/

const $ = (id) => document.getElementById(id)
const ask = (message) => chrome.runtime.sendMessage(message)

function show(id, visible) {
  $(id).classList.toggle("hidden", !visible)
}

function say(text, tone) {
  const node = $("message")
  node.textContent = text || ""
  node.className = `${tone === "err" ? "err" : tone === "ok" ? "ok" : "muted"}${
    text ? "" : " hidden"
  }`
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab || null
}

async function showApplied(tab) {
  if (!tab?.url || !/^https?:/.test(tab.url)) return
  if (/^https:\/\/www\.linkedin\.com\//.test(tab.url) && !linkedInJobId(tab.url)) return
  // The script on the page also read the company and role; the address alone may not match.
  const fromPage = await chrome.tabs.sendMessage(tab.id, { type: "nr:offer" }).catch(() => null)
  const byAddress = await ask({ type: "status", url: tab.url })
  const direct = byAddress?.ok ? byAddress.data : null
  const line = statusLine(direct?.applied ? direct : fromPage?.data ?? direct)
  if (!line) return
  $("applied").textContent = line
  show("applied", true)
}

/** "Profil LinkedIn: 72/100 (31.10.2026)" from the latest audit, when there is one. */
async function showScore() {
  const result = await ask({ type: "linkedinLatest" })
  const audit = result?.ok ? result.data.audit : null
  if (!audit) return
  const date = new Date(audit.auditedAt).toLocaleDateString("pl-PL")
  $("profileScore").textContent = `Profil LinkedIn: ${audit.score}/100 (${date})`
  show("profileScore", true)
}

async function auditProfile(button) {
  const tab = await activeTab()
  if (!tab?.id) return say(ERRORS.restricted, "err")
  button.disabled = true
  say("Czytam profil i oceniam go. To może potrwać kilkanaście sekund…")
  const result = await ask({ type: "linkedinTab", tabId: tab.id })
  button.disabled = false
  if (result?.ok) {
    say(`Ocena profilu: ${result.score}/100. Szczegóły są na stronie.`, "ok")
    await showScore()
    return
  }
  say(ERRORS[result?.error] || result?.error || "Coś poszło nie tak.", "err")
}

async function act(type, button, working) {
  const tab = await activeTab()
  if (!tab?.id) return say(ERRORS.restricted, "err")
  button.disabled = true
  say(working)
  const result = await ask({ type, tabId: tab.id })
  button.disabled = false
  if (result?.ok) {
    if (result.application) {
      say(`Zapisano: ${result.application.company} · ${result.application.title}`, "ok")
      await showApplied(tab)
    } else {
      say("Gotowe. Wyniki są na stronie. Sprawdź formularz i wyślij go sam.", "ok")
    }
    return
  }
  say(ERRORS[result?.error] || result?.error || "Coś poszło nie tak.", "err")
}

async function init() {
  const config = await ask({ type: "config" })
  const base = config?.data?.apiBase || "http://127.0.0.1:43123"
  $("connect").addEventListener("click", () =>
    chrome.tabs.create({ url: `${base}/connect/extension` })
  )
  if (!config?.data?.connected) {
    $("state").textContent = "Rozszerzenie nie jest połączone z aplikacją."
    show("connect", true)
    return
  }

  const me = await ask({ type: "me" })
  if (!me?.ok) {
    if (me?.status === 401) {
      $("state").textContent = "Token jest nieważny. Połącz rozszerzenie ponownie."
      show("connect", true)
      return
    }
    $("state").textContent = ERRORS[me?.error] || "Nie mogę połączyć się z aplikacją."
    return
  }

  $("state").textContent = `Połączono: ${me.data.user.email}`
  show("actions", true)
  $("tracker").href = `${base}/applications`
  $("answers").href = `${base}/answers`

  $("fill").addEventListener(
    "click",
    () => void act("fillTab", $("fill"), "Wypełniam. Pytania otwarte mogą potrwać kilka sekund…")
  )
  $("save").addEventListener("click", () => void act("saveTab", $("save"), "Zapisuję…"))

  // On a LinkedIn profile the form actions make no sense; the audit takes their place.
  const tab = await activeTab()
  const onProfile = LINKEDIN_PROFILE.test(tab?.url || "")
  show("fill", !onProfile)
  show("save", !onProfile)
  show("audit", onProfile)
  $("audit").addEventListener("click", () => void auditProfile($("audit")))

  $("autoTrack").checked = config.data.autoTrack
  $("autoTrack").addEventListener("change", (event) => {
    void chrome.storage.local.set({ autoTrack: event.target.checked })
  })

  $("offerCheck").checked = config.data.offerCheck !== false
  $("offerCheck").addEventListener("change", (event) => {
    void chrome.storage.local.set({ offerCheck: event.target.checked })
  })

  $("linkedinAuto").checked = config.data.linkedinAuto !== false
  $("linkedinAuto").addEventListener("change", (event) => {
    void chrome.storage.local.set({ linkedinAuto: event.target.checked })
  })

  $("allSites").checked = await chrome.permissions.contains({ origins: [ALL_SITES] })
  $("allSites").addEventListener("change", async (event) => {
    const box = event.target
    // The service worker registers or removes the script when the permission changes.
    box.checked = box.checked
      ? await chrome.permissions.request({ origins: [ALL_SITES] })
      : !(await chrome.permissions.remove({ origins: [ALL_SITES] }))
  })

  await Promise.all([showApplied(tab), showScore()])
}

export function startPopup() {
  void init()
}
