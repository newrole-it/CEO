import { linkedInCredentials } from "src/server/auth/linkedin"
import { linkedInBrowserAvailable } from "@newrole/profile/linkedin-browser"
import { isLocalInstall } from "src/server/local-install"
import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { setupBack } from "src/app/setup/back"
import { Onboarding, type Step } from "./Onboarding"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("onb.source.title") }
}

function stepOf(params: { step?: string; via?: string }): Step {
  if (params.step === "linkedin-next" || (params.step === "profile" && params.via === "linkedin")) {
    return "linkedin-next"
  }
  if (params.step === "linkedin") return "linkedin"
  if (params.step === "reading") return "reading"
  return "source"
}

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; via?: string }>
}) {
  const [locale, params, user] = await Promise.all([
    getLocale(),
    searchParams,
    invoke(getCurrentUser, null),
  ])
  const back = await setupBack(user?.id ?? null)
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? null
  return (
    <SiteFrame user={user} locale={locale} variant="focus">
      <Onboarding
        initialStep={stepOf(params)}
        linkedIn={Boolean(linkedInCredentials())}
        browserImport={linkedInBrowserAvailable(isLocalInstall())}
        firstName={user && user.role !== "GUEST" ? firstName : null}
        photo={user?.imageUrl ?? null}
        after={back ?? "/cv?welcome=1"}
      />
    </SiteFrame>
  )
}
