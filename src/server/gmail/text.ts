/** The text of a message, in memory only. Links are never opened. */

/** What the model sees at most, after redaction */
export const MODEL_TEXT_LIMIT = 3000

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
