import { ArrowLeft, Scale } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Banner, EmptyState } from "@newrole/ui/primitives"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import { invoke } from "src/app/rpc"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { evaluationModelAvailable, getEvaluation } from "src/server/evaluation/service"
import { getOffer } from "src/server/offers/service"
import { evaluationPath } from "./decision"
import { EvaluationReport } from "./EvaluationReport"
import { RunEvaluation } from "./EvaluationRun"
import "./evaluation.css"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("ev.title") }
}

/**
 * "Is it worth applying": the evaluation of one offer against the person's general CV and
 * profile, made before they tailor a CV or apply (src/server/evaluation/service.ts). The page
 * shows the one kept for the offer and says when it is out of date; the person starts a new one.
 */
export default async function EvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, locale, user] = await Promise.all([
    params,
    getLocale(),
    invoke(getCurrentUser, null),
  ])
  const jobId = id.slice(0, 64)
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(evaluationPath(jobId))}`)
  const offer = await getOffer(user.id, jobId)
  if (!offer) notFound()
  const view = await getEvaluation(user.id, jobId)
  const t = translator(locale)
  return (
    <SiteFrame user={user} locale={locale}>
      <div className="mt stack-lg">
        <header className="page-head mt-head">
          <p>
            <Link className="link link--quiet t-sm" href={`/offers/${jobId}`}>
              <ArrowLeft aria-hidden size={14} /> {t("ev.back")}
            </Link>
          </p>
          <h1 className="t-h1">{t("ev.title")}</h1>
          <p className="muted">{t("ev.sub", { title: offer.title, company: offer.company })}</p>
        </header>
        {view ? (
          <EvaluationReport
            t={t}
            locale={locale}
            job={{ id: jobId, cvId: offer.cvId }}
            view={view}
          />
        ) : (
          <>
            {evaluationModelAvailable() ? null : (
              <Banner tone="info">{t("ev.none.noModel")}</Banner>
            )}
            <EmptyState icon={<Scale />} title={t("ev.none.title")} body={t("ev.none.body")}>
              <RunEvaluation jobId={jobId} again={false} />
            </EmptyState>
          </>
        )}
      </div>
    </SiteFrame>
  )
}
