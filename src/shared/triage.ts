export type TriageStatus = "undecided" | "interested" | "rejected"

export type UndoStep = {
  matchId: string
  jobId: string
  label: string
  from: TriageStatus
  to: TriageStatus
}

export type LocalDecision = {
  jobId: string
  action: TriageStatus
  at: number
}

export type ServerDecision = {
  id: string
  jobId: string
  interestedAt: Date | null
  dismissedAt: Date | null
}

const STACK_LIMIT = 20

export function actionForStatus(status: TriageStatus): "interested" | "dismiss" | "undecided" {
  if (status === "interested") return "interested"
  if (status === "rejected") return "dismiss"
  return "undecided"
}

export function statusFromStamps(
  interestedAt: Date | string | null | undefined,
  dismissedAt: Date | string | null | undefined
): TriageStatus {
  if (interestedAt) return "interested"
  if (dismissedAt) return "rejected"
  return "undecided"
}

export function pushUndo(stack: UndoStep[], step: UndoStep): UndoStep[] {
  return [...stack, step].slice(-STACK_LIMIT)
}

export function popUndo(stack: UndoStep[]): { stack: UndoStep[]; step: UndoStep | null } {
  if (!stack.length) return { stack, step: null }
  return { stack: stack.slice(0, -1), step: stack[stack.length - 1] }
}

export function swipeDecision(
  dx: number,
  velocity: number,
  threshold = 120
): "rejected" | "interested" | null {
  const flung = Math.abs(velocity) > 0.6 && Math.abs(dx) > 40
  if (dx <= -threshold || (flung && dx < 0)) return "rejected"
  if (dx >= threshold || (flung && dx > 0)) return "interested"
  return null
}

export function latestDecisions(decisions: LocalDecision[]): LocalDecision[] {
  const byJob = new Map<string, LocalDecision>()
  for (const decision of decisions) {
    const current = byJob.get(decision.jobId)
    if (!current || decision.at >= current.at) byJob.set(decision.jobId, decision)
  }
  return [...byJob.values()]
}

function serverStamp(row: ServerDecision): number {
  const interested = row.interestedAt ? new Date(row.interestedAt).getTime() : 0
  const dismissed = row.dismissedAt ? new Date(row.dismissedAt).getTime() : 0
  return Math.max(interested, dismissed)
}

/** Local decisions fill undecided offers and replace a server decision only when they are newer. */
export function mergePlan(
  local: LocalDecision[],
  server: ServerDecision[]
): Array<{
  id: string
  action: TriageStatus
}> {
  const latest = latestDecisions(local)
  const plan: Array<{ id: string; action: TriageStatus }> = []
  for (const decision of latest) {
    const rows = server.filter((row) => row.jobId === decision.jobId)
    for (const row of rows) {
      const serverStatus = statusFromStamps(row.interestedAt, row.dismissedAt)
      const serverAt = serverStamp(row)
      if (serverStatus !== "undecided" && serverAt > decision.at) continue
      if (serverStatus === decision.action) continue
      plan.push({ id: row.id, action: decision.action })
    }
  }
  return plan
}
