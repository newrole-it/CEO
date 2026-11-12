/** Popup: connection state, actions for the current tab, and the switches. */
import { errorKey, localeOf, translator } from "./copy.js"
import { isGmail } from "./gmail.js"
import { linkedInJobId, statusLine } from "./offer.js"

const ALL_SITES = "https://*/*"

const ERRORS = {
  restricted: "Na tej stronie Chrome nie pozwala działać rozszerzeniom.",
  "no-form": "Nie widzę tu formularza.",
  "no-fields": "Nie widzę tu pól do wypełnienia.",
  offline: "Nie mogę połączyć się z aplikacją. Czy newrole.it działa?",
  disconnected: "Odśwież tę stronę i spróbuj ponownie.",
  busy: "Już nad tym pracuję.",
  "not-profile": "Otwórz swój profil LinkedIn (linkedin.com/in/…) i spróbuj ponownie.",
  "no-sections": "Nie widzę sekcji profilu. Przewiń stronę i spróbuj ponownie.",
  "not-gmail": "Otwórz mail w Gmailu i spróbuj ponownie.",
  "no-mail":
    "Nie widzę otwartego maila. Otwórz jedną wiadomość (nie listę) albo zaznacz jej treść i spróbuj ponownie.",
  "no-sender": "Nie widzę adresu nadawcy. Rozwiń wiadomość w wątku i spróbuj ponownie.",
  "already-used": "Ten mail jest już zapisany w trackerze.",
}

/** What the app read from the mail, in the popup's words. */
const SIGNALS = {
  CONFIRMATION: "potwierdzenie złożenia aplikacji",
  NEXT_STAGE: "kolejny etap",
  SCREENING: "rozmowa z rekruterem",
  INTERVIEW: "zaproszenie na rozmowę",
  TASK: "zadanie",
  FINAL: "rozmowa finałowa",
  OFFER: "oferta",
  REJECTED: "odrzucenie",
  OTHER: "nie widzę tu decyzji",
}

