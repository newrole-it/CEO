/** Popup: connection state, actions for the current tab, and the switches. */
import { COPY, errorKey, localeOf, translator } from "./copy.js"
import { isGmail } from "./gmail.js"
import { applyCopy, formatDate, formatDateTime } from "./i18n.js"
import { linkedInJobId, statusLine, statusText } from "./offer.js"

const ALL_SITES = "https://*/*"

/** The message for a failed action: the text of a code the popup knows, else a general one. */
function problem(result) {
  // The app answers 429 when it has read too many links for this person in an hour.
  if (result?.status === 429) return t("fit.limited")
  const key = `err.${result?.error}`
  return t(key in COPY.pl ? key : "err.generic")
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
  const line = statusLine(direct?.applied ? direct : (fromPage?.data ?? direct), t, locale)
  if (!line) return
  $("applied").textContent = line
  show("applied", true)
}

/** "Profil LinkedIn: 72/100 (31.10.2026)" from the latest audit, when there is one. */
async function showScore() {
  const result = await ask({ type: "linkedinLatest", locale })
  const audit = result?.ok ? result.data.audit : null
  if (!audit) return
  $("profileScore").textContent = t("popup.profileScore", {
    score: audit.score,
    date: formatDate(audit.auditedAt, locale),
  })
  show("profileScore", true)
}

async function auditProfile(button) {
  const tab = await activeTab()
  if (!tab?.id) return say(t("err.restricted"), "err")
  button.disabled = true
  say(t("popup.audit.working"))
  const result = await ask({ type: "linkedinTab", tabId: tab.id })
  button.disabled = false
  if (result?.ok) {
    say(t("popup.audit.done", { score: result.score }), "ok")
    await showScore()
    return
  }
  say(problem(result), "err")
}

/** A status the mail form lists: the plain status, which the app sends with no stage. */
function mailStatus(status, statusLabel) {
  return statusText({ status, statusLabel, closedAtStage: null }, t)
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
  if (!tab?.id) return say(t("err.restricted"), "err")
  button.disabled = true
  show("mailForm", false)
  say(t("popup.mail.working"))
  const result = await ask({ type: "mailTab", tabId: tab.id })
  button.disabled = false
  if (!result?.ok) {
    return say(problem(result), "err")
  }
  say("")

  const { data, mail } = result
  $("mailSubject").textContent = data.mail.subject
  $("mailMeta").textContent = t(
    result.fromSelection ? "popup.mail.meta.selection" : "popup.mail.meta",
    { from: data.mail.from, date: formatDateTime(data.mail.receivedAt, locale) }
  )
  const kind = `mail.kind.${data.reading.signal}`
  const reading = t(kind in COPY.pl ? kind : "mail.kind.OTHER")
  $("mailReading").textContent = data.reading.evidence
    ? t("popup.mail.read.evidence", { reading, evidence: data.reading.evidence })
    : t("popup.mail.read", { reading })
  const used = data.used
  $("mailUsed").textContent = !used
    ? ""
    : used.company
      ? t("popup.mail.used.at", { company: used.company, title: used.title })
      : t("popup.mail.used")
  show("mailUsed", Boolean(used))

  const apps = $("mailApp")
  const empty = t(data.choices.length ? "popup.mail.choose" : "popup.mail.none")
  apps.replaceChildren(option("", empty))
  for (const choice of data.choices) {
    const label = t(choice.likely ? "popup.mail.choice.likely" : "popup.mail.choice", {
      company: choice.company,
      title: choice.title,
      status: mailStatus(choice.status, choice.statusLabel),
    })
    apps.append(option(choice.id, label))
  }
  apps.value = data.suggestion.applicationId || ""

  const statuses = $("mailStatus")
  statuses.replaceChildren(option("", t("popup.mail.noChange")))
  for (const status of data.statuses) {
    statuses.append(option(status.value, mailStatus(status.value, status.label)))
  }
  statuses.value = data.suggestion.status || ""

  const form = $("mailForm")
  form.onsubmit = async (event) => {
    event.preventDefault()
    if (!apps.value) return say(t("popup.mail.pick"), "err")
    $("useMail").disabled = true
    say(t("popup.saving"))
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
      return say(problem(saved), "err")
    }
    const app = saved.data.application
    show("mailForm", false)
    say(
      saved.data.changed
        ? t("popup.mail.saved", {
            company: app.company,
            title: app.title,
            status: statuses.selectedOptions[0].textContent,
          })
        : t("popup.mail.added", { company: app.company, title: app.title }),
      "ok"
    )
  }
  $("useMail").disabled = Boolean(used)
  show("mailForm", true)
}

/** The offer on this tab into newrole.it, read whole there; its page opens in the app. */
async function addOffer(button, base) {
  const tab = await activeTab()
  if (!tab?.url || !/^https?:/.test(tab.url)) return say(t("err.restricted"), "err")
  button.disabled = true
  say(t("popup.offer.working"))
  const result = await ask({ type: "addOffer", url: tab.url })
  button.disabled = false
  if (!result?.ok) return say(problem(result), "err")
  const data = result.data
  if (data.kind === "invalid") return say(t("fit.invalid"), "err")
  if (data.kind === "added") {
    say(
      t(data.added ? "popup.offer.added" : "popup.offer.exists", {
        company: data.company,
        title: data.title,
      }),
      "ok"
    )
  } else {
    say(t("popup.offer.check"), "ok")
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
  if (!tab?.url || !/^https?:/.test(tab.url)) return say(t("err.restricted"), "err")
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
  if (!tab?.id) return say(t("err.restricted"), "err")
  button.disabled = true
  say(working)
  const result = await ask({ type, tabId: tab.id })
  button.disabled = false
  if (result?.ok) {
    if (result.application) {
      say(
        t("popup.saved", {
          company: result.application.company,
          title: result.application.title,
        }),
        "ok"
      )
      await showApplied(tab)
    } else {
      say(t("popup.fill.done"), "ok")
    }
    return
  }
  say(problem(result), "err")
}

async function init() {
  applyCopy(document, t, locale)
  const config = await ask({ type: "config" })
  const base = config?.data?.apiBase || "http://127.0.0.1:43123"
  $("connect").addEventListener("click", () =>
    chrome.tabs.create({ url: `${base}/connect/extension` })
  )
  if (!config?.data?.connected) {
    $("state").textContent = t("popup.notConnected")
    show("connect", true)
    return
  }

  const me = await ask({ type: "me" })
  if (!me?.ok) {
    if (me?.status === 401) {
      $("state").textContent = t("popup.badToken")
      show("connect", true)
      return
    }
    $("state").textContent = t(me?.error === "offline" ? "conn.offline" : "popup.unreachable")
    return
  }

  $("state").textContent = t("popup.connected", { email: me.data.user.email })
  show("actions", true)
  $("tracker").href = `${base}/applications`
  $("answers").href = `${base}/answers`
  $("help").href = `${base}/features#extension`

  $("fill").addEventListener("click", () => void act("fillTab", $("fill"), t("popup.fill.working")))
  $("save").addEventListener("click", () => void act("saveTab", $("save"), t("popup.saving")))
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
