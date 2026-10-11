import { Suspense } from "react"
import { redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { LoginForm } from "../components/LoginForm"

export default async function LoginPage() {
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  if (user && user.role !== "GUEST") redirect("/")
  return (
    <SiteFrame user={user} locale={locale}>
      <Suspense fallback={<p className="hint">Loading sign-in…</p>}>
        <LoginForm />
      </Suspense>
    </SiteFrame>
  )
}
