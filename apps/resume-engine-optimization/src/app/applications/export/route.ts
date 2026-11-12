import { getSession } from "src/server/auth/session"
import { getLocale } from "src/app/i18n/server"
import { sheetDate } from "src/server/applications/sheet-table"
import { sheetTable, toCsv } from "src/server/applications/sheet"

/** CSV of the tracker table for the session user (guests too), in the interface language. */
export async function GET() {
  const session = await getSession()
  const userId = session.userId
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 })
  const locale = await getLocale()
  const csv = toCsv(await sheetTable(userId, locale))
  const name = `newrole-${locale === "en" ? "applications" : "aplikacje"}-${sheetDate(
    new Date()
  )}.csv`
  // The BOM makes Excel read Polish characters as UTF-8.
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  })
}
