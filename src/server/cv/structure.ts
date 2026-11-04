import { detectLanguage } from "@newrole/cv-core/language"
import { extractPdfText } from "@newrole/profile/pdf"
import { structureCvText } from "@newrole/cv-engine/structure"
import { createLlmClient } from "src/server/llm/client"
import { createCv, CvError, storedPdf, type CvDetail } from "./service"

/** "Utwórz edytowalną wersję": a new editable CV next to the uploaded PDF. */
export async function createEditableFromUpload(
  userId: number,
  id: string
): Promise<{ cv: CvDetail; reader: "llm" | "text" }> {
  const stored = await storedPdf(userId, id)
  if (!stored) throw new CvError("not-found", "CV not found.")
  let text = ""
  try {
    text = await extractPdfText(stored.bytes)
  } catch (error) {
    console.error("cv pdf text failed", error instanceof Error ? error.message : error)
  }
  if (text.trim().length < 20)
    throw new CvError("no-content", "No text could be read from that PDF.")
  // an upload takes the language of the interface, so an English CV can be stored as Polish;
  // the copy follows its text, or it would get Polish labels and a Polish consent clause
  const language = detectLanguage(text)
  const { content, reader } = await structureCvText({
    text,
    locale: language,
    userId,
    llm: createLlmClient(),
  })
  const suffix = language === "en" ? " (editable)" : " (edytowalne)"
  const cv = await createCv({
    userId,
    title: `${stored.title.slice(0, 140)}${suffix}`,
    language,
    from: "content",
    content,
    baseCvId: id,
  })
  return { cv, reader }
}
