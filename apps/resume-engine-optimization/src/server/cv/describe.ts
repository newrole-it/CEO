import db from "db"
import { detectLanguage } from "@newrole/cv-core/language"
import type { CvContent } from "@newrole/cv-core/schema"
import type { LlmClient } from "@newrole/llm/common"
import { parseApplicant } from "@newrole/profile/applicant"
import { describeCvText } from "@newrole/cv-engine/structure"
import { takeSlot } from "src/server/auth/magic-link"
import { createLlmClient } from "src/server/llm/client"
import { CvError, createCv, type CvDetail } from "./service"

/** Writing a CV calls the model; a person gets this many an hour. */
const DESCRIPTIONS_PER_HOUR = 20

/**
 * "Opisz swoje doświadczenie": the person has no CV and describes their work in their own words;
 * the model writes a new editable CV from it (describeCvText). The CV follows the description's
 * language. What the description leaves out of the header (name, e-mail, phone, city) comes from
 * the account and the application details, never from the model. `llm` is injectable for tests;
 * null puts the description into one section.
 */
export async function createCvFromDescription(
  userId: number,
  text: string,
  llm: LlmClient | null = createLlmClient(),
  now = new Date()
): Promise<{ cv: CvDetail; reader: "llm" | "text" }> {
  if (text.trim().length < 20) throw new CvError("no-content", "The description is too short.")
  if (!(await takeSlot(`cv-describe:${userId}`, DESCRIPTIONS_PER_HOUR, now)))
    throw new CvError("limited", "Too many CVs written from a description. Wait an hour.")
  const language = detectLanguage(text)
  const { content, reader } = await describeCvText({ text, locale: language, userId, llm })
  const cv = await createCv({
    userId,
    language,
    from: "content",
    content: await withAccountHeader(userId, content),
  })
  return { cv, reader }
}

async function withAccountHeader(userId: number, content: CvContent): Promise<CvContent> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, role: true, applicant: true },
  })
  if (!user) return content
  const applicant = parseApplicant(user.applicant)
  const { header } = content
  return {
    ...content,
    header: {
      ...header,
      name: header.name || (user.name ?? "").trim().slice(0, 120),
      email:
        header.email ||
        (applicant.email || (user.role === "GUEST" ? "" : user.email)).trim().slice(0, 200),
      phone: header.phone || (applicant.phone ?? "").trim().slice(0, 60),
      location: header.location || (applicant.city ?? "").trim().slice(0, 160),
    },
  }
}
