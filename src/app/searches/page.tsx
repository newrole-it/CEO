import Link from "next/link"
import { invoke } from "src/app/blitz-server"
import { Shell } from "src/app/components/Shell"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import listSearches from "./queries/listSearches"

export const metadata = { title: "Saved searches" }

export default async function SearchesPage() {
  const user = await invoke(getCurrentUser, null)
  const searches = user ? await invoke(listSearches, null) : []
  return (
    <Shell user={user}>
      <div className="hero">
        <p className="kicker">Library</p>
        <h1>Saved searches</h1>
        <p className="lede">
          Each phrase stays on this account. Opening one shows the last results. Running it again
          marks offers that were not there before.
        </p>
      </div>
      {!user ? (
        <div className="empty-card">
          <p>
            <Link href="/login">Sign in</Link> to see searches saved on an account. A search started
            in this browser is still available from its own link.
          </p>
        </div>
      ) : searches.length === 0 ? (
        <div className="empty-card">
          <h2>No saved searches yet</h2>
          <p className="lede">
            <Link href="/">Search for a role</Link> and it will be kept here.
          </p>
        </div>
      ) : (
        <div className="search-list">
          {searches.map((search) => (
            <Link key={search.id} href={`/searches/${search.id}`} className="search-link">
              <strong>{search.phrase}</strong>
              <span>
                {search.latest
                  ? `${search.latest.status.toLowerCase()} · ${search.latest.matchedJobs} offers${
                      search.latest.newJobs ? ` · ${search.latest.newJobs} new` : ""
                    }`
                  : "queued"}
              </span>
              <span>
                {[search.locationHint, search.workMode !== "ANY" ? search.workMode : null]
                  .filter(Boolean)
                  .join(" · ") || "Any location"}
              </span>
              <span>
                {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
                  search.createdAt
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  )
}
