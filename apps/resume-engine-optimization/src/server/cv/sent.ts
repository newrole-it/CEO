import db from "db"
import { DELETED_STATUS } from "src/shared/applications"

/** One application as My CV lists it under the CV it was sent with. */
export type CvApplication = {
  id: string
  company: string
  title: string
  status: string
  /** The stage reached before REJECTED or WITHDRAWN */
  closedAtStage: string | null
  appliedAt: Date
}

/**
 * The applications sent with each CV (Application.cvDocumentId), by CV id, newest first. Those
 * removed from the sheet (DELETED) are left out, as the statistics leave them out.
 */
export async function applicationsByCv(userId: number): Promise<Record<string, CvApplication[]>> {
  const rows = await db.application.findMany({
    where: { userId, cvDocumentId: { not: null }, status: { not: DELETED_STATUS } },
    orderBy: { appliedAt: "desc" },
    select: {
      id: true,
      company: true,
      title: true,
      status: true,
      closedAtStage: true,
      appliedAt: true,
      cvDocumentId: true,
    },
  })
  const byCv: Record<string, CvApplication[]> = {}
  for (const { cvDocumentId, ...row } of rows) {
    if (!cvDocumentId) continue
    ;(byCv[cvDocumentId] ??= []).push(row)
  }
  return byCv
}
