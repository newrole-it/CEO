import { invoke } from "src/app/rpc"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { listCvs } from "src/server/cv/service"
import { applicationsByCv } from "src/server/cv/sent"
import { listOffers } from "src/server/offers/service"
import { setupBack } from "src/app/setup/back"
import { FirstSteps } from "src/app/components/onboarding/FirstSteps"
import { visibleFirstSteps } from "src/app/components/onboarding/first-steps"
import { CvList } from "./CvList"

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
  const [cvs, back, offers, sent] = await Promise.all([
    user ? listCvs(user.id, { letters: true }) : [],
    setupBack(user?.id ?? null),
    user ? listOffers(user.id) : [],
    user ? applicationsByCv(user.id) : {},
  ])
  const steps = user ? await visibleFirstSteps(user.id, offers) : null
  // ?tab=offers: the dashboard links straight to the CVs written for offers
  const filter = query.tab === "offers" ? "offers" : "all"
  const closedJobs = offers.flatMap((offer) => (offer.closed ? [offer.jobId] : []))
  return (
    <SiteFrame user={user} locale={locale} setupBack={back}>
      <header className="page-head">
        <h1 className="t-h1">{t("cv.title")}</h1>
        <p>{t("cv.sub")}</p>
      </header>
      {steps ? <FirstSteps steps={steps} /> : null}
      <CvList
        signedIn={Boolean(user)}
        initial={cvs}
        sent={sent}
        closedJobs={closedJobs}
        filter={filter}
        after={back}
      />
    </SiteFrame>
  )
}
