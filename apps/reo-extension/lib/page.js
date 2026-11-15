/**
 * Shared by the content scripts that draw a panel on a page (content.js on application forms,
 * profile-panel.js on LinkedIn). Nothing here touches the page beyond creating elements.
 */

/** Asks the service worker; a reloaded extension answers "disconnected" instead of throwing. */
export function send(type, payload) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: "disconnected" })
        else resolve(response || { ok: false, error: "disconnected" })
      })
    } catch (_error) {
      // The extension was reloaded; this page's script is orphaned.
      resolve({ ok: false, error: "disconnected" })
    }
  })
}

/** A per-tab flag; sessionStorage can be blocked inside sandboxed frames, which reads as unset. */
export function session(action, key) {
  try {
    if (action === "get") return sessionStorage.getItem(key)
    sessionStorage.setItem(key, "1")
  } catch (_error) {}
  return null
}

export function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

/**
 * The message for a failed call to the service worker, in the language of `t`; null when the error
 * is the caller's own.
 */
export function connectionError(result, t) {
  if (result.status === 401 || result.error === "not-connected") return t("conn.not-connected")
  if (result.error === "offline") return t("conn.offline")
  if (result.error === "disconnected") return t("conn.disconnected")
  return null
}
