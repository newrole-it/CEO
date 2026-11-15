import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import db from "db"
import { isLocalInstall } from "src/server/local-install"
import { setupReady } from "src/server/setup/status"
import { invoke } from "./rpc"
import { Landing } from "./components/landing/Landing"
import { SETUP_SKIP_COOKIE } from "./components/site/links"
import { SiteFrame } from "./components/site/SiteFrame"
import { Dashboard } from "./dashboard/Dashboard"
import { GatherCv } from "./dashboard/GatherCv"
import { replyNumbers } from "./dashboard/reply-numbers"
import { translator } from "./i18n/copy"
import { getLocale } from "./i18n/server"
import { computeInsights } from "src/server/applications/insights"
import { loadInsightsInput } from "src/server/applications/service"
import { canGather } from "src/server/cv/gather"
import { listCvs } from "src/server/cv/service"
import { listOffers } from "src/server/offers/service"
import getCurrentUser from "./users/queries/getCurrentUser"

/** Whether this person lands on the dashboard: signed in, with a profile. */
async function hasProfile(userId: number): Promise<boolean> {
  const profile = await db.candidateProfile.findUnique({
    where: { userId },
    select: { id: true },
  })
  return Boolean(profile)
}

// Only the home page names itself canonical; the layout's metadata would hand "/" to every page.
export async function generateMetadata() {
  const canonical = { alternates: { canonical: "/" } }
  // a guest and a dead database get the landing page, under the layout's title
  const user = await invoke(getCurrentUser, null).catch(() => null)
  if (!user || !(await hasProfile(user.id).catch(() => false))) return canonical
  return { ...canonical, title: translator(await getLocale())("dash.title") }
}

export default async function Home() {
  const local = isLocalInstall()
  const [locale, user] = await Promise.all([
    getLocale(),
    // On a local install a dead database is a step on /setup, not an error page.
    invoke(getCurrentUser, null).catch((error) => {
      if (local) return null
      throw error
    }),
  ])
  if (local) {
    const jar = await cookies()
    if (!jar.get(SETUP_SKIP_COOKIE) && !(await setupReady(user?.id ?? null))) redirect("/setup")
  }
  if (user) {
    if (await hasProfile(user.id)) {
      const [cvs, offers, input, gatherable] = await Promise.all([
        listCvs(user.id),
        listOffers(user.id),
        loadInsightsInput(user.id),
        canGather(user.id),
      ])
      // every application ever sent: the same numbers the statistics show for "all time"
      const replies = replyNumbers(computeInsights(input, { weeks: null, now: new Date() }))
      return (
        <SiteFrame user={user} locale={locale}>
          <Dashboard
            locale={locale}
            cvs={cvs}
            offers={offers}
            replies={replies}
            gather={<GatherCv enabled={gatherable} />}
          />
        </SiteFrame>
      )
    }
  }
  return (
    <SiteFrame user={user} locale={locale} variant="bare">
      <Landing finish={Boolean(user)} />
    </SiteFrame>
  )
}
