import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { LinkTabs } from "@newrole/ui/primitives"
import { listCvs } from "src/server/cv/service"
import { listOffers } from "src/server/offers/service"
import { setupBack } from "src/app/setup/back"
import { FirstSteps } from "src/app/components/onboarding/FirstSteps"
import { visibleFirstSteps } from "src/app/components/onboarding/first-steps"
import { CvList, type OfferState } from "./CvList"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("cv.title") }
}

export default async function CvPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const [locale, user, query] = await Promise.all([
    getLocale(),
    invoke(getCurrentUser, null),
    searchParams,
  ])
  const t = translator(locale)
  const [cvs, back, offers] = await Promise.all([
    user ? listCvs(user.id, { letters: true }) : [],
    setupBack(user?.id ?? null),
    user ? listOffers(user.id) : [],
  ])
  const steps = user ? await visibleFirstSteps(user.id, offers) : null
  const tab = query.tab === "offers" ? "offers" : "general"
  const general = cvs.filter((cv) => !cv.target).length
  const tailored = new Set(cvs.flatMap((cv) => (cv.target ? [cv.target.jobId ?? cv.id] : []))).size
  const states: Record<string, OfferState> = Object.fromEntries(
    offers.map((offer) => [
      offer.jobId,
      {
        applicationId: offer.application?.id ?? null,
        status: offer.application?.status ?? null,
        closed: offer.closed,
      },
    ])
  )
  return (
    <SiteFrame user={user} locale={locale} width="narrow" setupBack={back}>
      <header className="page-head">
        <h1 className="t-h1">{t("cv.title")}</h1>
        <p>{t("cv.sub")}</p>
      </header>
      {steps ? <FirstSteps steps={steps} /> : null}
      {user ? (
        <div className="cv-tabs">
          <LinkTabs
            label={t("cv.title")}
            items={[
              {
                href: "/cv",
                label: `${t("cvt.general")} (${general})`,
                current: tab === "general",
              },
              {
                href: "/cv?tab=offers",
                label: `${t("cvt.offers")} (${tailored})`,
                current: tab === "offers",
              },
            ]}
          />
        </div>
      ) : null}
      <CvList signedIn={Boolean(user)} initial={cvs} tab={tab} offers={states} after={back} />
    </SiteFrame>
  )
}
