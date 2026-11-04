import Link from "next/link"
import { cookies } from "next/headers"
import db from "db"
import { linkedInCredentials } from "src/server/auth/linkedin"
import { isLocalInstall } from "src/server/local-install"
import { offerIndexEnabled } from "src/server/offer-index"
import { listWatched } from "src/server/watchlist/watch"
import { translator, type Locale } from "src/app/i18n/copy"
import { MergeDecisions } from "src/app/searches/MergeDecisions"
import { ToastProvider } from "@newrole/ui/interactive"
import { LogoLockup } from "./Brand"
import { LinkedInSignInProvider } from "./LinkedInSignIn"
import { COMPANIES_SEEN_COOKIE, type ShellUser } from "./links"
import { SiteFooter } from "./SiteFooter"
import { SiteHeader } from "./SiteHeader"
import { TabBar } from "./TabBar"
import { UrlToasts } from "./UrlToasts"

export type { ShellUser }

async function navCounts(
  userId: number
): Promise<{ liked: number; newAtWatched: number; hasProfile: boolean }> {
  const jar = await cookies()
  const seen = Number(jar.get(COMPANIES_SEEN_COOKIE)?.value)
  const since = Number.isFinite(seen) && seen > 0 ? new Date(seen) : undefined
  const [liked, profile, watched] = await Promise.all([
    db.offerFeedback.count({ where: { userId, verdict: "LIKE" } }).catch(() => 0),
    db.candidateProfile.findUnique({ where: { userId }, select: { id: true } }).catch(() => null),
    since ? listWatched(userId, { since }).catch(() => []) : Promise.resolve([]),
  ])
  return {
    liked,
    hasProfile: Boolean(profile),
    newAtWatched: watched.reduce((sum, row) => sum + (row.newJobs ?? 0), 0),
  }
}

/**
 * Page frame. `variant`:
 * - "page" (default): header, <main class="container page">, footer
 * - "bare": header + footer, children render their own sections (landing)
 * - "focus": onboarding frame, logo + skip link, no nav, no footer
 */
export async function SiteFrame({
  user,
  locale,
  children,
  variant = "page",
  width,
  bare,
  setupBack,
}: {
  user?: ShellUser
  locale: Locale
  children: React.ReactNode
  variant?: "page" | "bare" | "focus"
  width?: "narrow" | "focus"
  /** @deprecated use variant="bare" */
  bare?: boolean
  /** A setup step's page while the checklist is unfinished: a way back to /setup (see setupBack) */
  setupBack?: string | null
}) {
  const kind = bare ? "bare" : variant
  const t = translator(locale)
  const signedIn = Boolean(user && user.role !== "GUEST")
  const counts = user ? await navCounts(user.id) : { liked: 0, newAtWatched: 0, hasProfile: false }
  const linkedIn = Boolean(linkedInCredentials())
  const app = Boolean(user)

  const main =
    kind === "page" ? (
      <main
        id="main"
        className={`container page${
          width === "narrow" ? " container--narrow" : width === "focus" ? " container--focus" : ""
        }`}
      >
        {children}
      </main>
    ) : (
      <main id="main">{children}</main>
    )

  return (
    <LinkedInSignInProvider enabled={linkedIn}>
      <ToastProvider>
        <div className="app-root">
          <a className="skip-link" href="#main">
            {t("skip")}
          </a>
          <MergeDecisions enabled={signedIn} />
          <UrlToasts />
          {kind === "focus" ? (
            <header className="container focus-header">
              <Link className="brand" href="/" aria-label={t("brandHome")}>
                <LogoLockup />
              </Link>
              <Link className="link link--quiet t-sm" href="/jobs?tab=all">
                {t("onb.skip")}
              </Link>
            </header>
          ) : (
            <SiteHeader
              user={user ?? null}
              liked={counts.liked}
              newAtWatched={counts.newAtWatched}
              app={app}
              setup={isLocalInstall()}
              offerIndex={offerIndexEnabled()}
            />
          )}
          {setupBack && kind !== "focus" ? (
            <div className="container" style={{ paddingTop: 16 }}>
              <Link className="link t-sm" href={setupBack}>
                ← {t("setup.back")}
              </Link>
            </div>
          ) : null}
          {main}
          {kind === "focus" ? null : <SiteFooter locale={locale} />}
          {app && kind !== "focus" ? (
            <TabBar
              liked={counts.liked}
              newAtWatched={counts.newAtWatched}
              offerIndex={offerIndexEnabled()}
            />
          ) : null}
        </div>
      </ToastProvider>
    </LinkedInSignInProvider>
  )
}
