import db from "db"
import { FileText } from "lucide-react"
import { notFound, redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { ButtonLink } from "@newrole/ui/Button"
import { EmptyState } from "@newrole/ui/primitives"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { listCvs } from "src/server/cv/service"
import { documentsForJob, loadTailorJob } from "src/server/cv/tailor"
import { NewroleTailorStart } from "./NewroleTailorStart"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("tl.start.title") }
}

/** "Dostosuj CV" on an offer: opens what was already written for it, or the start of it. */
export default async function TailorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const jobId = id.slice(0, 64)
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/jobs/${jobId}/cv`)}`)
  const documents = await documentsForJob(user.id, jobId)
  if (documents.cvId) redirect(`/cv/${documents.cvId}`)
  const job = await loadTailorJob(jobId)
  if (!job) notFound()

  const t = translator(locale)
  const [cvs, profiles] = await Promise.all([
    listCvs(user.id),
    db.candidateProfile.count({ where: { userId: user.id } }),
  ])
  const general = cvs.filter((cv) => !cv.target)
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <header className="page-head">
        <h1 className="t-h1">{t("tl.start.title")}</h1>
      </header>
      {general.length || profiles ? (
        <NewroleTailorStart
          job={{
            id: job.id,
            company: job.company,
            title: job.title,
            language: job.language,
            withheld: job.withheld,
          }}
          cvs={general.map((cv) => ({ id: cv.id, title: cv.title, isDefault: cv.isDefault }))}
          hasLetter={Boolean(documents.letterId)}
        />
      ) : (
        <EmptyState icon={<FileText />} title={t("tl.start.noCv")} body={t("tl.start.noCvBody")}>
          <ButtonLink href="/cv" variant="primary">
            {t("tl.start.noCvCta")}
          </ButtonLink>
        </EmptyState>
      )}
    </SiteFrame>
  )
}
