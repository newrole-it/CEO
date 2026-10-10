import Link from "next/link"
import { redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { Shell } from "src/app/components/Shell"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import getCoverage from "./queries/getCoverage"

export const metadata = { title: "Coverage" }

export default async function CoveragePage() {
  const user = await invoke(getCurrentUser, null)
  if (!user) redirect("/login")
  const rows = await invoke(getCoverage, null)
  return (
    <Shell name={user.name || user.email}>
      <div className="hero">
        <p className="kicker">Sources</p>
        <h1>Coverage</h1>
        <p className="lede">
          Each employer is fetched only when its policy allows it. Link-only rows stay as outbound
          links. Reasons come from the 10 October 2026 terms review.
        </p>
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
                <th>Last fetch</th>
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
                    <span className={`policy ${row.policy}`}>{row.policy.replace("_", " ")}</span>
                  </td>
                  <td>
                    {row.lastFetch
                      ? new Intl.DateTimeFormat("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }).format(row.lastFetch)
                      : "Not yet"}
                  </td>
                  <td>{row.jobCount}</td>
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
