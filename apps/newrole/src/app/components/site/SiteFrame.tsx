import Link from "next/link"
import { linkedInCredentials } from "src/server/auth/linkedin"
import { usageTabVisible } from "src/server/llm/usage"
import { isLocalInstall } from "src/server/local-install"
import { translator, type Locale } from "src/app/i18n/copy"
import { ToastProvider } from "@newrole/ui/interactive"
import { LogoLockup } from "./Brand"
import { LinkedInSignInProvider } from "./LinkedInSignIn"
import { type ShellUser } from "./links"
import { SiteFooter } from "./SiteFooter"
import { SiteHeader } from "./SiteHeader"
import { TabBar } from "./TabBar"
import { UrlToasts } from "./UrlToasts"

export type { ShellUser }

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
          <UrlToasts />
          {kind === "focus" ? (
            <header className="container focus-header">
              <Link className="brand" href="/" aria-label={t("brandHome")}>
                <LogoLockup />
              </Link>
              <Link className="link link--quiet t-sm" href="/cv">
                {t("onb.skip")}
              </Link>
            </header>
          ) : (
            <SiteHeader
              user={user ?? null}
              app={app}
              setup={isLocalInstall()}
              usage={app && usageTabVisible(user?.role)}
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
          {app && kind !== "focus" ? <TabBar /> : null}
        </div>
      </ToastProvider>
    </LinkedInSignInProvider>
  )
}
