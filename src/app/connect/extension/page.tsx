import { invoke } from "src/app/blitz-server"
import { ButtonLink } from "src/app/components/ds/Button"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { setupBack } from "src/app/setup/back"
import { PairExtension } from "./PairExtension"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("ext.pair.title") }
}

export default async function ConnectExtensionPage() {
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  const t = translator(locale)
  const signedIn = Boolean(user && user.role !== "GUEST")
  return (
    <SiteFrame
      user={user}
      locale={locale}
      width="narrow"
      setupBack={await setupBack(user?.id ?? null)}
    >
      {signedIn ? (
        <PairExtension />
      ) : (
        <>
          <header className="page-head">
            <h1 className="t-h1">{t("ext.pair.title")}</h1>
          </header>
          <div className="card settings-sec">
            <p>{t("ext.pair.signIn")}</p>
            <div>
              <ButtonLink href="/login?returnTo=/connect/extension" variant="primary">
                {t("nav.signin")}
              </ButtonLink>
            </div>
          </div>
        </>
      )}
    </SiteFrame>
  )
}
