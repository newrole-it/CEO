import db from "db"
import { linkedInCredentials } from "src/server/auth/linkedin"
import { invoke } from "src/app/blitz-server"
import { ButtonLink } from "src/app/components/ds/Button"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { SettingsScreen } from "./SettingsScreen"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("st.title") }
}

export default async function SettingsPage() {
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  const t = translator(locale)
  const signedIn = Boolean(user && user.role !== "GUEST")
  const linked = signedIn
    ? await db.user.findUnique({
        where: { id: user!.id },
        select: { linkedinSub: true, hashedPassword: true },
      })
    : null
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <header className="page-head">
        <h1 className="t-h1">{t("st.title")}</h1>
      </header>
      {signedIn ? (
        <SettingsScreen
          email={user!.email}
          linkedIn={Boolean(linked?.linkedinSub)}
          linkedInConfigured={Boolean(linkedInCredentials())}
          hasPassword={Boolean(linked?.hashedPassword)}
        />
      ) : (
        <div className="card settings-sec">
          <p>{t("st.signIn")}</p>
          <div>
            <ButtonLink href="/login?returnTo=/settings" variant="primary">
              {t("nav.signin")}
            </ButtonLink>
          </div>
        </div>
      )}
    </SiteFrame>
  )
}
