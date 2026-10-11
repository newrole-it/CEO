import { redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { VerifyToken } from "./VerifyToken"

export default async function VerifyLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) redirect("/login?error=expired")
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  return (
    <SiteFrame user={user} locale={locale}>
      <VerifyToken token={token} />
    </SiteFrame>
  )
}
