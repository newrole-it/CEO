/** The file name the server chose, from Content-Disposition. */
function nameFromHeader(header: string | null): string | null {
  if (!header) return null
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i)
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1])
    } catch {
      // fall through to the plain filename
    }
  }
  return header.match(/filename="([^"]+)"/i)?.[1] ?? null
}

/**
 * Downloads a CV as a PDF from `url` (CvEditorBackend.pdfUrl). "print" means the server has no
 * Chrome (503): the caller opens the print view instead. Fetching first (rather than a plain link)
 * is what makes that fallback work.
 */
export async function downloadPdf(url: string): Promise<"ok" | "print" | "failed"> {
  let response: Response
  try {
    response = await fetch(url, { credentials: "same-origin" })
  } catch {
    return "failed"
  }
  if (response.status === 503) return "print"
  if (!response.ok) return "failed"
  const blobUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement("a")
  link.href = blobUrl
  link.download = nameFromHeader(response.headers.get("Content-Disposition")) ?? "CV.pdf"
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000)
  return "ok"
}
