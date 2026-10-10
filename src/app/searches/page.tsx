import Link from "next/link"
import {redirect} from "next/navigation"
import {invoke} from "src/app/blitz-server"
import {Shell} from "src/app/components/Shell"
import {Button} from "src/app/components/ui/button"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import listSearches from "./queries/listSearches"

export const metadata = {title: "Past scans"}

export default async function SearchesPage() {
  const user = await invoke(getCurrentUser, null)
  if (!user) redirect("/login")
  const searches = await invoke(listSearches, null)
  return (
    <Shell name={user.name || user.email}>
      <div className="hero">
        <p className="kicker">Library</p>
        <h1>Past scans</h1>
        <p className="lede">Each phrase is kept. Opening one shows the last results, and running it again marks offers that were not there before.</p>
        <Button asChild>
          <Link href="/">New scan</Link>
        </Button>
      </div>
      {searches.length === 0 ? (
        <div className="empty-card">No scans yet.</div>
      ) : (
        <div className="search-list">
          {searches.map((search) => (
            <Link key={search.id} href={`/searches/${search.id}`} className="search-link">
              <strong>{search.phrase}</strong>
              <span>
                {search.latest
                  ? `${search.latest.status.toLowerCase()} · ${search.latest.matchedJobs} offers${search.latest.newJobs ? ` · ${search.latest.newJobs} new` : ""}`
                  : "queued"}
              </span>
              <span>
                {[search.locationHint, search.workMode !== "ANY" ? search.workMode : null].filter(Boolean).join(" · ") ||
                  "Any location"}
              </span>
              <span>{new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short"}).format(search.createdAt)}</span>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  )
}
