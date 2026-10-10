import {redirect} from "next/navigation"
import {invoke} from "./blitz-server"
import {SearchForm} from "./components/SearchForm"
import {Shell} from "./components/Shell"
import getCurrentUser from "./users/queries/getCurrentUser"
import listSearches from "./searches/queries/listSearches"
import Link from "next/link"

export default async function Home() {
  const currentUser = await invoke(getCurrentUser, null)
  if (!currentUser) redirect("/login")
  const searches = await invoke(listSearches, null)
  return (
    <Shell name={currentUser.name || currentUser.email}>
      <section className="hero">
        <p className="kicker">Public listings</p>
        <h1>Find the offer, not the portal.</h1>
        <p className="lede">
          Type a role. Jobscanner expands it into related titles, then reads public company boards and ranks what is
          actually open. Every result links back to the original listing.
        </p>
      </section>
      <SearchForm />
      {searches.length ? (
        <>
          <div className="section-head">
            <h2>Recent</h2>
            <Link href="/searches">All scans</Link>
          </div>
          <div className="search-list">
            {searches.slice(0, 5).map((search) => (
              <Link key={search.id} href={`/searches/${search.id}`} className="search-link">
                <strong>{search.phrase}</strong>
                <span>{search.latest ? search.latest.message || search.latest.status : "Queued"}</span>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </Shell>
  )
}
