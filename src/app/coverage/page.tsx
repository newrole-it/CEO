import Link from "next/link"
import { redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { IndexProgress } from "./IndexProgress"
import { OpsPanel } from "./OpsPanel"
import getCoverage from "./queries/getCoverage"
import getOps from "./queries/getOps"

export const metadata = { title: "Pobieranie" }

function formatWhen(value: Date | null, overdueLabel?: string): string {
  if (!value) return "Not yet"
  if (overdueLabel && value.getTime() <= Date.now()) return overdueLabel
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
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  if (!user || user.role !== "ADMIN") redirect("/")
  const [coverage, ops] = await Promise.all([invoke(getCoverage, null), invoke(getOps, null)])
  const rows = coverage.rows
  const pl = locale === "pl"
  return (
    <SiteFrame user={user} locale={locale}>
      <OpsPanel ops={ops} locale={locale} />
      <IndexProgress />
      <div className="crawl-policy">
        <h2>{pl ? "Zasady źródeł" : "Source rules"}</h2>
        <p className="lede">
          {pl
            ? "Ta tabela to ręcznie sprawdzone wyjątki: serwisy link-only i duże strony kariery. Katalog tablic API jest w postępie powyżej."
            : "This table is the hand-checked exceptions: link-only sites and large career pages. The API catalog is the progress above."}
        </p>
        <p className="crawl-note">
          {pl ? "Ofert w indeksie" : "Offers in the index"}:{" "}
          <strong>{coverage.totalJobs.toLocaleString(pl ? "pl-PL" : "en-GB")}</strong>
          {" · "}
          {pl ? "niekompletnych w tej tabeli" : "incomplete in this table"}:{" "}
          <strong>{coverage.incompleteEmployers}</strong>
        </p>
        <Link href="/">{pl ? "Nowe wyszukiwanie" : "New search"}</Link>
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
                  <td>{row.policy === "link_only" ? "—" : formatWhen(row.nextFetch, "Due now")}</td>
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
    </SiteFrame>
  )
}
