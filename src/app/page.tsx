import Link from "next/link"
import { invoke } from "./blitz-server"
import { SearchForm } from "./components/SearchForm"
import { Shell } from "./components/Shell"
import getCurrentUser from "./users/queries/getCurrentUser"
import listSearches from "./searches/queries/listSearches"

export default async function Home() {
  const currentUser = await invoke(getCurrentUser, null)
  const searches =
    currentUser && currentUser.role !== "GUEST" ? await invoke(listSearches, null) : []
  return (
    <Shell user={currentUser}>
      <section className="hero">
        <p className="kicker">Public listings</p>
        <h1>Find the offer, not the portal.</h1>
        <p className="lede">
          Type a role. Jobscanner ranks what is open on public company boards. Every result links
          back to the original listing. Sign in when you want the ranking to use your profile.
        </p>
      </section>
      <SearchForm />
      {searches.length ? (
        <>
          <div className="section-head">
            <h2>Saved searches</h2>
            <Link href="/searches">All</Link>
          </div>
          <div className="search-list">
            {searches.slice(0, 5).map((search) => (
              <Link key={search.id} href={`/searches/${search.id}`} className="search-link">
                <strong>{search.phrase}</strong>
                <span>
                  {search.latest ? search.latest.message || search.latest.status : "Queued"}
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </Shell>
  )
}
