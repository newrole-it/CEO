import db from "db"
import { classifyCompany, classifyRole, type TechVerdict } from "./role"
import { llmTechRole } from "./llm"

export async function classificationFields(title: string, description?: string | null) {
  const role = classifyRole(title)
  let isTechRole: TechVerdict = role.isTechRole
  if (isTechRole == null) isTechRole = await llmTechRole(title, description)
  return {
    seniorityLevel: role.seniority,
    isTechRole,
    classifiedAt: new Date(),
  }
}

/** Sets company tech scope once. A later industry correction can still overwrite null only. */
export async function rememberCompanyTech(
  companyId: string,
  args: { industry?: string | null; sourceType?: string | null }
) {
  const verdict = classifyCompany(args)
  if (verdict == null) return
  await db.company.updateMany({
    where: { id: companyId, isTech: null },
    data: { isTech: verdict },
  })
}
