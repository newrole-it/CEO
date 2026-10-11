import Link from "next/link"
import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { TriageScreen } from "./TriageScreen"

export const metadata = { title: "Review" }

export default async function TriagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  return (
    <SiteFrame user={user} locale={locale} bare>
      {user ? (
        <TriageScreen id={id} guest={user.role === "GUEST"} />
      ) : (
        <main id="main" className="container page-main">
          <p>
            <Link href="/">Start a search</Link>
          </p>
        </main>
      )}
    </SiteFrame>
  )
}
