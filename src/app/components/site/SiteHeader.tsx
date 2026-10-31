"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import {
  Building2,
  ChevronDown,
  ClipboardList,
  FileSearch,
  FileText,
  MessageSquareText,
  Heart,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  Rows3,
  Settings,
  SquareTerminal,
  Sun,
  UserRound,
  Bookmark,
  Gauge,
  LogIn,
  X,
} from "lucide-react"
import logout from "src/app/(auth)/mutations/logout"
import { useCopy } from "src/app/i18n/Locale"
import { Button, ButtonLink } from "src/app/components/ds/Button"
import { Modal } from "src/app/components/ds/interactive"
import { LogoLockup } from "./Brand"
import type { ShellUser } from "./links"

function count(n: number): string {
  return n > 99 ? "99+" : String(n)
}

export function useThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const read = () => {
      const theme = document.documentElement.dataset.theme
      setDark(
        theme === "dark" ||
          (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches)
      )
    }
    read()
    window.addEventListener("nr-theme", read)
    return () => window.removeEventListener("nr-theme", read)
  }, [])
  function setTheme(next: "dark" | "light" | "system") {
    try {
      if (next === "system") {
        delete document.documentElement.dataset.theme
        localStorage.removeItem("js-theme")
      } else {
        document.documentElement.dataset.theme = next
        localStorage.setItem("js-theme", next)
      }
    } catch {}
    window.dispatchEvent(new Event("nr-theme"))
  }
  return { dark, toggle: () => setTheme(dark ? "light" : "dark"), setTheme }
}

export function useLocaleToggle() {
  const { locale } = useCopy()
  const router = useRouter()
  return (next?: "pl" | "en") => {
    const target = next ?? (locale === "pl" ? "en" : "pl")
    document.cookie = `js-lang=${target}; path=/; max-age=31536000; samesite=lax`
    document.documentElement.lang = target
    router.refresh()
  }
}

