import { notFound } from "next/navigation"
import { invoke } from "src/app/rpc"
import { ButtonLink } from "@newrole/ui/Button"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { usageTabVisible } from "src/server/llm/usage"
import getUsage from "./queries/getUsage"
import { DEFAULT_USAGE_PERIOD, USAGE_PERIODS, type UsagePeriod } from "src/shared/usage"
import { UsageScreen } from "./UsageScreen"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("usage.title") }
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const [locale, user, params] = await Promise.all([
    getLocale(),
    invoke(getCurrentUser, null),
    searchParams,
  ])
  if (user && !usageTabVisible(user.role)) notFound()
  const t = translator(locale)
  const period = (USAGE_PERIODS as readonly string[]).includes(params.period ?? "")
    ? (params.period as UsagePeriod)
    : DEFAULT_USAGE_PERIOD
  const usage = user ? await invoke(getUsage, { period }) : null
  return (
    <SiteFrame user={user} locale={locale}>
      <header className="page-head">
        <h1 className="t-h1">{t("usage.title")}</h1>
        <p>{t("usage.sub")}</p>
      </header>
      {usage ? (
        <UsageScreen usage={usage} locale={locale} />
      ) : (
        <ButtonLink href="/login?returnTo=/usage" variant="primary">
          {t("nav.signin")}
        </ButtonLink>
      )}
    </SiteFrame>
  )
}
