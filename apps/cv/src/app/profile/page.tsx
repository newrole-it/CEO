import Link from "next/link"
import { linkedInBrowserAvailable } from "@newrole/profile/linkedin-browser"
import { translator } from "@/i18n/copy"
import { getLocale } from "@/i18n/server"
import { applicantView, latestProfileAudit } from "@/server/profile"
import { getProfile } from "@/server/store"
import { ProfileScreen } from "./ProfileScreen"

// The profile is a file that changes under the app: read it on every request.
export const dynamic = "force-dynamic"

export async function generateMetadata() {
  return { title: translator(await getLocale())("app.profile.title") }
}

export default async function ProfilePage() {
  const locale = await getLocale()
  const t = translator(locale)
  const [profile, details, audit] = await Promise.all([
    getProfile(),
    applicantView(),
    latestProfileAudit(locale),
  ])
  return (
    <div className="container container--narrow page">
      <header className="cva-head">
        <Link className="cva-brand t-h2" href="/">
          {t("app.name")}
        </Link>
        <Link className="link t-sm" href="/">
          {t("app.nav.home")}
        </Link>
      </header>
      <main id="main" className="stack" style={{ paddingTop: 24 }}>
        <header className="page-head">
          <h1 className="t-h1">{t("app.profile.title")}</h1>
          <p>{t("app.profile.lead")}</p>
        </header>
        <ProfileScreen
          initial={profile.draft}
          hasDocument={Boolean(profile.document)}
          details={details}
          audit={audit}
          // newrole CV always runs on the person's machine; only Claude Code decides
          browserImport={linkedInBrowserAvailable(true)}
        />
      </main>
    </div>
  )
}
