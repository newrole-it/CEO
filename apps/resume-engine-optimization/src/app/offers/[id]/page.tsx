import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { invoke } from "src/app/rpc"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { getOffer } from "src/server/offers/service"
import { OfferWorkspace } from "./OfferWorkspace"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, locale, user] = await Promise.all([
    params,
    getLocale(),
    invoke(getCurrentUser, null),
  ])
  const t = translator(locale)
  const offer = user ? await getOffer(user.id, id.slice(0, 64)) : null
  return { title: offer ? `${offer.title} · ${offer.company}` : t("ow.notFound") }
}

/** One offer the person works on: its whole text, the CV and letter for it, its application. */
export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, locale, user] = await Promise.all([
    params,
    getLocale(),
    invoke(getCurrentUser, null),
  ])
  const jobId = id.slice(0, 64)
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/offers/${jobId}`)}`)
  // null means the offer is unknown; a database error goes to error.tsx, not to a 404
  const offer = await getOffer(user.id, jobId)
  if (!offer) notFound()
  const t = translator(locale)
  return (
    <SiteFrame user={user} locale={locale}>
      <p style={{ marginBottom: 16 }}>
        <Link className="link link--quiet t-sm" href="/offers">
          {t("ow.back")}
        </Link>
      </p>
      <OfferWorkspace offer={offer} />
    </SiteFrame>
  )
}
