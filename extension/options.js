/** Options: app address, pairing, manual token, disconnect. */
"use strict"

const LOCAL_APPS = ["http://127.0.0.1:43123", "http://localhost:43123"]

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
  if (result?.status === 401) return "Token jest nieważny albo został unieważniony."
  if (result?.error === "offline")
    return "Nie mogę połączyć się z aplikacją. Czy Nowa Rola jest uruchomiona?"
  if (result?.error === "invalid-token") return "To nie wygląda na token Nowa Rola (nr_…)."
  return result?.error || "Coś poszło nie tak."
}

async function refresh() {
  const config = await ask({ type: "config" })
  const data = config?.data
  $("apiBase").value = data?.apiBase || LOCAL_APPS[0]
  $("disconnect").classList.toggle("hidden", !data?.connected)
  if (!data?.connected) {
    say("state", "Nie połączono.")
    return null
  }
  const me = await ask({ type: "me" })
  if (me?.ok) say("state", `Połączono jako ${me.data.user.email}`, "ok")
  else say("state", connectionError(me), "err")
  return me
}

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
  if (!token) return say("tokenMessage", "Wklej token.", "err")
  const saved = await ask({ type: "setToken", token })
  if (!saved?.ok) return say("tokenMessage", connectionError(saved), "err")
  $("token").value = ""
  const me = await refresh()
  if (me?.ok) say("tokenMessage", `Połączono jako ${me.data.user.email}`, "ok")
  else say("tokenMessage", connectionError(me), "err")
})

$("saveBase").addEventListener("click", async () => {
  let origin
  try {
    origin = new URL($("apiBase").value.trim()).origin
  } catch (_error) {
    return say("baseMessage", "To nie jest poprawny adres.", "err")
  }
  if (!LOCAL_APPS.includes(origin)) {
    if (!origin.startsWith("https://")) {
      return say("baseMessage", "Inny adres niż lokalny musi używać https.", "err")
    }
    // Must run inside the click: Chrome asks only during a user gesture.
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] })
    if (!granted)
      return say(
        "baseMessage",
        "Bez zgody Chrome rozszerzenie nie połączy się z tym adresem.",
        "err"
      )
  }
  const result = await ask({ type: "setApiBase", apiBase: origin })
  if (!result?.ok) return say("baseMessage", "Nie zapisano adresu.", "err")
  say("baseMessage", "Zapisano.", "ok")
  await refresh()
})

void refresh()
