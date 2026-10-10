import Link from "next/link"
import { invoke } from "src/app/blitz-server"
import { Shell } from "src/app/components/Shell"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import getProfile from "../queries/getProfile"

export const metadata = { title: "Profile audit" }

function money(value: number | null) {
  if (value == null) return "Not set"
  return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(value)} PLN / month`
}

export default async function ProfileAuditPage() {
  const user = await invoke(getCurrentUser, null)
  const profile = user ? await invoke(getProfile, null) : null
  const draft = profile?.draft
  return (
    <Shell user={user}>
      <section className="hero">
        <p className="kicker">Profile audit</p>
        <h1>What matching can see</h1>
        <p className="lede">
          Only the structured profile is stored. CV files and raw text are discarded after reading.
          This is the record used when a search explains why an offer matches you.
        </p>
      </section>
      {!draft ? (
        <div className="empty-card">
          <h2>No profile yet</h2>
          <p className="lede">Import a PDF or paste a CV, review it, and save.</p>
          <Link href="/profile">Open profile</Link>
        </div>
      ) : (
        <div className="panel stack">
          <p className="meta">
            Updated{" "}
            {profile?.updatedAt
              ? new Intl.DateTimeFormat("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(profile.updatedAt)
              : "just now"}
          </p>
          <dl className="audit-list">
            <div>
              <dt>Headline</dt>
              <dd>{draft.headline || "Not set"}</dd>
            </div>
            <div>
              <dt>Current title</dt>
              <dd>{draft.currentTitle || "Not set"}</dd>
            </div>
            <div>
              <dt>Seniority</dt>
              <dd>{draft.seniority || "Not set"}</dd>
            </div>
            <div>
              <dt>Industries</dt>
              <dd>{draft.industries.join(", ") || "Not set"}</dd>
            </div>
            <div>
              <dt>Industry preference</dt>
              <dd>
                {draft.industryMode === "stick"
                  ? "Stick to my industries"
                  : draft.industryMode === "any"
                  ? "Any industry"
                  : "Prefer my industries"}
              </dd>
            </div>
            <div>
              <dt>Salary floor, monthly PLN</dt>
              <dd>{money(profile?.monthly?.floor ?? null)}</dd>
            </div>
            <div>
              <dt>Salary target, monthly PLN</dt>
              <dd>{money(profile?.monthly?.target ?? null)}</dd>
            </div>
            <div>
              <dt>Entered as</dt>
              <dd>
                {draft.salaryContract === "uop" ? "UoP gross" : "B2B net of VAT"} ·{" "}
                {draft.salaryPeriod === "year" ? "yearly" : "monthly"} {draft.salaryCurrency}
              </dd>
            </div>
            <div>
              <dt>Skills</dt>
              <dd>{draft.skills.join(", ") || "Not set"}</dd>
            </div>
            <div>
              <dt>Locations</dt>
              <dd>
                {[draft.homeCity, ...draft.locations].filter(Boolean).join(", ") || "Not set"}
              </dd>
            </div>
          </dl>
          <p className="hint">
            Offers with no salary stay visible and are labeled salary not disclosed. Offers clearly
            below the floor drop in score and stay in the list. A different industry is a mild
            penalty, stronger when the posting requires that domain, and stronger still when you
            stick to your industries. Unknown industries stay neutral. Adjacent groups include
            adtech with martech, ecommerce, and media, and fintech with banking and payments.
          </p>
          <Link href="/profile">Edit profile</Link>
        </div>
      )}
    </Shell>
  )
}
