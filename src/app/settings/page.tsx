import Link from "next/link"
import { invoke } from "src/app/blitz-server"
import { Shell } from "src/app/components/Shell"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { SettingsScreen } from "./SettingsScreen"

export const metadata = { title: "Settings" }

export default async function SettingsPage() {
  const user = await invoke(getCurrentUser, null)
  return (
    <Shell user={user}>
      {user && user.role !== "GUEST" ? (
        <SettingsScreen email={user.email} admin={user.role === "ADMIN"} />
      ) : (
        <section className="hero">
          <p className="kicker">Settings</p>
          <h1>Sign in to manage the account</h1>
          <p className="lede">
            <Link href="/login">Continue with email or LinkedIn</Link>
          </p>
        </section>
      )}
    </Shell>
  )
}
