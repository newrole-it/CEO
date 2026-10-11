import Link from "next/link"
import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { SearchScreen } from "./SearchScreen"

export default async function SearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  return (
    <SiteFrame user={user} locale={locale}>
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
    </SiteFrame>
  )
}
