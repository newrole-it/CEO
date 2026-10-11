import db from "db"
import { dedupeSavedSearches, normalizeSearchText } from "src/shared/saved-searches"
import { invoke } from "./blitz-server"
import { Landing } from "./components/landing/Landing"
import { SiteFrame } from "./components/site/SiteFrame"
import { getLocale } from "./i18n/server"
import listSearches from "./searches/queries/listSearches"
import getCurrentUser from "./users/queries/getCurrentUser"

export default async function Home() {
  const locale = await getLocale()
  const currentUser = await invoke(getCurrentUser, null)
  const signedIn = Boolean(currentUser && currentUser.role !== "GUEST")
  const searches = signedIn ? await invoke(listSearches, null) : []
  const indexed = await db.job.count({ where: { status: "ACTIVE" } })
  const previewRows = await db.job.findMany({
    where: { status: "ACTIVE" },
    orderBy: { firstSeenAt: "desc" },
    take: 24,
    select: {
      id: true,
      title: true,
      locationText: true,
      company: { select: { name: true } },
    },
  })
  const seenPreview = new Set<string>()
  const preview: { id: string; title: string; company: string; location: string }[] = []
  for (const job of previewRows) {
    const label = `${normalizeSearchText(job.company.name)}\u0000${normalizeSearchText(job.title)}`
    if (seenPreview.has(label)) continue
    seenPreview.add(label)
    preview.push({
      id: job.id,
      title: job.title,
      company: job.company.name,
      location: job.locationText || "",
    })
    if (preview.length === 3) break
  }
  const saved = dedupeSavedSearches(
    searches.map((search) => ({
      id: search.id,
      phrase: search.phrase,
      locationHint: search.locationHint,
      createdAt: search.createdAt,
      newJobs: search.latest?.newJobs ?? 0,
    }))
  ).map(({ id, phrase, newJobs }) => ({ id, phrase, newJobs: newJobs ?? 0 }))
  return (
    <SiteFrame user={currentUser} locale={locale} bare>
      <Landing
        locale={locale}
        signedIn={signedIn}
        indexed={indexed}
        searches={saved}
        preview={preview}
      />
    </SiteFrame>
  )
}
