import db from "db"
import type { ShellUser } from "../Shell"
import type { Locale } from "src/app/i18n/copy"
import { SiteFooter } from "./SiteFooter"
import { SiteHeader } from "./SiteHeader"

export async function SiteFrame({
  user,
  locale,
  children,
  bare,
}: {
  user?: ShellUser
  locale: Locale
  children: React.ReactNode
  bare?: boolean
}) {
  const signedIn = Boolean(user && user.role !== "GUEST")
  const interested = signedIn
    ? await db.jobMatch.count({
        where: { interestedAt: { not: null }, savedSearch: { userId: user!.id } },
      })
    : 0
  return (
    <>
      <SiteHeader user={user} interested={interested} />
      {bare ? (
        children
      ) : (
        <main id="main" className="container page-main">
          {children}
        </main>
      )}
      <SiteFooter locale={locale} />
    </>
  )
}