export function SiteHeader({
  user,
  liked,
  newAtWatched,
  app,
  setup,
}: {
  user: ShellUser
  liked: number
  newAtWatched: number
  app: boolean
  /** A local install: the /setup checklist exists */
  setup: boolean
}) {
  const { t } = useCopy()
  const pathname = usePathname()
  const router = useRouter()
  const [logoutMutation] = useMutation(logout)
  const theme = useThemeToggle()
  const switchLocale = useLocaleToggle()
  const [drawer, setDrawer] = useState(false)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const signedIn = Boolean(user && user.role !== "GUEST")
  const guest = Boolean(user && user.role === "GUEST")
  const initials = (user?.name || user?.email || "?").trim().slice(0, 1).toUpperCase()

  useEffect(() => {
    setDrawer(false)
    setMenu(false)
  }, [pathname])

  useEffect(() => {
    if (!menu) return
    const node = menuRef.current
    node?.querySelector<HTMLElement>("a, button")?.focus()
    function onDown(event: MouseEvent) {
      if (!menuRef.current?.parentElement?.contains(event.target as Node)) setMenu(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(false)
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        const items = [...(node?.querySelectorAll<HTMLElement>("a, button") ?? [])]
        const at = items.indexOf(document.activeElement as HTMLElement)
        const next = items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]
        next?.focus()
      }
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [menu])

  async function signOut() {
    await logoutMutation()
    setMenu(false)
    router.refresh()
    router.push("/")
  }

  const cur = (href: string, exact = false) =>
    (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`))
      ? ("page" as const)
      : undefined
  const forYouCurrent = pathname === "/jobs" || (pathname.startsWith("/jobs/") && !pathname.startsWith("/jobs/saved"))

  const themeButton = (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      className="is-desktop"
      aria-label={theme.dark ? t("theme.light") : t("theme.dark")}
      onClick={theme.toggle}
      icon={theme.dark ? <Sun /> : <Moon />}
    />
  )
  const langButton = (
    <Button
      variant="ghost"
      size="sm"
      className="is-desktop"
      aria-label={t("lang.switch")}
      onClick={() => switchLocale()}
    >
      {t("lang.code")}
    </Button>
  )

  return (
    <>
      <header className="site-header">
        <div className="container site-header__inner">
          <Link className="brand" href={app ? "/jobs" : "/"} aria-label={t("brandHome")}>
            <LogoLockup />
          </Link>
          {app ? (
            <nav className="nav" aria-label={t("nav.main")}>
              <Link href="/jobs" aria-current={forYouCurrent ? "page" : undefined}>
                {t("nav.forYou")}
              </Link>
              <Link href="/jobs/saved" aria-current={cur("/jobs/saved")}>
                {t("nav.saved")}
                {liked > 0 ? <span className="badge badge--count">{count(liked)}</span> : null}
              </Link>
              <Link href="/applications" aria-current={cur("/applications")}>
                {t("nav.applications")}
              </Link>
              <Link href="/companies" aria-current={cur("/companies")}>
                {t("nav.companies")}
                {newAtWatched > 0 ? (
                  <span className="badge badge--count">{count(newAtWatched)}</span>
                ) : null}
              </Link>
              <Link href="/sources" aria-current={cur("/sources")}>
                {t("nav.sources")}
              </Link>
            </nav>
          ) : (
            <nav className="nav" aria-label={t("nav.main")}>
              <Link href="/jobs?tab=all" aria-current={cur("/jobs")}>
                {t("nav.offers")}
              </Link>
              <Link href="/companies" aria-current={cur("/companies")}>
                {t("nav.companies")}
              </Link>
              <Link href="/sources" aria-current={cur("/sources")}>
                {t("nav.sources")}
              </Link>
              <Link href="/connect" aria-current={cur("/connect")}>
                {t("nav.claude")}
              </Link>
              {setup ? (
                <Link href="/setup" aria-current={cur("/setup")}>
                  {t("nav.setup")}
                </Link>
              ) : null}
            </nav>
          )}

          <div className="header-actions">
            {app ? (
              <>
                <ButtonLink
                  href="/connect"
                  variant="outline"
                  size="sm"
                  pill
                  className="claude-pill is-desktop"
                  icon={<SquareTerminal />}
                >
                  {t("nav.claude")}
                </ButtonLink>
                <ButtonLink
                  href="/connect"
                  variant="ghost"
                  size="sm"
                  iconOnly
                  className="is-mobile"
                  aria-label={t("nav.claude")}
                  icon={<SquareTerminal />}
                />
                {langButton}
                {themeButton}
                {guest ? (
                  <div className="rel">
                    <Button
                      variant="soft"
                      size="sm"
                      pill
                      aria-haspopup="menu"
                      aria-expanded={menu}
                      onClick={() => setMenu((open) => !open)}
                      iconRight={<ChevronDown />}
                    >
                      {t("nav.saveAccount")}
                    </Button>
                    {menu ? (
                      <div className="menu" role="menu" ref={menuRef}>
                        <Link className="menu__item" role="menuitem" href="/profile">
                          <UserRound aria-hidden /> {t("nav.profile")}
                        </Link>
                        <Link className="menu__item" role="menuitem" href="/applications">
                          <ClipboardList aria-hidden /> {t("nav.applications")}
                        </Link>
                        <Link className="menu__item" role="menuitem" href="/cv">
                          <FileText aria-hidden /> {t("nav.cv")}
                        </Link>
                        <Link className="menu__item" role="menuitem" href="/answers">
                          <MessageSquareText aria-hidden /> {t("nav.answers")}
                        </Link>
                        {setup ? (
                          <Link className="menu__item" role="menuitem" href="/setup">
                            <ListChecks aria-hidden /> {t("nav.setup")}
                          </Link>
                        ) : null}
                        <Link className="menu__item" role="menuitem" href="/login?returnTo=/jobs">
                          <LogIn aria-hidden /> {t("nav.signin")}
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rel">
                    <button
                      type="button"
                      className="avatar-btn"
                      aria-label={t("nav.accountMenu")}
                      aria-haspopup="menu"
                      aria-expanded={menu}
                      onClick={() => setMenu((open) => !open)}
                    >
                      <span className="avatar">
                        {user?.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={user.imageUrl} alt="" referrerPolicy="no-referrer" />
                        ) : (
                          initials
                        )}
                      </span>
                      <ChevronDown aria-hidden className="is-desktop" />
                    </button>
                    {menu ? (
                      <div className="menu" role="menu" ref={menuRef}>
                        <p className="menu__label">{user?.email}</p>
                        <Link className="menu__item" role="menuitem" href="/profile">
                          <UserRound aria-hidden /> {t("nav.profile")}
                        </Link>
                        <Link className="menu__item" role="menuitem" href="/cv">
                          <FileText aria-hidden /> {t("nav.cv")}
                        </Link>
                        <Link className="menu__item" role="menuitem" href="/answers">
                          <MessageSquareText aria-hidden /> {t("nav.answers")}
                        </Link>
                        <Link className="menu__item" role="menuitem" href="/profile/audit">
                          <FileSearch aria-hidden /> {t("nav.audit")}
                        </Link>
                        <Link className="menu__item" role="menuitem" href="/searches">
                          <Bookmark aria-hidden /> {t("nav.searches")}
                        </Link>
                        <Link className="menu__item" role="menuitem" href="/settings">
                          <Settings aria-hidden /> {t("nav.settings")}
                        </Link>
                        {setup ? (
                          <Link className="menu__item" role="menuitem" href="/setup">
                            <ListChecks aria-hidden /> {t("nav.setup")}
                          </Link>
                        ) : null}
                        {user?.role === "ADMIN" ? (
                          <Link className="menu__item" role="menuitem" href="/coverage">
                            <Gauge aria-hidden /> {t("nav.coverage")}
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          className="menu__item is-mobile-only"
                          role="menuitem"
                          onClick={theme.toggle}
                        >
                          {theme.dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
                          {theme.dark ? t("theme.light") : t("theme.dark")}
                        </button>
                        <button
                          type="button"
                          className="menu__item is-mobile-only"
                          role="menuitem"
                          onClick={() => switchLocale()}
                        >
                          <span aria-hidden className="kbd">
                            {t("lang.code")}
                          </span>
                          {t("lang.switch")}
                        </button>
                        <div className="menu__sep" role="separator" />
                        {signedIn ? (
                          <button
                            type="button"
                            className="menu__item"
                            role="menuitem"
                            onClick={() => void signOut()}
                          >
                            <LogOut aria-hidden /> {t("nav.signout")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
              </>
            ) : (
              <>
                {langButton}
                {themeButton}
                <ButtonLink href="/login" variant="ghost" size="sm" className="is-desktop">
                  {t("nav.signin")}
                </ButtonLink>
                <ButtonLink href="/start" variant="primary" size="sm" className="header-cta">
                  {t("nav.start")}
                </ButtonLink>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  className="is-mobile"
                  aria-label={t("nav.menu")}
                  aria-expanded={drawer}
                  onClick={() => setDrawer(true)}
                  icon={<Menu />}
                />
              </>
            )}
          </div>
        </div>
      </header>

      <Modal open={drawer} onClose={() => setDrawer(false)} kind="drawer" label={t("nav.menu")} className="nav-drawer">
        <div className="nav-drawer__head">
          <LogoLockup />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t("nav.closeMenu")}
            onClick={() => setDrawer(false)}
            icon={<X />}
          />
        </div>
        <Link className="nav-drawer__link" href="/jobs?tab=all">
          <Rows3 aria-hidden /> {t("nav.offers")}
        </Link>
        <Link className="nav-drawer__link" href="/companies">
          <Building2 aria-hidden /> {t("nav.companies")}
        </Link>
        <Link className="nav-drawer__link" href="/connect">
          <SquareTerminal aria-hidden /> {t("nav.claude")}
        </Link>
        {setup ? (
          <Link className="nav-drawer__link" href="/setup">
            <ListChecks aria-hidden /> {t("nav.setup")}
          </Link>
        ) : null}
        <Link className="nav-drawer__link" href="/login">
          <LogIn aria-hidden /> {t("nav.signin")}
        </Link>
        <Link className="nav-drawer__link" href="/jobs/saved">
          <Heart aria-hidden /> {t("nav.saved")}
        </Link>
        <div className="nav-drawer__foot">
          <Button variant="outline" size="sm" onClick={() => switchLocale()} aria-label={t("lang.switch")}>
            {t("lang.code")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={theme.toggle}
            icon={theme.dark ? <Sun /> : <Moon />}
          >
            {theme.dark ? t("theme.light") : t("theme.dark")}
          </Button>
        </div>
      </Modal>
    </>
  )
}
