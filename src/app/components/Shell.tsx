"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation } from "@blitzjs/rpc"
import logout from "src/app/(auth)/mutations/logout"
import { Button } from "./ui/button"

export function Shell({ children, name }: { children: React.ReactNode; name?: string | null }) {
  const [logoutMutation] = useMutation(logout)
  const router = useRouter()
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <div className="brand-mark">
            Job<span>scanner</span>
          </div>
          <div className="brand-note">personal offer desk</div>
        </Link>
        <div className="top-actions">
          {name ? <span className="who">{name}</span> : null}
          <Button variant="ghost" asChild>
            <Link href="/coverage">Coverage</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/searches">Past scans</Link>
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await logoutMutation()
              router.push("/login")
              router.refresh()
            }}
          >
            Log out
          </Button>
        </div>
      </header>
      {children}
    </div>
  )
}
