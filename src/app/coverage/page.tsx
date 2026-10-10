import Link from "next/link"
import { redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { Shell } from "src/app/components/Shell"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import getCoverage from "./queries/getCoverage"

export const metadata = { title: "Coverage" }

function formatWhen(value: Date | null): string {
  if (!value) return "Not yet"
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

function policyLabel(policy: string): string {
  if (policy === "enabled") return "Allowed"
  if (policy === "limited") return "Allowed with limits"
  return "Link-only"
}

export default async function CoveragePage() {
  const user = await invoke(getCurrentUser, null)
  if (!user) redirect("/login")
  const coverage = await invoke(getCoverage, null)
  const rows = coverage.rows
  return (
    <Shell name={user.name || user.email}>
      <div className="hero">
        <p className="kicker">Sources</p>
        <h1>Coverage</h1>
        <p className="lede">
          The worker indexes every allowed board and career site, then refreshes it daily. Link-only
          rows stay as outbound links. Large career sites backfill across days because each host is
          limited to 200 detail pages a day.
        </p>
        <div className="coverage-summary">
          <div>
            <strong>{coverage.totalJobs.toLocaleString("en-GB")}</strong>
            <span className="meta">jobs indexed</span>
          </div>
          <div>
            <strong>{coverage.incompleteEmployers}</strong>
            <span className="meta">employers still incomplete</span>
          </div>
        </div>
        <Link href="/">New scan</Link>
      </div>
      {rows.length === 0 ? (
        <div className="empty-card">No employers are configured.</div>
      ) : (
        <div className="coverage-wrap">
          <table className="coverage-table">
            <thead>
              <tr>
                <th>Employer</th>
                <th>Platform</th>
                <th>Policy</th>
                <th>Index</th>
                <th>Last crawl</th>
                <th>Next crawl</th>
                <th>Jobs</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.employer}-${row.platform}`}>
                  <td>
                    {row.href ? (
                      <a href={row.href} target="_blank" rel="noreferrer noopener">
                        {row.employer}
                      </a>
                    ) : (
                      row.employer
                    )}
                  </td>
                  <td>{row.platform}</td>
                  <td>
                    <span className={`policy ${row.policy}`}>{policyLabel(row.policy)}</span>
                  </td>
                  <td>
                    {row.policy === "link_only" ? (
                      <span className="policy link_only">Not crawled</span>
                    ) : row.incomplete ? (
                      <span className="policy incomplete">Incomplete</span>
                    ) : (
                      <span className="policy">Complete</span>
                    )}
                  </td>
                  <td>{formatWhen(row.lastFetch)}</td>
                  <td>{row.policy === "link_only" ? "—" : formatWhen(row.nextFetch)}</td>
                  <td>
                    {row.jobCount}
                    {row.listedCount > row.jobCount ? ` / ${row.listedCount}` : ""}
                  </td>
                  <td>
                    {row.reason}
                    {row.note ? <div>{row.note}</div> : null}
                    {row.termsUrl ? (
                      <div>
                        <a href={row.termsUrl} target="_blank" rel="noreferrer noopener">
                          Terms
                        </a>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}
