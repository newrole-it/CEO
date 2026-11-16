import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import { invoke } from "src/app/rpc"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { getOffer } from "src/server/offers/service"
import { getCompanyBrief } from "src/server/research/service"
import { BriefReport } from "./BriefReport"
import { companyBriefPath } from "./paths"
import "./company.css"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("cr.title") }
}

/**
 * The company brief of one offer (src/server/research/service.ts): what the database holds about
 * the employer, read now, and the brief kept for the person and the company, shown without a new
 * model call. Every point carries its source.
 */
export default async function CompanyBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, locale, user] = await Promise.all([
    params,
    getLocale(),
    invoke(getCurrentUser, null),
  ])
  const jobId = id.slice(0, 64)
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(companyBriefPath(jobId))}`)
  const offer = await getOffer(user.id, jobId)
  if (!offer) notFound()
  const view = await getCompanyBrief(user.id, jobId)
  if (!view) notFound()
  const t = translator(locale)
  return (
    <SiteFrame user={user} locale={locale}>
      <div className="cr stack-lg">
        <header className="page-head">
          <p>
            <Link className="link link--quiet t-sm" href={`/offers/${encodeURIComponent(jobId)}`}>
              <ArrowLeft aria-hidden size={14} /> {t("cr.back")}
            </Link>
          </p>
          <h1 className="t-h1">{t("cr.title")}</h1>
          <p className="muted">
            {t("cr.sub", { company: view.records.company.name, title: offer.title })}
          </p>
        </header>
        <BriefReport t={t} locale={locale} view={view} now={new Date()} />
      </div>
    </SiteFrame>
  )
}
