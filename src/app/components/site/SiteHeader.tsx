"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import logout from "src/app/(auth)/mutations/logout"
import { useCopy } from "src/app/i18n/Locale"
import type { ShellUser } from "../Shell"
import { LinkedInMark, LogoMark } from "./Brand"

const ACCOUNT = [
  { href: "/interested", key: "navInterested" as const, count: true },
  { href: "/rejected", key: "navRejected" as const },
  { href: "/profile", key: "navProfile" as const },
  { href: "/profile/audit", key: "navAudit" as const },
  { href: "/searches", key: "navSaved" as const },
  { href: "/settings", key: "navSettings" as const },
]

export function SiteHeader({ user, interested }: { user?: ShellUser; interested: number }) {
  const signedIn = Boolean(user && user.role !== "GUEST")
  const { t, locale } = useCopy()
  const pathname = usePathname()
  const router = useRouter()
  const [logoutMutation] = useMutation(logout)
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [dark, setDark] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const avatarButton = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const drawerId = useId()
  const initials = (user?.name || user?.email || "?").slice(0, 1).toUpperCase()

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark")
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const node = drawerRef.current
    const focusable = node?.querySelectorAll<HTMLElement>("a, button")
    focusable?.[0]?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
        menuButton.current?.focus()
      }
      if (event.key !== "Tab" || !focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"
    document.documentElement.dataset.theme = next
    localStorage.setItem("js-theme", next)
    setDark(next === "dark")
  }

  function toggleLocale() {
    const next = locale === "pl" ? "en" : "pl"
    document.cookie = `js-lang=${next}; path=/; max-age=31536000`
    router.refresh()
  }

  async function signOut() {
    await logoutMutation()
    setMenu(false)
    setOpen(false)
    router.refresh()
    router.push("/")
  }

  const current = (href: string) => (pathname === href ? "page" : undefined)

  return (
    <>
      <a className="skip-link" href="#main">
        {t("skip")}
      </a>
      <header className={`site-header${scrolled ? " is-scrolled" : ""}`}>
        <div className="container">
          <div className="header-inner">
            <Link className="brand" href="/" aria-label="Jobscanner">
              <LogoMark />
              <span className="brand-word">
                Job<span>scanner</span>
              </span>
            </Link>
            {signedIn ? (
              <nav className="nav nav-auth" aria-label={t("navAccount")}>
                {ACCOUNT.map((item) => (
                  <Link key={item.href} href={item.href} aria-current={current(item.href)}>
                    <span>{t(item.key)}</span>
                    {item.count && interested > 0 ? (
                      <span className="nav-count">{interested}</span>
                    ) : null}
                  </Link>
                ))}
              </nav>
            ) : (
              <nav className="nav nav-guest" aria-label={t("navMain")}>
                <a href="/#jak-to-dziala">{t("navHow")}</a>
                <a href="/#zrodla">{t("navSources")}</a>
                <a href="/#dopasowanie">{t("navMatch")}</a>
              </nav>
            )}
            <div className="header-actions">
              <button
                className="btn btn-ghost btn-sm lang-toggle"
                type="button"
                onClick={toggleLocale}
                lang={locale === "pl" ? "en" : "pl"}
                aria-label={t("langSwitch")}
              >
                {t("langCode")}
              </button>
              <button
                className="btn btn-ghost btn-icon theme-toggle"
                type="button"
                onClick={toggleTheme}
                aria-label={dark ? t("themeToLight") : t("themeToDark")}
              >
                {dark ? "☀" : "☾"}
              </button>
              {signedIn ? (
                <div className="avatar-wrap">
                  <button
                    ref={avatarButton}
                    className="avatar-btn"
                    type="button"
                    aria-expanded={menu}
                    aria-controls={menuId}
                    aria-label={`${locale === "pl" ? "Konto" : "Account"}: ${
                      user?.name || user?.email
                    }`}
                    onClick={() => setMenu((value) => !value)}
                  >
                    <span className="avatar" aria-hidden="true">
                      {initials}
                    </span>
                  </button>
                  {menu ? (
                    <div className="avatar-menu" id={menuId}>
                      <div className="avatar-menu-head">
                        <span className="avatar avatar-lg" aria-hidden="true">
                          {initials}
                        </span>
                        <span>
                          <strong>{user?.name || user?.email}</strong>
                          <span className="muted small">{user?.email}</span>
                        </span>
                      </div>
                      <ul>
                        <li>
                          <Link href="/profile" onClick={() => setMenu(false)}>
                            {t("navProfile")}
                          </Link>
                        </li>
                        <li>
                          <Link href="/profile/audit" onClick={() => setMenu(false)}>
                            {t("navAudit")}
                          </Link>
                        </li>
                        <li>
                          <Link href="/settings" onClick={() => setMenu(false)}>
                            {t("navSettings")}
                          </Link>
                        </li>
                        <li>
                          <button type="button" onClick={() => void signOut()}>
                            {t("signout")}
                          </button>
                        </li>
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <Link
                  className="btn btn-outline btn-sm btn-linkedin signin-full"
                  href="/api/auth/linkedin/start"
                >
                  <LinkedInMark />
                  <span>{t("signinLinkedIn")}</span>
                </Link>
              )}
              <button
                ref={menuButton}
                className="btn btn-ghost btn-icon menu-toggle"
                type="button"
                aria-expanded={open}
                aria-controls={drawerId}
                aria-label={t("menu")}
                onClick={() => setOpen(true)}
              >
                ☰
              </button>
            </div>
          </div>
        </div>
      </header>
      <div
        className={`drawer-backdrop${open ? " is-open" : ""}`}
        hidden={!open}
        onClick={() => setOpen(false)}
      />
      <div
        className={`drawer${open ? " is-open" : ""}`}
        id={drawerId}
        role="dialog"
        aria-modal="true"
        aria-label={t("menu")}
        hidden={!open}
        ref={drawerRef}
      >
        <div className="drawer-head">
          <span className="brand-word">
            Job<span>scanner</span>
          </span>
          <button
            className="btn btn-ghost btn-icon"
            type="button"
            aria-label={t("closeMenu")}
            onClick={() => {
              setOpen(false)
              menuButton.current?.focus()
            }}
          >
            ×
          </button>
        </div>
        <nav className="drawer-nav" aria-label={t("menu")}>
          <ul>
            {signedIn
              ? ACCOUNT.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={current(item.href)}
                    >
                      {t(item.key)}
                      {item.count && interested > 0 ? (
                        <span className="nav-count">{interested}</span>
                      ) : null}
                    </Link>
                  </li>
                ))
              : [
                  ["/#jak-to-dziala", t("navHow")],
                  ["/#zrodla", t("navSources")],
                  ["/#dopasowanie", t("navMatch")],
                ].map(([href, label]) => (
                  <li key={href}>
                    <a href={href} onClick={() => setOpen(false)}>
                      {label}
                    </a>
                  </li>
                ))}
          </ul>
        </nav>
        <div className="drawer-foot">
          {signedIn ? (
            <button className="btn btn-outline" type="button" onClick={() => void signOut()}>
              {t("signout")}
            </button>
          ) : (
            <Link className="btn btn-primary btn-linkedin" href="/api/auth/linkedin/start">
              <LinkedInMark />
              {t("signinLinkedIn")}
            </Link>
          )}
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={toggleLocale}
            lang={locale === "pl" ? "en" : "pl"}
          >
            {locale === "pl" ? "English" : "Polski"}
          </button>
        </div>
      </div>
    </>
  )
}