const LINKEDIN_PROFILE = /^https:\/\/www\.linkedin\.com\/in\/[^/?#]+\/?(?:[?#].*)?$/

/** How often the popup asks for the steps of a run of "Dopasuj CV" while it is open */
const FIT_POLL_MS = 2000

const locale = localeOf(navigator.language)
const t = translator(locale)

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
  if (!tab?.url || !/^https?:/.test(tab.url) || isGmail(tab.url)) return
  if (/^https:\/\/www\.linkedin\.com\//.test(tab.url) && !linkedInJobId(tab.url)) return
  // The script on the page also read the company and role; the address alone may not match.
  const fromPage = await chrome.tabs.sendMessage(tab.id, { type: "nr:offer" }).catch(() => null)
  const byAddress = await ask({ type: "status", url: tab.url })
  const direct = byAddress?.ok ? byAddress.data : null
  const line = statusLine(direct?.applied ? direct : (fromPage?.data ?? direct))
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

function option(value, label) {
  const node = document.createElement("option")
  node.value = value
  node.textContent = label
  return node
}

/** Reads the open mail, then lets the person pick the application and the status. */
async function readMail(button) {
  const tab = await activeTab()
  if (!tab?.id) return say(ERRORS.restricted, "err")
  button.disabled = true
  show("mailForm", false)
  say("Czytam ten mail…")
  const result = await ask({ type: "mailTab", tabId: tab.id })
  button.disabled = false
  if (!result?.ok) {
    return say(ERRORS[result?.error] || result?.error || "Coś poszło nie tak.", "err")
  }
  say("")

  const { data, mail } = result
  const date = new Date(data.mail.receivedAt).toLocaleString("pl-PL")
  $("mailSubject").textContent = data.mail.subject
  $("mailMeta").textContent = `${data.mail.from} · ${date}${
    result.fromSelection ? " · z zaznaczonego tekstu" : ""
  }`
  const reading = SIGNALS[data.reading.signal] || data.reading.signal
  $("mailReading").textContent = data.reading.evidence
    ? `Odczyt: ${reading}. „${data.reading.evidence}”`
    : `Odczyt: ${reading}.`
  const used = data.used
  $("mailUsed").textContent = used
    ? `Ten mail jest już zapisany${used.company ? ` przy: ${used.company} · ${used.title}` : ""}.`
    : ""
  show("mailUsed", Boolean(used))

  const apps = $("mailApp")
  const empty = data.choices.length ? "Wybierz aplikację" : "Brak aplikacji w trackerze"
  apps.replaceChildren(option("", empty))
  for (const choice of data.choices) {
    const mark = choice.likely ? "★ " : ""
    const label = `${mark}${choice.company} · ${choice.title} (${choice.statusLabel})`
    apps.append(option(choice.id, label))
  }
  apps.value = data.suggestion.applicationId || ""

  const statuses = $("mailStatus")
  statuses.replaceChildren(option("", "Bez zmiany, tylko wpis na osi czasu"))
  for (const status of data.statuses) statuses.append(option(status.value, status.label))
  statuses.value = data.suggestion.status || ""

  const form = $("mailForm")
  form.onsubmit = async (event) => {
    event.preventDefault()
    if (!apps.value) return say("Wybierz aplikację, której dotyczy ten mail.", "err")
    $("useMail").disabled = true
    say("Zapisuję…")
    const saved = await ask({
      type: "useMail",
      mail,
      applicationId: apps.value,
      status: statuses.value || null,
      signal: data.reading.signal,
      reader: data.reading.reader,
      evidence: data.reading.evidence,
    })
    $("useMail").disabled = false
    if (!saved?.ok) {
      return say(ERRORS[saved?.error] || saved?.error || "Coś poszło nie tak.", "err")
    }
    const app = saved.data.application
    show("mailForm", false)
    say(
      saved.data.changed
        ? `Zapisano: ${app.company} · ${app.title} → ${statuses.selectedOptions[0].textContent}`
        : `Dodano mail do osi czasu: ${app.company} · ${app.title}`,
      "ok"
    )
  }
  $("useMail").disabled = Boolean(used)
  show("mailForm", true)
}

/** The offer on this tab into newrole.it, read whole there; its page opens in the app. */
async function addOffer(button, base) {
  const tab = await activeTab()
  if (!tab?.url || !/^https?:/.test(tab.url)) return say(ERRORS.restricted, "err")
  button.disabled = true
  say("Czytam ofertę. To może potrwać kilkanaście sekund…")
  const result = await ask({ type: "addOffer", url: tab.url })
  button.disabled = false
  if (!result?.ok)
    return say(ERRORS[result?.error] || result?.error || "Coś poszło nie tak.", "err")
  const data = result.data
  if (data.kind === "invalid") return say("To nie wygląda na stronę oferty.", "err")
  if (data.kind === "added") {
    say(`${data.added ? "Dodano" : "Już masz tę ofertę"}: ${data.company} · ${data.title}`, "ok")
  } else {
    say("Sprawdź dane oferty w newrole.it i dodaj ją.", "ok")
  }
  await chrome.tabs.create({ url: `${base}${data.path}` })
}

/** The offer's id once "Dopasuj CV" added it: its address alone may not find it again. */
let fitJobId = null
let fitWasRunning = false

/**
 * What the app knows about the offer on this tab as the person's own: the step of a run that is
 * going, or the match of the CV written for it with the way to the editor. "Dopasuj CV" stays
 * only while there is no CV and no run.
 */
async function showFit(tab, base) {
  const result = await ask({ type: "offerFit", url: tab.url, jobId: fitJobId })
  const fit = result?.ok ? result.data : null
  if (!fit) return
  const running = fit.run?.state === "running"
  const failed = fit.run?.state === "failed"
  const score = fit.cv?.summary?.score
  let line = ""
  if (running) {
    const step = fit.run.steps.find((entry) => entry.state === "running")
    line = step ? t(`fit.step.${step.step}`) : ""
  } else if (fit.cv) {
    line = score == null ? t("fit.stage.cv") : t("fit.score", { n: score })
  } else if (fit.offer) {
    line = t("fit.stage.saved")
  }
  $("fitLine").textContent = line
  show("fitLine", Boolean(line))
  if (fit.cv) {
    $("fitEditor").textContent = t("fit.openEditor")
    $("fitEditor").href = `${base}${fit.cv.path}`
    $("fitMatch").textContent = t("fit.openMatch")
    $("fitMatch").href = `${base}${fit.cv.matchPath}`
  }
  show("fitLinks", Boolean(fit.cv) && !running)
  $("tailor").textContent = t(failed ? "fit.retry" : "popup.tailor")
  show("tailor", !fit.cv && !running)
  if (running) {
    say(t("fit.running"))
    fitWasRunning = true
    setTimeout(() => void showFit(tab, base), FIT_POLL_MS)
  } else if (fitWasRunning) {
    fitWasRunning = false
    if (failed) say(t(errorKey(fit.run.error)), "err")
    else say("")
  }
}

/** "Dopasuj CV": the app adds the offer on this tab and tailors a CV for it; showFit follows it. */
async function tailorOffer(button, tab, base) {
  if (!tab?.url || !/^https?:/.test(tab.url)) return say(ERRORS.restricted, "err")
  button.disabled = true
  say(t("fit.starting"))
  const result = await ask({ type: "tailorOffer", url: tab.url, locale })
  button.disabled = false
  const data = result?.ok ? result.data : null
  if (!data) {
    return say(t(errorKey(result?.status === 401 ? "not-connected" : result?.error)), "err")
  }
  if (data.kind === "invalid" || data.kind === "limited") return say(t(`fit.${data.kind}`), "err")
  if (data.kind === "draft") {
    say(t("fit.draft"), "err")
    await chrome.tabs.create({ url: `${base}${data.path}` })
    return
  }
  fitJobId = data.jobId
  fitWasRunning = true
  // The panel on the page follows the same run.
  void chrome.tabs.sendMessage(tab.id, { type: "nr:fit", jobId: data.jobId }).catch(() => null)
  await showFit(tab, base)
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
  $("help").href = `${base}/features#extension`

  $("fill").addEventListener(
    "click",
    () => void act("fillTab", $("fill"), "Wypełniam. Pytania otwarte mogą potrwać kilka sekund…")
  )
  $("save").addEventListener("click", () => void act("saveTab", $("save"), "Zapisuję…"))
  $("addOffer").addEventListener("click", () => void addOffer($("addOffer"), base))

  // On a LinkedIn profile the form actions make no sense; the audit takes their place.
  const tab = await activeTab()
  const onProfile = LINKEDIN_PROFILE.test(tab?.url || "")
  // In Gmail the only thing to do is to use the open message.
  const onMail = isGmail(tab?.url)
  show("fill", !onProfile && !onMail)
  show("save", !onProfile && !onMail)
  const onWeb = !onProfile && !onMail && /^https:/.test(tab?.url || "")
  show("addOffer", onWeb)
  $("tailor").textContent = t("popup.tailor")
  show("tailor", onWeb)
  $("tailor").addEventListener("click", () => void tailorOffer($("tailor"), tab, base))
  show("audit", onProfile)
  show("readMail", onMail)
  $("audit").addEventListener("click", () => void auditProfile($("audit")))
  $("readMail").addEventListener("click", () => void readMail($("readMail")))

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

  await Promise.all([showApplied(tab), showScore(), onWeb ? showFit(tab, base) : null])
}

export function startPopup() {
  void init()
}
