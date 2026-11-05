"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import {
  BriefcaseBusiness,
  ChevronDown,
  ClipboardList,
  Coins,
  FileSearch,
  FileText,
  MessageSquareText,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  Settings,
  SquareTerminal,
  Sun,
  UserRound,
  LogIn,
  X,
} from "lucide-react"
import logout from "src/app/(auth)/mutations/logout"
import { useCopy } from "src/app/i18n/Locale"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { Modal } from "@newrole/ui/interactive"
import { LOCALE_COOKIE } from "@newrole/app-kit/languages"
import { LogoLockup } from "./Brand"
import type { ShellUser } from "./links"

export function useThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const read = () => {
      const theme = document.documentElement.dataset.theme
      setDark(
        theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches)
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
    document.cookie = `${LOCALE_COOKIE}=${target}; path=/; max-age=31536000; samesite=lax`
    document.documentElement.lang = target
    router.refresh()
  }
}

/** The screens of a person with a profile or an account, in the order of the work. */
export const APP_TABS = [
  { href: "/cv", key: "nav.cv", icon: FileText },
  { href: "/offers", key: "nav.offers", icon: BriefcaseBusiness },
  { href: "/applications", key: "nav.applications", icon: ClipboardList },
  { href: "/answers", key: "nav.answers", icon: MessageSquareText },
  { href: "/profile", key: "nav.profile", icon: UserRound },
] as const

export function SiteHeader({
  user,
  app,
  setup,
  usage,
}: {
  user: ShellUser
  app: boolean
  /** A local install: the /setup checklist exists */
  setup: boolean
  /** The /usage tab exists for this account (usageTabVisible) */
  usage: boolean
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
        const next =
          items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]
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
          <Link className="brand" href={app ? "/cv" : "/"} aria-label={t("brandHome")}>
            <LogoLockup />
          </Link>
          {app ? (
            <nav className="nav" aria-label={t("nav.main")}>
              {APP_TABS.map((tab) => (
                <Link key={tab.href} href={tab.href} aria-current={cur(tab.href)}>
                  {t(tab.key)}
                </Link>
              ))}
            </nav>
          ) : (
            <nav className="nav" aria-label={t("nav.main")}>
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
                        {APP_TABS.map((tab) => (
                          <Link
                            key={tab.href}
                            className="menu__item"
                            role="menuitem"
                            href={tab.href}
                          >
                            <tab.icon aria-hidden /> {t(tab.key)}
                          </Link>
                        ))}
                        {setup ? (
                          <Link className="menu__item" role="menuitem" href="/setup">
                            <ListChecks aria-hidden /> {t("nav.setup")}
                          </Link>
                        ) : null}
                        {usage ? (
                          <Link className="menu__item" role="menuitem" href="/usage">
                            <Coins aria-hidden /> {t("nav.usage")}
                          </Link>
                        ) : null}
                        <Link className="menu__item" role="menuitem" href="/login?returnTo=/cv">
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
                        <Link className="menu__item" role="menuitem" href="/profile/audit">
                          <FileSearch aria-hidden /> {t("nav.audit")}
                        </Link>
                        <Link className="menu__item" role="menuitem" href="/settings">
                          <Settings aria-hidden /> {t("nav.settings")}
                        </Link>
                        {setup ? (
                          <Link className="menu__item" role="menuitem" href="/setup">
                            <ListChecks aria-hidden /> {t("nav.setup")}
                          </Link>
                        ) : null}
                        {usage ? (
                          <Link className="menu__item" role="menuitem" href="/usage">
                            <Coins aria-hidden /> {t("nav.usage")}
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

      <Modal
        open={drawer}
        onClose={() => setDrawer(false)}
        kind="drawer"
        label={t("nav.menu")}
        className="nav-drawer"
      >
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
        <div className="nav-drawer__foot">
          <Button
            variant="outline"
            size="sm"
            onClick={() => switchLocale()}
            aria-label={t("lang.switch")}
          >
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
