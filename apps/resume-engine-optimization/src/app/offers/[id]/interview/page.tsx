import "../../../stories/interview.css"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { invoke } from "src/app/rpc"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { getInterviewPrep } from "src/server/interview/prep"
import { llmProvider } from "src/server/llm/client"
import { getOffer } from "src/server/offers/service"
import { PrepScreen } from "./PrepScreen"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("iv.title") }
}

/**
 * Interview preparation for one offer: the latest one stored for the person, shown without a new
 * model call, with a button that makes it again.
 */
export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, locale, user] = await Promise.all([
    params,
    getLocale(),
    invoke(getCurrentUser, null),
  ])
  const jobId = id.slice(0, 64)
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/offers/${jobId}/interview`)}`)
  const offer = await getOffer(user.id, jobId)
  if (!offer) notFound()
  const prep = await getInterviewPrep(user.id, jobId)
  const t = translator(locale)
  return (
    <SiteFrame user={user} locale={locale}>
      <p style={{ marginBottom: 16 }}>
        <Link className="link link--quiet t-sm" href={`/offers/${jobId}`}>
          {t("iv.back")}
        </Link>
      </p>
      <PrepScreen
        job={{ id: jobId, company: offer.company, title: offer.title }}
        initial={
          prep ? { content: prep.content, generatedAt: prep.generatedAt.toISOString() } : null
        }
        hasModel={llmProvider() !== "none"}
      />
    </SiteFrame>
  )
}
