import { notFound } from "next/navigation"
import { invoke } from "src/app/rpc"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { isLocalInstall } from "src/server/local-install"
import { setupStatus } from "src/server/setup/status"
import { SetupScreen } from "./SetupScreen"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("nav.setup") }
}

export default async function SetupPage() {
  if (!isLocalInstall()) notFound()
  // The session lives in the database. This page has to work when the database does not.
  const [locale, user] = await Promise.all([
    getLocale(),
    invoke(getCurrentUser, null).catch(() => null),
  ])
  const status = await setupStatus(user?.id ?? null)
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <SetupScreen initial={status} />
    </SiteFrame>
  )
}
