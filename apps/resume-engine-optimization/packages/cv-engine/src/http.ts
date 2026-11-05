import type { CvLocale } from "@newrole/cv-core/blank"
import { cvPdfFileName } from "@newrole/cv-core/filename"
import { letterFileSuffix } from "@newrole/cv-core/letter"
import type { CvContent } from "@newrole/cv-core/schema"

/** How an app hands a CV to the browser: the PDF's name and the responses for the PDF and print view. */

/** "Jan_Kowalski_CV.pdf", or the letter's "Jan_Kowalski_List_motywacyjny.pdf". */
export function documentPdfName(
  content: CvContent,
  docType: "CV" | "LETTER",
  language: CvLocale
): string {
  return docType === "LETTER"
    ? cvPdfFileName(content.header.name, letterFileSuffix(language))
    : cvPdfFileName(content.header.name)
}

/** The PDF as a download, or shown in the browser with `inline`. */
export function pdfResponse(bytes: Uint8Array, name: string, inline = false): Response {
  // RFC 6266: an ASCII fallback plus the exact name for uploaded files with non-ASCII characters
  const ascii = name.replace(/[^\x20-\x7e]+/g, "_").replace(/["\\]/g, "_")
  const disposition = `${
    inline ? "inline" : "attachment"
  }; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

/**
 * The print view (render.ts's renderCvHtml) as a page of its own: nothing loads from outside, and
 * only its own inline script and styles run.
 */
export function printViewResponse(html: string): Response {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy":
        "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
