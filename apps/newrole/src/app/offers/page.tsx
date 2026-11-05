import { redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { listOffers } from "src/server/offers/service"
import { AddOffer } from "./AddOffer"
import { OfferList } from "./OfferList"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("of.title") }
}

export default async function OffersPage() {
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  if (!user) redirect("/login?returnTo=/offers")
  const t = translator(locale)
  const offers = await listOffers(user.id)
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <header className="page-head">
        <h1 className="t-h1">{t("of.title")}</h1>
        <p>{t("of.sub")}</p>
      </header>
      <div className="stack-lg">
        <AddOffer autoFocus={offers.length === 0} />
        <OfferList offers={offers} />
      </div>
    </SiteFrame>
  )
}
