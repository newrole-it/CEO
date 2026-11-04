/** The text of a PDF, parsed in memory: a CV never touches the disk. */
export async function extractPdfText(bytes: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf")
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const result = await extractText(pdf, { mergePages: true })
  const text = result.text
  return Array.isArray(text) ? text.join("\n") : String(text ?? "")
}
