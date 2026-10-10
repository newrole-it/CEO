import { invoke } from "src/app/blitz-server"
import { Shell } from "src/app/components/Shell"
import { LibraryScreen } from "src/app/searches/LibraryScreen"
import getCurrentUser from "src/app/users/queries/getCurrentUser"

export const metadata = { title: "Rejected" }

export default async function RejectedPage() {
  const user = await invoke(getCurrentUser, null)
  return (
    <Shell user={user}>
      <LibraryScreen kind="rejected" />
    </Shell>
  )
}
