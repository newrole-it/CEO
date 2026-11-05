import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import db from "db"
import { linkedInCredentials } from "src/server/auth/linkedin"
import { isLocalInstall } from "src/server/local-install"
import { offerIndexEnabled } from "src/server/offer-index"
import { setupReady } from "src/server/setup/status"
import { invoke } from "./blitz-server"
import { Landing } from "./components/landing/Landing"
import { indexStats, roundDown } from "./components/landing/stats"
import { SETUP_SKIP_COOKIE } from "./components/site/links"
import { SiteFrame } from "./components/site/SiteFrame"
import { getLocale } from "./i18n/server"
import getCurrentUser from "./users/queries/getCurrentUser"

// Only the home page names itself canonical; the layout's metadata would hand "/" to every page.
export const metadata = { alternates: { canonical: "/" } }

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
  if (!offerIndexEnabled()) redirect(user ? "/applications" : "/login")
  if (user) {
    const profile = await db.candidateProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    })
    if (profile) redirect("/jobs")
  }
  const stats = await indexStats().catch(() => ({ offers: 0, companies: null, careerPages: null }))
  return (
    <SiteFrame user={user} locale={locale} variant="bare">
      <Landing
        linkedIn={Boolean(linkedInCredentials())}
        finish={Boolean(user)}
        stats={{
          offers: roundDown(stats.offers),
          companies: stats.companies ? roundDown(stats.companies) : null,
          careerPages: stats.careerPages ? roundDown(stats.careerPages) : null,
        }}
      />
    </SiteFrame>
  )
}
