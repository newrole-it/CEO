/**
 * Gmail: the one message the person has open, read only when they click in the popup. Nothing
 * runs on mail.google.com before that: the popup injects readOpenMail through activeTab, so the
 * extension needs no permission for Gmail and never sees the rest of the mailbox.
 *
 * Gmail's markup is not documented and changes. The class names below (h2.hP subject, span.gD
 * sender, span.g3 date, div.a3s body, data-legacy-message-id) are the ones Gmail's web client is
 * commonly read by; they were not checked against a live page when this was written. When they
 * fail, what the person selected on the page and the tab title stand in.
 */

export const GMAIL_URL = /^https:\/\/mail\.google\.com\//

export function isGmail(url) {
  return GMAIL_URL.test(String(url || ""))
}

/**
 * Runs in the Gmail tab through chrome.scripting.executeScript, so it must stand alone: no
 * imports, no outside names. Returns { ok, mail } or { ok: false, error }.
 */
export function readOpenMail() {
  const MAX_TEXT = 20000
  const clean = (value, max) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
  const shown = (node) => Boolean(node && node.getClientRects().length)
  const lastShown = (root, selector) => [...root.querySelectorAll(selector)].filter(shown).pop()

  // The last expanded message of the thread: in a thread that is the newest one.
  const body = lastShown(document, "div.a3s")
  const byId = body?.closest("[data-legacy-message-id], [data-message-id]")
  const message = byId || body?.closest("div.adn") || null
  const scope = message || document
  const senderNode = lastShown(scope, "span.gD[email]") || lastShown(document, "span.gD[email]")
  const dateNode = lastShown(scope, "span.g3[title]") || lastShown(document, "span.g3[title]")
  const subjectNode = lastShown(document, "h2.hP")

  // What the person marked wins: they may want one message out of a long thread.
  const selection = String(window.getSelection?.() || "").trim()
  const text = (selection || body?.innerText || "").slice(0, MAX_TEXT)
  // "Subject - me@example.com - Gmail" when the heading cannot be found.
  const title = document.title.replace(/\s+-\s+[^-]*@[^-]*-\s+Gmail\s*$/i, "")
  const subject = clean(subjectNode?.textContent || title, 1000)
  const address = clean(senderNode?.getAttribute("email"), 320)

  if (!text.trim() || !subject) return { ok: false, error: "no-mail" }
  if (!address) return { ok: false, error: "no-sender" }
  return {
    ok: true,
    mail: {
      messageId:
        message?.getAttribute("data-legacy-message-id") ||
        message?.getAttribute("data-message-id") ||
        null,
      from: {
        address,
        name: clean(senderNode?.getAttribute("name") || senderNode?.textContent, 200),
      },
      subject,
      date: clean(dateNode?.getAttribute("title") || dateNode?.textContent, 200),
      text,
      fromSelection: Boolean(selection),
    },
  }
}

/** The first three letters of each month, English then Polish, by month index. */
const MONTH_NAMES = [
  ["jan", "sty"],
  ["feb", "lut"],
  ["mar"],
  ["apr", "kwi"],
  ["may", "maj"],
  ["jun", "cze"],
  ["jul", "lip"],
  ["aug", "sie"],
  ["sep", "wrz"],
  ["oct", "paz", "paź"],
  ["nov", "lis"],
  ["dec", "gru"],
]
const MONTHS = Object.fromEntries(
  MONTH_NAMES.flatMap((names, index) => names.map((name) => [name, index]))
)

/**
 * The date Gmail shows next to a message, e.g. "2 lis 2026, 10:15" or "Nov 2, 2026, 10:15 AM",
 * as an ISO string in the person's own time zone. Null when it cannot be read: the app then uses
 * the time of the click.
 */
export function parseMailDate(text) {
  const value = String(text || "")
    .toLowerCase()
    .slice(0, 200)
  const year = /\b(20\d\d)\b/.exec(value)
  const time = /\b(\d{1,2}):(\d{2})(?:\s*([ap])\.?\s*m\.?)?/.exec(value)
  const monthWord = /\b(\p{L}{3})\p{L}*\.?/gu
  let month = null
  for (const found of value.matchAll(monthWord)) {
    if (found[1] in MONTHS) {
      month = { index: MONTHS[found[1]], at: found.index, end: found.index + found[0].length }
      break
    }
  }
  if (!year || !month) return null
  // The day sits right before the month ("2 lis") or right after it ("Nov 2").
  const before = /(\d{1,2})\s*\.?\s*$/.exec(value.slice(0, month.at))
  const after = /^\s*(\d{1,2})\b/.exec(value.slice(month.end))
  const day = Number((before || after || [])[1])
  if (!day || day > 31) return null
  let hours = time ? Number(time[1]) : 0
  const minutes = time ? Number(time[2]) : 0
  if (time?.[3] === "p" && hours < 12) hours += 12
  if (time?.[3] === "a" && hours === 12) hours = 0
  const date = new Date(Number(year[1]), month.index, day, hours, minutes)
  if (Number.isNaN(date.getTime()) || date.getDate() !== day) return null
  return date.toISOString()
}
