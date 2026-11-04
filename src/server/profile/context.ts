import db from "db"
import { parseCvContent } from "@newrole/cv-core/schema"
import { cvPlainText } from "@newrole/cv-core/text"
import { candidateContextText } from "@newrole/profile/context"
import { parseStoredDocument } from "@newrole/profile/linkedin"

/**
 * What a model may know about the candidate when writing for them (@newrole/profile/context):
 * the account's name, the structured profile, the default CV (or the newest editable one) and the
 * imported CV/LinkedIn sections.
 */
export async function candidateContext(userId: number, maxChars = 9000): Promise<string> {
  const [user, profile, cv] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
    db.candidateProfile.findUnique({ where: { userId } }),
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
    cvText: content ? cvPlainText(content) : null,
    document: parseStoredDocument(profile?.linkedinDocument),
    maxChars,
  })
}
