import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { getLocale } from "src/app/i18n/server"
import { LibraryScreen } from "src/app/searches/LibraryScreen"
import getCurrentUser from "src/app/users/queries/getCurrentUser"

export const metadata = { title: "Interested" }

export default async function InterestedPage() {
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  return (
    <SiteFrame user={user} locale={locale}>
      <LibraryScreen kind="interested" />
    </SiteFrame>
  )
}
