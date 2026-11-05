/**
 * The text of a PDF, parsed in memory: a CV never touches the disk. Page by page, because unpdf's
 * mergePages turns every line break into a space, and the readers find a CV's sections by the
 * headings on lines of their own (parseLinkedInProfile).
 */
export async function extractPdfText(bytes: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf")
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const result = await extractText(pdf, { mergePages: false })
  const text = result.text
  return Array.isArray(text) ? text.join("\n") : String(text ?? "")
}
