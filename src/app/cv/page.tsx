import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { listCvs } from "src/server/cv/service"
import { setupBack } from "src/app/setup/back"
import { CvList } from "./CvList"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("cv.title") }
}

export default async function CvPage() {
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  const t = translator(locale)
  const [cvs, back] = await Promise.all([
    user ? listCvs(user.id, { letters: true }) : [],
    setupBack(user?.id ?? null),
  ])
  return (
    <SiteFrame user={user} locale={locale} width="narrow" setupBack={back}>
      <header className="page-head">
        <h1 className="t-h1">{t("cv.title")}</h1>
        <p>{t("cv.sub")}</p>
      </header>
      <CvList signedIn={Boolean(user)} initial={cvs} after={back} />
    </SiteFrame>
  )
}
