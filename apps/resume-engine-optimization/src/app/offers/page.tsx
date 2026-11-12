import { redirect } from "next/navigation"
import { invoke } from "src/app/rpc"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { listOffers } from "src/server/offers/service"
import { FirstSteps } from "src/app/components/onboarding/FirstSteps"
import { visibleFirstSteps } from "src/app/components/onboarding/first-steps"
import { AddOffer } from "./AddOffer"
import { OfferList } from "./OfferList"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("of.title") }
}

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>
}) {
  const [locale, user, query] = await Promise.all([
    getLocale(),
    invoke(getCurrentUser, null),
    searchParams,
  ])
  const add = typeof query.add === "string" ? query.add.slice(0, 2000) : null
  if (!user) {
    const back = add ? `/offers?add=${encodeURIComponent(add)}` : "/offers"
    redirect(`/login?returnTo=${encodeURIComponent(back)}`)
  }
  const t = translator(locale)
  const offers = await listOffers(user.id)
  const steps = await visibleFirstSteps(user.id, offers)
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <header className="page-head">
        <h1 className="t-h1">{t("of.title")}</h1>
        <p>{t("of.sub")}</p>
      </header>
      {steps ? <FirstSteps steps={steps} /> : null}
      <div className="stack-lg">
        <AddOffer autoFocus={offers.length === 0} initialUrl={add} />
        <OfferList offers={offers} />
      </div>
    </SiteFrame>
  )
}
