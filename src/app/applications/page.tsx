import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { listApplications } from "src/server/applications/service"
import { sheetStatus } from "src/server/applications/sheet"
import { ApplicationsScreen } from "./ApplicationsScreen"
import { toRow } from "./rows"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("app.title") }
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; group?: string }>
}) {
  const [locale, params, user] = await Promise.all([
    getLocale(),
    searchParams,
    invoke(getCurrentUser, null),
  ])
  const [rows, sheet] = user
    ? await Promise.all([listApplications(user.id, { group: "all" }), sheetStatus(user.id)])
    : [[], null]
  const group =
    params.group === "all" || params.group === "closed" || params.group === "rejected"
      ? params.group
      : "active"
  return (
    <SiteFrame user={user} locale={locale}>
      <ApplicationsScreen
        signedIn={Boolean(user)}
        initialRows={rows.map(toRow)}
        initialGroup={group}
        initialOpenId={params.id ?? null}
        sheetUrl={sheet?.configured ? sheet.spreadsheetUrl : null}
      />
    </SiteFrame>
  )
}
