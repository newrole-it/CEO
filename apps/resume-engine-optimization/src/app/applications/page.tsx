import { redirect } from "next/navigation"
import { invoke } from "src/app/rpc"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { listApplications } from "src/server/applications/service"
import { matchScoresByJob } from "src/server/cv/match-rounds"
import { sheetStatus } from "src/server/applications/sheet"
import { listOffers } from "src/server/offers/service"
import { FirstSteps } from "src/app/components/onboarding/FirstSteps"
import { visibleFirstSteps } from "src/app/components/onboarding/first-steps"
import { toApplyPath } from "src/shared/applications"
import { ApplicationsScreen } from "./ApplicationsScreen"
import { isAppGroup, toRow } from "./rows"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("app.title") }
}

/**
 * One screen for the whole way of an offer: "Do wysłania" has the offers the person keeps and has
 * not applied to yet (with "Dodaj ofertę"), the other groups the applications they sent.
 */
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; group?: string; add?: string }>
}) {
  const [locale, params, user] = await Promise.all([
    getLocale(),
    searchParams,
    invoke(getCurrentUser, null),
  ])
  const add = typeof params.add === "string" ? params.add.slice(0, 2000) : null
  // a link handed over by the extension is read for a person: sign in first, then come back
  if (!user && add) redirect(`/login?returnTo=${encodeURIComponent(toApplyPath(add))}`)
  const [rows, sheet, offers] = user
    ? await Promise.all([
        listApplications(user.id, { group: "all" }),
        sheetStatus(user.id),
        listOffers(user.id),
      ])
    : [[], null, []]
  const jobIds = rows.flatMap((row) => (row.jobId ? [row.jobId] : []))
  const matches = user ? await matchScoresByJob(user.id, jobIds) : {}
  const steps = user ? await visibleFirstSteps(user.id, offers) : null
  const toApply = offers.filter((offer) => !offer.application)
  // nothing sent yet: the offers to apply to are what there is to see
  const group = isAppGroup(params.group) ? params.group : add || !rows.length ? "todo" : "active"
  return (
    <SiteFrame user={user} locale={locale}>
      {steps ? <FirstSteps steps={steps} /> : null}
      <ApplicationsScreen
        signedIn={Boolean(user)}
        initialRows={rows.map(toRow)}
        offers={toApply}
        addUrl={add}
        matches={matches}
        initialGroup={group}
        initialOpenId={params.id ?? null}
        sheetUrl={sheet?.configured ? sheet.spreadsheetUrl : null}
      />
    </SiteFrame>
  )
}
