import Link from "next/link"
import { invoke } from "src/app/blitz-server"
import { Shell } from "src/app/components/Shell"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import getProfileAudit from "../queries/getProfileAudit"
import { AuditProfile } from "./AuditProfile"

export const metadata = { title: "Profile audit" }

export default async function ProfileAuditPage() {
  const user = await invoke(getCurrentUser, null)
  if (!user) {
    return (
      <Shell user={null}>
        <section className="hero">
          <p className="kicker">Profile audit</p>
          <h1>Sign in to audit your profile</h1>
          <p className="lede">
            The audit reads the LinkedIn PDF you import and compares it with offers you already
            match.
          </p>
        </section>
        <div className="empty-card">
          <h2>No account on this browser</h2>
          <p className="lede">Sign in, then import the PDF from LinkedIn.</p>
          <Link href="/login">Sign in</Link>
        </div>
      </Shell>
    )
  }
  const loaded = await invoke(getProfileAudit, null)
  return (
    <Shell user={user}>
      {loaded.document ? (
        <AuditProfile
          document={loaded.document}
          audit={loaded.audit}
          auditedAt={loaded.auditedAt}
        />
      ) : (
        <>
          <section className="hero">
            <p className="kicker">Profile audit</p>
            <h1>Import a LinkedIn PDF first</h1>
            <p className="lede">
              On LinkedIn, open your profile, choose More, then Save to PDF. Jobscanner reads the
              text, deletes the file, and keeps the sections so this page can mark them.
            </p>
          </section>
          <div className="empty-card">
            <h2>No imported profile yet</h2>
            <p className="lede">A pasted CV with the same headings works too.</p>
            <Link href="/profile">Import a profile</Link>
          </div>
        </>
      )}
    </Shell>
  )
}
