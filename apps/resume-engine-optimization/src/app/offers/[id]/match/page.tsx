import { Gauge } from "lucide-react"
import { notFound, redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { ButtonLink } from "@newrole/ui/Button"
import { EmptyState } from "@newrole/ui/primitives"
import { cvPdfFileName } from "@newrole/cv-core/filename"
import { parseTailorNotes } from "@newrole/cv-core/tailor"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { getRound, listRounds } from "src/server/cv/match-rounds"
import { getCv } from "src/server/cv/service"
import { documentsForJob } from "src/server/cv/tailor"
import { MatchDashboard } from "./MatchDashboard"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("mt.title") }
}

/**
 * The match dashboard of one offer: what the steps of "Dostosuj CV" found, kept with the CV
 * written for it, one round at a time (?round=2; the newest by default). An offer with no CV yet
 * goes to the start of tailoring.
 */
export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ round?: string }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const jobId = id.slice(0, 64)
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/offers/${jobId}/match`)}`)
  const documents = await documentsForJob(user.id, jobId)
  if (!documents.cvId) redirect(`/offers/${jobId}/cv`)
  const cv = await getCv(user.id, documents.cvId)
  if (!cv) notFound()

  const t = translator(locale)
  const rounds = (await listRounds(user.id, cv.id)) ?? []
  const asked = Number(query.round)
  const shown = rounds.some((round) => round.number === asked) ? asked : undefined
  const round = rounds.length ? await getRound(user.id, cv.id, shown) : null
  const previous =
    round && round.number > 1 ? await getRound(user.id, cv.id, round.number - 1) : null
  // a CV tailored before rounds were kept, whose notes had no match, has no round
  const notes = round?.notes ?? parseTailorNotes(cv.tailorNotes)
  return (
    <SiteFrame user={user} locale={locale}>
      {notes?.match ? (
        <MatchDashboard
          t={t}
          locale={locale}
          job={{ id: jobId, company: cv.target?.company ?? "", title: cv.target?.title ?? "" }}
          cvId={cv.id}
          letterId={documents.letterId}
          notes={notes}
          match={notes.match}
          fileName={cvPdfFileName(cv.content?.header.name)}
          rounds={rounds}
          round={{
            number: round?.number ?? 1,
            comments: round?.comments ?? [],
            previous: previous ? { number: previous.number, comments: previous.comments } : null,
          }}
        />
      ) : (
        <EmptyState icon={<Gauge />} title={t("mt.none.title")} body={t("mt.none.body")}>
          <ButtonLink href={`/cv/${cv.id}`} variant="primary">
            {t("mt.openCv")}
          </ButtonLink>
        </EmptyState>
      )}
    </SiteFrame>
  )
}
