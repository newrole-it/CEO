/** Popup: connection state, actions for the current tab, and the two switches. */
"use strict"

const ALL_SITES = "https://*/*"

const STATUS = {
  APPLIED: "Aplikowano",
  SCREENING: "Rozmowa z rekruterem",
  INTERVIEW: "Rozmowy",
  TASK: "Zadanie",
  FINAL: "Rozmowa finałowa",
  OFFER: "Oferta",
  ACCEPTED: "Przyjęta",
  REJECTED: "Odrzucono",
  WITHDRAWN: "Wycofałem się",
  GHOSTED: "Brak odpowiedzi",
}

const ERRORS = {
  restricted: "Na tej stronie Chrome nie pozwala działać rozszerzeniom.",
  "no-form": "Nie widzę tu formularza.",
  "no-fields": "Nie widzę tu pól do wypełnienia.",
  offline: "Nie mogę połączyć się z aplikacją. Czy Nowa Rola jest uruchomiona?",
  disconnected: "Odśwież tę stronę i spróbuj ponownie.",
  busy: "Już pracuję nad tym formularzem.",
}

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
  const result = await ask({ type: "status", url: tab.url })
  const applied = result?.ok ? result.data.applied : null
  if (!applied) return
  const date = new Date(applied.appliedAt).toLocaleDateString("pl-PL")
  $("applied").textContent = `Już aplikowano: ${date}, ${STATUS[applied.status] || applied.status}`
  show("applied", true)
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

  $("autoTrack").checked = config.data.autoTrack
  $("autoTrack").addEventListener("change", (event) => {
    void chrome.storage.local.set({ autoTrack: event.target.checked })
  })

  $("allSites").checked = await chrome.permissions.contains({ origins: [ALL_SITES] })
  $("allSites").addEventListener("change", async (event) => {
    const box = event.target
    // The service worker registers or removes the script when the permission changes.
    box.checked = box.checked
      ? await chrome.permissions.request({ origins: [ALL_SITES] })
      : !(await chrome.permissions.remove({ origins: [ALL_SITES] }))
  })

  await showApplied(await activeTab())
}

void init()
