import { createOriginGuard } from "@newrole/app-kit/origin"

/** The lab runs on 127.0.0.1 and answers its own pages only, as newrole.it's route handlers do. */
export const guard = createOriginGuard(() => process.env.JOBS_LAB_ORIGIN?.trim() || null)

export function refused(): Response {
  return Response.json({ error: "This lab answers its own pages only." }, { status: 403 })
}
