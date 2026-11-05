"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect } from "react"
import { useCopy } from "src/app/i18n/Locale"
import { APP_TABS } from "./SiteHeader"

/** On a phone the answer bank stays in the header menu: four tabs fit the bar. */
const PHONE_TABS = APP_TABS.filter((tab) => tab.href !== "/answers")

/** Mobile bottom tab bar for people with a profile or an account. Hidden ≥ 768 px. */
export function TabBar() {
  const { t } = useCopy()
  const pathname = usePathname()
  useEffect(() => {
    document.body.classList.add("has-tabbar")
    return () => document.body.classList.remove("has-tabbar")
  }, [])
  return (
    <nav className="tabbar" aria-label={t("nav.main")}>
      {PHONE_TABS.map(({ href, key, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}
        >
          <Icon aria-hidden />
          <span>{t(key)}</span>
        </Link>
      ))}
    </nav>
  )
}
