import {redirect} from "next/navigation"
import {invoke} from "src/app/blitz-server"
import {Shell} from "src/app/components/Shell"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import {SearchScreen} from "./SearchScreen"

export default async function SearchPage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params
  const user = await invoke(getCurrentUser, null)
  if (!user) redirect("/login")
  return (
    <Shell name={user.name || user.email}>
      <SearchScreen id={id} />
    </Shell>
  )
}
