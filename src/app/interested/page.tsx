import { invoke } from "src/app/blitz-server"
import { Shell } from "src/app/components/Shell"
import { LibraryScreen } from "src/app/searches/LibraryScreen"
import getCurrentUser from "src/app/users/queries/getCurrentUser"

export const metadata = { title: "Interested" }

export default async function InterestedPage() {
  const user = await invoke(getCurrentUser, null)
  return (
    <Shell user={user}>
      <LibraryScreen kind="interested" />
    </Shell>
  )
}
