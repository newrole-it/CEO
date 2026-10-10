import { invoke } from "src/app/blitz-server"
import { Shell } from "src/app/components/Shell"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { ProfileEditor } from "./ProfileEditor"
import getProfile from "./queries/getProfile"

export const metadata = { title: "Profile" }

export default async function ProfilePage() {
  const user = await invoke(getCurrentUser, null)
  const profile = user ? await invoke(getProfile, null) : null
  return (
    <Shell user={user}>
      <ProfileEditor
        initial={profile?.draft ?? null}
        signedIn={Boolean(user && user.role !== "GUEST")}
      />
    </Shell>
  )
}
