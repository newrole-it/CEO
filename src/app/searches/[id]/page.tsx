import Link from "next/link"
import { invoke } from "src/app/blitz-server"
import { Shell } from "src/app/components/Shell"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { SearchScreen } from "./SearchScreen"

export default async function SearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await invoke(getCurrentUser, null)
  return (
    <Shell user={user}>
      {user ? (
        <SearchScreen id={id} />
      ) : (
        <section className="hero">
          <h1>This scan belongs to a browser session</h1>
          <p className="lede">
            Start a search from the home page, or <Link href="/login">sign in</Link>.
          </p>
        </section>
      )}
    </Shell>
  )
}
