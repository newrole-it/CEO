/**
 * Runs only on the app's /connect/extension and /setup pages. Takes the token the page created and
 * hands it to the service worker. The page gets a reply only when the token was stored. It also
 * tells the page that the extension is here; that message never carries the token.
 */

const LOCAL_APPS = ["http://127.0.0.1:43123", "http://localhost:43123"]

function ask(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(chrome.runtime.lastError ? null : response)
    })
  })
}

/** Either local address is the app, unless an https address was chosen in the options. */
function isApp(origin, config) {
  return config.data.customBase ? origin === config.data.apiBase : LOCAL_APPS.includes(origin)
}

async function sayHello(origin) {
  const config = await ask({ type: "config" })
  if (!config?.ok || !isApp(origin, config)) return
  window.postMessage(
    {
      type: "nowarola:hello",
      connected: Boolean(config.data.connected),
      version: chrome.runtime.getManifest().version,
    },
    origin
  )
}

export function startPair() {
  window.addEventListener("message", async (event) => {
    if (event.source !== window) return
    const data = event.data
    if (data?.type === "nowarola:ping") return sayHello(event.origin)
    if (!data || data.type !== "nowarola:pair" || typeof data.token !== "string") return
    if (data.origin !== event.origin) return
    const config = await ask({ type: "config" })
    if (!config?.ok) return
    if (!isApp(event.origin, config)) return
    const result = await ask({ type: "setToken", token: data.token, origin: event.origin })
    if (!result?.ok) return
    window.postMessage({ type: "nowarola:paired" }, event.origin)
    await sayHello(event.origin)
  })

  // The page may not be listening yet at document_start; it can always ask with nowarola:ping.
  void sayHello(location.origin)
}
