/**
 * Runs only on the app's /connect/extension page. Takes the token the page created and hands it
 * to the service worker. The page gets a reply only when the token was stored.
 */
;(function () {
  "use strict"

  const LOCAL_APPS = ["http://127.0.0.1:43123", "http://localhost:43123"]

  function ask(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(chrome.runtime.lastError ? null : response)
      })
    })
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || data.type !== "nowarola:pair" || typeof data.token !== "string") return
    if (data.origin !== event.origin) return
    const config = await ask({ type: "config" })
    if (!config?.ok) return
    // Either local address is the app, unless an https address was chosen in the options.
    const allowed = config.data.customBase
      ? event.origin === config.data.apiBase
      : LOCAL_APPS.includes(event.origin)
    if (!allowed) return
    const result = await ask({ type: "setToken", token: data.token, origin: event.origin })
    if (result?.ok) window.postMessage({ type: "nowarola:paired" }, event.origin)
  })
})()
