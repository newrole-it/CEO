import { htmlToText } from "src/server/jobs/text"
import type { MailPart } from "./types"

/** The readable text of a message, in memory only. Attachments are skipped, links never opened. */

/** Raw parts are cut before any parsing, and what comes out is far more than a real reply needs. */
const MAX_RAW = 200_000
const MAX_TEXT = 20_000
const MAX_DEPTH = 10
/** What the model sees at most, after redaction */
export const MODEL_TEXT_LIMIT = 3000

function decodePart(part: MailPart): string {
  const bytes = new Uint8Array(Buffer.from(part.body?.data ?? "", "base64url"))
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    // Older Polish mail is often ISO-8859-2, whatever the rest of the message is.
    const type = part.headers?.find((header) => header.name.toLowerCase() === "content-type")
    const charset = /charset="?([\w-]+)/i.exec(type?.value ?? "")?.[1]
    try {
      return new TextDecoder(charset ?? "iso-8859-2").decode(bytes)
    } catch {
      return new TextDecoder("iso-8859-2").decode(bytes)
    }
  }
}

/** Plain text when the message has it, else the HTML reduced to text. Never rendered. */
export function messageText(payload: MailPart): string {
  const plain: string[] = []
  const html: string[] = []
  const walk = (part: MailPart, depth: number) => {
    if (depth > MAX_DEPTH || part.filename) return
    for (const child of part.parts ?? []) walk(child, depth + 1)
    if (!part.body?.data) return
    if (part.mimeType === "text/plain") plain.push(decodePart(part))
    else if (part.mimeType === "text/html") html.push(decodePart(part))
  }
  walk(payload, 0)
  const raw = plain.join("\n").trim()
    ? plain.join("\n").slice(0, MAX_RAW)
    : htmlToText(html.join("\n").slice(0, MAX_RAW))
  return stripQuoted(raw).slice(0, MAX_TEXT)
}

const QUOTE_START =
  /^(>|on .{4,200} wrote:\s*$|w dniu .{4,200}(pisze|napisa\S*):\s*$|-{2,}\s*(original message|forwarded message|wiadomosc oryginalna|wiadomość oryginalna|forwarded)|_{5,}\s*$|(from|od):\s.+@)/i

/** Only what this message says: the thread quoted below it is old news, or someone else's words. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  const end = lines.findIndex((line) => QUOTE_START.test(line.trim()))
  return (end < 0 ? lines : lines.slice(0, end)).join("\n").trim()
}

/**
 * Links carry login tokens, and the rest is nobody else's business. Done before any other use.
 * The patterns are bounded because a stranger writes the text, and a NUL would make Postgres
 * refuse the whole row.
 */
export function redact(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[link]")
    .replace(/[^\s@<>()]{1,64}@[^\s@<>()]{1,255}\.[^\s@<>()]{1,63}/g, "[email]")
    .replace(/(?<![\w])\+?\d[\d ()./-]{7,24}\d(?![\w])/g, "[tel]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[token]")
}
