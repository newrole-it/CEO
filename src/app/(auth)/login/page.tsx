import { Suspense } from "react"
import { redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { Shell } from "src/app/components/Shell"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { LoginForm } from "../components/LoginForm"

export default async function LoginPage() {
  const user = await invoke(getCurrentUser, null)
  if (user && user.role !== "GUEST") redirect("/")
  return (
    <Shell user={user}>
      <Suspense fallback={<p className="hint">Loading sign-in…</p>}>
        <LoginForm />
      </Suspense>
    </Shell>
  )
}
