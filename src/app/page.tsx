import db from "db"
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
    take: 3,
    select: {
      title: true,
      locationText: true,
      company: { select: { name: true } },
    },
  })
  return (
    <SiteFrame user={currentUser} locale={locale} bare>
      <Landing
        locale={locale}
        signedIn={signedIn}
        indexed={indexed}
        searches={searches.map((search) => ({
          id: search.id,
          phrase: search.phrase,
          newJobs: search.latest?.newJobs ?? 0,
        }))}
        preview={previewRows.map((job) => ({
          title: job.title,
          company: job.company.name,
          location: job.locationText || "",
        }))}
      />
    </SiteFrame>
  )
}
