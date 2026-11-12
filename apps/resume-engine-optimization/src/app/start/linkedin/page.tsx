import { appOrigin } from "src/server/auth/email"
import { linkedInSetup } from "src/server/auth/linkedin"
import { invoke } from "src/app/rpc"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { LinkedInSetup } from "./LinkedInSetup"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("li.setup.title") }
}

export default async function LinkedInSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ check?: string }>
}) {
  const [locale, params, user] = await Promise.all([
    getLocale(),
    searchParams,
    invoke(getCurrentUser, null),
  ])
  const setup = linkedInSetup(appOrigin())
  return (
    <SiteFrame user={user} locale={locale} variant="focus">
      <LinkedInSetup
        configured={setup.configured}
        redirectUri={setup.redirectUri}
        developerUrl={`${setup.developerUrl}/new`}
        envKeys={[...setup.envKeys]}
        checked={params.check === "1"}
      />
    </SiteFrame>
  )
}
