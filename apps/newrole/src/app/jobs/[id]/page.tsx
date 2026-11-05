import Link from "next/link"
import { notFound } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { getOfferDetail } from "src/server/preferences/detail"
import { OfferPage } from "./OfferPage"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, locale] = await Promise.all([params, getLocale()])
  const jobId = id.slice(0, 64)
  // null means the offer is gone; a database error goes to error.tsx, not to a 404
  const detail = await getOfferDetail(jobId, null, locale)
  if (!detail) return { title: translator(locale)("od.notFound") }
  return {
    title: `${detail.offer.title} · ${detail.offer.company}`,
    alternates: { canonical: `/jobs/${encodeURIComponent(jobId)}` },
  }
}

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, locale, user] = await Promise.all([
    params,
    getLocale(),
    invoke(getCurrentUser, null),
  ])
  // null means the offer is gone; a database error goes to error.tsx, not to a 404
  const detail = await getOfferDetail(id.slice(0, 64), user?.id ?? null, locale)
  if (!detail) notFound()
  const t = translator(locale)
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <p style={{ marginBottom: 16 }}>
        <Link className="link link--quiet t-sm" href="/jobs">
          {t("od.back")}
        </Link>
      </p>
      <OfferPage detail={detail} />
    </SiteFrame>
  )
}
