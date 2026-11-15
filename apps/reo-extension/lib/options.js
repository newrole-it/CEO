/** Options: app address, pairing, manual token, disconnect. */
import { localeOf, translator } from "./copy.js"
import { applyCopy } from "./i18n.js"

const LOCAL_APPS = ["http://127.0.0.1:43123", "http://localhost:43123"]

const locale = localeOf(navigator.language)
const t = translator(locale)

const $ = (id) => document.getElementById(id)
const ask = (message) => chrome.runtime.sendMessage(message)

function say(id, text, tone) {
  const node = $(id)
  node.textContent = text || ""
  node.className = `${tone === "err" ? "err" : tone === "ok" ? "ok" : "muted"}${
    text ? "" : " hidden"
  }`
}

function connectionError(result) {
  if (result?.status === 401) return t("options.token.invalid")
  if (result?.error === "offline") return t("conn.offline")
  if (result?.error === "invalid-token") return t("options.token.shape")
  return t("err.generic")
}

async function refresh() {
  const config = await ask({ type: "config" })
  const data = config?.data
  $("apiBase").value = data?.apiBase || LOCAL_APPS[0]
  $("disconnect").classList.toggle("hidden", !data?.connected)
  if (!data?.connected) {
    say("state", t("options.notConnected"))
    return null
  }
  const me = await ask({ type: "me" })
  if (me?.ok) say("state", t("options.connected", { email: me.data.user.email }), "ok")
  else say("state", connectionError(me), "err")
  return me
}

export function startOptions() {
  applyCopy(document, t, locale)
  $("pair").addEventListener("click", async () => {
    const config = await ask({ type: "config" })
    await chrome.tabs.create({ url: `${config?.data?.apiBase || LOCAL_APPS[0]}/connect/extension` })
  })

  $("disconnect").addEventListener("click", async () => {
    await ask({ type: "clearToken" })
    say("tokenMessage", "")
    await refresh()
  })

  $("test").addEventListener("click", async () => {
    const token = $("token").value.trim()
    if (!token) return say("tokenMessage", t("options.token.empty"), "err")
    const saved = await ask({ type: "setToken", token })
    if (!saved?.ok) return say("tokenMessage", connectionError(saved), "err")
    $("token").value = ""
    const me = await refresh()
    if (me?.ok) say("tokenMessage", t("options.connected", { email: me.data.user.email }), "ok")
    else say("tokenMessage", connectionError(me), "err")
  })

  $("saveBase").addEventListener("click", async () => {
    let origin
    try {
      origin = new URL($("apiBase").value.trim()).origin
    } catch (_error) {
      return say("baseMessage", t("options.base.invalid"), "err")
    }
    if (!LOCAL_APPS.includes(origin)) {
      if (!origin.startsWith("https://")) {
        return say("baseMessage", t("options.base.https"), "err")
      }
      // Must run inside the click: Chrome asks only during a user gesture.
      const granted = await chrome.permissions.request({ origins: [`${origin}/*`] })
      if (!granted) return say("baseMessage", t("options.base.denied"), "err")
    }
    const result = await ask({ type: "setApiBase", apiBase: origin })
    if (!result?.ok) return say("baseMessage", t("options.base.failed"), "err")
    say("baseMessage", t("options.base.saved"), "ok")
    await refresh()
  })

  void refresh()
}
