import { redirect } from "next/navigation"
import { invoke } from "src/app/rpc"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { EVALUATION_LIMIT } from "src/server/offer-search/run"
import { OfferSearchScreen } from "./OfferSearchScreen"
import getOfferSearch from "./queries/getOfferSearch"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("os.title") }
}

/**
 * "Znajdź oferty": filters proposed from the profile (or the last search's), a search on the web
 * in the background, and its results to add to Offers or dismiss (src/server/offer-search).
 */
export default async function OfferSearchPage() {
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  if (!user) redirect(`/login?returnTo=${encodeURIComponent("/offers/search")}`)
  const view = await invoke(getOfferSearch, null)
  return (
    <SiteFrame user={user} locale={locale}>
      <OfferSearchScreen initial={view} evaluationLimit={EVALUATION_LIMIT} />
    </SiteFrame>
  )
}
