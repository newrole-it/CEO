import { redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { Shell } from "src/app/components/Shell"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { VerifyToken } from "./VerifyToken"

export default async function VerifyLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) redirect("/login?error=expired")
  const user = await invoke(getCurrentUser, null)
  return (
    <Shell user={user}>
      <VerifyToken token={token} />
    </Shell>
  )
}
