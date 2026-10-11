import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { getLocale } from "src/app/i18n/server"
import { safeReturnTo } from "src/shared/return-to"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { ProfileEditor } from "./ProfileEditor"
import getProfile from "./queries/getProfile"

export const metadata = { title: "Profile" }

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>
}) {
  const locale = await getLocale()
  const { returnTo } = await searchParams
  const user = await invoke(getCurrentUser, null)
  const profile = user ? await invoke(getProfile, null) : null
  return (
    <SiteFrame user={user} locale={locale}>
      <ProfileEditor
        initial={profile?.draft ?? null}
        signedIn={Boolean(user && user.role !== "GUEST")}
        returnTo={safeReturnTo(returnTo)}
      />
    </SiteFrame>
  )
}
