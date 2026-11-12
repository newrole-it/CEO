import { redirect } from "next/navigation"
import { invoke } from "src/app/rpc"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { maskEmail, peekMagicLink } from "src/server/auth/magic-link"
import { VerifyToken } from "./VerifyToken"

export default async function VerifyLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>
}) {
  const { token, next } = await searchParams
  if (!token) redirect("/login?error=expired")
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  // Read only: mail scanners and link previews open this page, and someone may have sent you a
  // link to their own account. The token is used up by the button, once the person saw the email.
  const email = token.length <= 200 ? await peekMagicLink(token) : null
  const switching = Boolean(email && user && user.role !== "GUEST" && user.email !== email)
  return (
    <SiteFrame user={user} locale={locale}>
      <VerifyToken
        token={token}
        next={next ?? null}
        account={email ? maskEmail(email) : null}
        switching={switching}
      />
    </SiteFrame>
  )
}
