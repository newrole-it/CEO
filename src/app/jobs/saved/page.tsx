import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { isSavedSegment, listSaved, type SavedSegment } from "src/server/preferences/saved"
import { SavedList } from "./SavedList"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("saved.title") }
}

const NONE: Record<SavedSegment, number> = { liked: 0, ready: 0, applied: 0, passed: 0 }

export default async function SavedPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>
}) {
  const [locale, params, user] = await Promise.all([
    getLocale(),
    searchParams,
    invoke(getCurrentUser, null),
  ])
  const t = translator(locale)
  const segment: SavedSegment = isSavedSegment(params.v) ? params.v : "liked"
  const { offers, counts } = user ? await listSaved(user.id, segment) : { offers: [], counts: NONE }
  const doc = (value: { id: string; language: "pl" | "en"; updatedAt: Date } | null) =>
    value ? { ...value, updatedAt: value.updatedAt.toISOString() } : null
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <header className="page-head">
        <h1 className="t-h1">{t("saved.title")}</h1>
      </header>
      <SavedList
        key={segment}
        segment={segment}
        counts={counts}
        rows={offers.map((offer) => ({
          ...offer,
          at: offer.at.toISOString(),
          cv: doc(offer.cv),
          letter: doc(offer.letter),
        }))}
      />
    </SiteFrame>
  )
}
