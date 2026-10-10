"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { FormEvent, useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import logout from "src/app/(auth)/mutations/logout"
import createSearch from "src/app/searches/mutations/createSearch"
import { MergeDecisions } from "src/app/searches/MergeDecisions"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

export type ShellUser = {
  id: number
  name: string | null
  email: string
  role: string
  imageUrl?: string | null
} | null

const LINKS = [
  { href: "/interested", label: "Interested" },
  { href: "/rejected", label: "Rejected" },
  { href: "/profile", label: "Profile" },
  { href: "/profile/audit", label: "Profile audit" },
  { href: "/searches", label: "Saved searches" },
  { href: "/settings", label: "Settings" },
]

function initial(user: ShellUser): string {
  const source = user?.name || user?.email || "?"
  return source.slice(0, 1).toUpperCase()
}

export function Shell({ children, user }: { children: React.ReactNode; user?: ShellUser }) {
  const signedIn = Boolean(user && user.role !== "GUEST")
  const pathname = usePathname()
  const router = useRouter()
  const [logoutMutation] = useMutation(logout)
  const [createSearchMutation, { isPending }] = useMutation(createSearch)
  const [phrase, setPhrase] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function onSearch(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      const result = await createSearchMutation({ phrase, workMode: "ANY" })
      setPhrase("")
      router.push(`/searches/${result.searchId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the scan")
    }
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark"
    document.documentElement.dataset.theme = next
    localStorage.setItem("theme", next)
  }

  return (
    <div className="app-shell">
      <MergeDecisions enabled={signedIn} />
      <header className="topbar">
        <Link href="/" className="brand">
          <div className="brand-mark">
            Job<span>scanner</span>
          </div>
        </Link>
        <form className="header-search" onSubmit={onSearch} role="search">
          <Input
            aria-label="Search roles"
            placeholder="Head of Engineering"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            minLength={2}
            maxLength={160}
            required
          />
          <Button type="submit" disabled={isPending}>
            {isPending ? "Starting…" : "Search"}
          </Button>
        </form>
        <nav className="top-nav" aria-label="Primary">
          {signedIn ? (
            <>
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={pathname === link.href ? "page" : undefined}
                >
                  {link.label}
                </Link>
              ))}
              {user?.role === "ADMIN" ? (
                <Link href="/coverage" aria-current={pathname === "/coverage" ? "page" : undefined}>
                  Coverage
                </Link>
              ) : null}
              <details className="avatar-menu">
                <summary aria-label="Account menu">
                  {user?.imageUrl ? (
                    // LinkedIn picture URLs are remote and not in the image optimizer allowlist.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.imageUrl} alt="" className="avatar-image" />
                  ) : (
                    <span className="avatar-fallback">{initial(user ?? null)}</span>
                  )}
                </summary>
                <div className="avatar-panel">
                  <strong>{user?.name || "Account"}</strong>
                  <span>{user?.email}</span>
                  <Link href="/settings">Settings</Link>
                  <button type="button" onClick={toggleTheme}>
                    Toggle theme
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await logoutMutation()
                      router.push("/")
                      router.refresh()
                    }}
                  >
                    Sign out
                  </button>
                </div>
              </details>
            </>
          ) : (
            <>
              <button type="button" className="text-button" onClick={toggleTheme}>
                Theme
              </button>
              <Button asChild size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
            </>
          )}
        </nav>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      {children}
    </div>
  )
}
