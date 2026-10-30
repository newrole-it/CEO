import db from "db"
import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { listFeedback } from "src/server/preferences/feedback"
import { SavedList, type SavedSegment } from "./SavedList"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("saved.title") }
}

const VERDICT = { liked: "LIKE", applied: "APPLIED", passed: "DISLIKE" } as const

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const [locale, params, user] = await Promise.all([getLocale(), searchParams, invoke(getCurrentUser, null)])
  const t = translator(locale)
  const segment: SavedSegment = params.v === "applied" || params.v === "passed" ? params.v : "liked"
  const [rows, counts] = user
    ? await Promise.all([
        listFeedback(user.id, { verdict: VERDICT[segment], limit: 300 }),
        db.offerFeedback.groupBy({ by: ["verdict"], where: { userId: user.id }, _count: { _all: true } }),
      ])
    : [[], []]
  const count = (verdict: string) => counts.find((row) => row.verdict === verdict)?._count._all ?? 0
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <header className="page-head">
        <h1 className="t-h1">{t("saved.title")}</h1>
      </header>
      <SavedList
        key={segment}
        segment={segment}
        counts={{ liked: count("LIKE"), applied: count("APPLIED"), passed: count("DISLIKE") }}
        rows={rows.map((row) => ({
          jobId: row.jobId,
          title: row.job?.title ?? "—",
          company: row.job?.company ?? "",
          url: row.job?.url ?? null,
          closed: row.job ? row.job.status !== "ACTIVE" : true,
          note: row.note,
          tags: row.tags,
          at: row.updatedAt.toISOString(),
        }))}
      />
    </SiteFrame>
  )
}
