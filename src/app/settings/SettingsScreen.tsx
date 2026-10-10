"use client"

import { useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import { useRouter } from "next/navigation"
import deleteMyData from "src/app/profile/mutations/deleteMyData"
import { Button } from "src/app/components/ui/button"

export function SettingsScreen({ email, admin }: { email: string; admin: boolean }) {
  const [remove, { isPending }] = useMutation(deleteMyData)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()

  return (
    <div className="stack">
      <section className="hero">
        <p className="kicker">Settings</p>
        <h1>Account</h1>
        <p className="lede">Signed in as {email}.</p>
      </section>
      <section className="panel stack">
        <h2>Delete my data</h2>
        <p className="hint">
          This removes your profile, saved searches, and sign-in links.
          {admin
            ? " The owner account itself stays, so this browser can still sign in with the password."
            : " The account is deleted as well."}
        </p>
        {message ? <p className="hint">{message}</p> : null}
        <Button
          variant="outline"
          disabled={isPending}
          onClick={async () => {
            const result = await remove(null)
            if (result.deleted === "account") {
              router.push("/")
              router.refresh()
              return
            }
            setMessage("Profile, searches, and sign-in links were deleted.")
            router.refresh()
          }}
        >
          {isPending ? "Deleting…" : "Delete my data"}
        </Button>
      </section>
    </div>
  )
}
