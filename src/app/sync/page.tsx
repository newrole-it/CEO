import { invoke } from "src/app/blitz-server"
import { ButtonLink } from "src/app/components/ds/Button"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { SyncScreen } from "./SyncScreen"
import getSyncStatus from "./queries/getSyncStatus"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("sync.title") }
}

export default async function SyncPage() {
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  const t = translator(locale)
  const initial = user ? await invoke(getSyncStatus, null) : null
  return (
    <SiteFrame user={user} locale={locale}>
      <header className="page-head">
        <h1 className="t-h1">{t("sync.title")}</h1>
        <p>{t("sync.sub")}</p>
      </header>
      {initial ? (
        <SyncScreen initial={initial} />
      ) : (
        <ButtonLink href="/login?returnTo=/sync" variant="primary">
          {t("nav.signin")}
        </ButtonLink>
      )}
    </SiteFrame>
  )
}
