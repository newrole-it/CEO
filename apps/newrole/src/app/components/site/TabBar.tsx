"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect } from "react"
import { Building2, ClipboardList, Heart, Rows3, UserRound } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"

/** Mobile bottom tab bar for people with a profile or an account. Hidden ≥ 768 px. */
export function TabBar({
  liked,
  newAtWatched,
  offerIndex,
}: {
  liked: number
  newAtWatched: number
  /** False with OFFER_INDEX=off: only the tabs that do not need offers stay */
  offerIndex: boolean
}) {
  const { t } = useCopy()
  const pathname = usePathname()
  useEffect(() => {
    document.body.classList.add("has-tabbar")
    return () => document.body.classList.remove("has-tabbar")
  }, [])
  const all = [
    {
      href: "/jobs",
      label: t("nav.forYou"),
      icon: Rows3,
      on:
        pathname === "/jobs" ||
        (pathname.startsWith("/jobs/") && !pathname.startsWith("/jobs/saved")),
      badge: 0,
    },
    {
      href: "/jobs/saved",
      label: t("nav.saved"),
      icon: Heart,
      on: pathname.startsWith("/jobs/saved"),
      badge: liked,
    },
    {
      href: "/applications",
      label: t("nav.applications"),
      icon: ClipboardList,
      on: pathname.startsWith("/applications"),
      badge: 0,
    },
    {
      href: "/companies",
      label: t("nav.companies"),
      icon: Building2,
      on: pathname.startsWith("/companies"),
      badge: newAtWatched,
    },
    {
      href: "/profile",
      label: t("nav.profile"),
      icon: UserRound,
      on: pathname.startsWith("/profile"),
      badge: 0,
    },
  ]
  const items = offerIndex
    ? all
    : all.filter(({ href }) => href === "/applications" || href === "/profile")
  return (
    <nav className="tabbar" aria-label={t("nav.main")}>
      {items.map(({ href, label, icon: Icon, on, badge }) => (
        <Link key={href} href={href} aria-current={on ? "page" : undefined}>
          <Icon aria-hidden />
          <span>{label}</span>
          {badge > 0 ? (
            <span className="badge badge--count">{badge > 99 ? "99+" : badge}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  )
}
