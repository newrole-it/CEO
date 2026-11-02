// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isGmail, parseMailDate, readOpenMail } from "../../../extension/lib/gmail.js"

/**
 * extension/lib/gmail.js against a hand-written page. The markup follows the class names the
 * module reads; it is not a copy of a live Gmail page, so a real Chrome is still the test of the
 * selectors (see extension/README.md).
 */

const THREAD = `
  <h2 class="hP">Acme: next steps</h2>
  <div class="adn" data-legacy-message-id="18f0aaaa">
    <span class="gD" email="old@acme.com" name="Old">Old</span>
    <span class="g3" title="1 lis 2026, 09:00">1 lis</span>
    <div class="a3s">Thank you for applying.</div>
  </div>
  <div class="adn" data-legacy-message-id="18f0bbbb">
    <span class="gD" email="jane@acme.com" name="Jane from Acme">Jane</span>
    <span class="g3" title="2 lis 2026, 10:15">10:15</span>
    <div class="a3s">We would like to invite you to an interview.</div>
  </div>`

beforeEach(() => {
  // jsdom lays nothing out, so every node would look hidden.
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList)
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get() {
      return this.textContent
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ""
  document.title = ""
  window.getSelection()?.removeAllRanges()
})

describe("readOpenMail", () => {
  it("reads the newest expanded message of the thread", () => {
    document.body.innerHTML = THREAD
    const result = readOpenMail()
    expect(result).toMatchObject({
      ok: true,
      mail: {
        messageId: "18f0bbbb",
        from: { address: "jane@acme.com", name: "Jane from Acme" },
        subject: "Acme: next steps",
        date: "2 lis 2026, 10:15",
        text: "We would like to invite you to an interview.",
        fromSelection: false,
      },
    })
  })

  it("takes what the person selected instead of the whole message", () => {
    document.body.innerHTML = THREAD
    const range = document.createRange()
    range.selectNodeContents(document.querySelector('[data-legacy-message-id="18f0aaaa"] .a3s')!)
    window.getSelection()!.addRange(range)
    const result = readOpenMail()
    expect(result.mail?.text).toBe("Thank you for applying.")
    expect(result.mail?.fromSelection).toBe(true)
  })

  it("falls back to the tab title for the subject", () => {
    document.body.innerHTML = THREAD.replace(/<h2[^>]*>.*<\/h2>/, "")
    document.title = "Re: Interview - me@example.com - Gmail"
    const result = readOpenMail()
    expect(result.mail?.subject).toBe("Re: Interview")
  })

  it("says so when no message is open", () => {
    document.body.innerHTML = `<div role="main"><table><tr><td>Inbox list</td></tr></table></div>`
    document.title = "Inbox (3) - me@example.com - Gmail"
    expect(readOpenMail()).toEqual({ ok: false, error: "no-mail" })
  })

  it("says so when the sender is missing", () => {
    document.body.innerHTML = THREAD.replace(/ email="[^"]*"/g, "")
    expect(readOpenMail()).toEqual({ ok: false, error: "no-sender" })
  })
})

describe("parseMailDate", () => {
  const local = (...parts: number[]) =>
    new Date(parts[0], parts[1], parts[2], parts[3] ?? 0, parts[4] ?? 0).toISOString()

  it("reads Polish and English dates in the local time zone", () => {
    expect(parseMailDate("pon., 2 lis 2026, 10:15")).toBe(local(2026, 10, 2, 10, 15))
    expect(parseMailDate("2 października 2026 09:05")).toBe(local(2026, 9, 2, 9, 5))
    expect(parseMailDate("Mon, Nov 2, 2026, 10:15 PM")).toBe(local(2026, 10, 2, 22, 15))
    expect(parseMailDate("Nov 2, 2026, 12:05 AM")).toBe(local(2026, 10, 2, 0, 5))
  })

  it("gives up rather than guess", () => {
    expect(parseMailDate("")).toBeNull()
    expect(parseMailDate("10:15")).toBeNull()
    expect(parseMailDate("31 lut 2026, 10:00")).toBeNull()
    expect(parseMailDate("2.11.2026")).toBeNull()
  })
})

describe("isGmail", () => {
  it("knows Gmail's address and nothing else", () => {
    expect(isGmail("https://mail.google.com/mail/u/0/#inbox/FMfcg")).toBe(true)
    expect(isGmail("https://mail.google.com.evil.example/")).toBe(false)
    expect(isGmail("https://www.google.com/")).toBe(false)
    expect(isGmail(undefined)).toBe(false)
  })
})
