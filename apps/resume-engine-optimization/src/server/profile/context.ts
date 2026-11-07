import db from "db"
import { parseCvContent } from "@newrole/cv-core/schema"
import { cvPlainText } from "@newrole/cv-core/text"
import { candidateContextText } from "@newrole/profile/context"
import { parseStoredDocument } from "@newrole/profile/linkedin"

/**
 * What a model may know about the candidate when writing for them (@newrole/profile/context):
 * the account's name, the structured profile, the facts they added on points of a match
 * (src/server/cv/match-rounds.ts), the default CV (or the newest editable one) and the imported
 * CV/LinkedIn sections.
 */
export async function candidateContext(userId: number, maxChars = 9000): Promise<string> {
  const [user, profile, facts, cv] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
    db.candidateProfile.findUnique({ where: { userId } }),
    db.candidateFact.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { text: true },
    }),
    db.cvDocument.findFirst({
      where: { userId, kind: "EDITABLE", docType: "CV" },
      orderBy: [
        { isDefault: "desc" },
        { targetCompany: { sort: "desc", nulls: "first" } },
        { updatedAt: "desc" },
      ],
      select: { content: true },
    }),
  ])
  const content = parseCvContent(cv?.content)
  return candidateContextText({
    name: user?.name,
    profile,
    facts: facts.map((fact) => fact.text),
    cvText: content ? cvPlainText(content) : null,
    document: parseStoredDocument(profile?.linkedinDocument),
    maxChars,
  })
}
