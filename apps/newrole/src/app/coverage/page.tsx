import Link from "next/link"
import { redirect } from "next/navigation"
import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { intlLocale, translator, type Locale, type T } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { IndexProgress } from "./IndexProgress"
import { OpsPanel } from "./OpsPanel"
import getCoverage from "./queries/getCoverage"
import getOps from "./queries/getOps"

export async function generateMetadata() {
  return { title: translator(await getLocale())("nav.coverage") }
}

function formatWhen(value: Date | null, locale: Locale, t: T, overdue = false): string {
  if (!value) return t("cov.notYet")
  if (overdue && value.getTime() <= Date.now()) return t("cov.dueNow")
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

function policyLabel(policy: string, t: T): string {
  if (policy === "enabled") return t("cov.policy.enabled")
  if (policy === "limited") return t("cov.policy.limited")
  return t("cov.policy.linkOnly")
}

export default async function CoveragePage() {
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  if (!user || user.role !== "ADMIN") redirect("/")
  const [coverage, ops] = await Promise.all([invoke(getCoverage, null), invoke(getOps, null)])
  const rows = coverage.rows
  const pl = locale === "pl"
  const t = translator(locale)
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
          <strong>{coverage.totalJobs.toLocaleString(intlLocale(locale))}</strong>
          {" · "}
          {pl ? "niekompletnych w tej tabeli" : "incomplete in this table"}:{" "}
          <strong>{coverage.incompleteEmployers}</strong>
        </p>
        <Link href="/">{pl ? "Nowe wyszukiwanie" : "New search"}</Link>
      </div>
      {rows.length === 0 ? (
        <div className="empty-card">{t("cov.empty")}</div>
      ) : (
        <div className="coverage-wrap">
          <table className="coverage-table">
            <thead>
              <tr>
                <th>{t("cov.th.employer")}</th>
                <th>{t("cov.th.platform")}</th>
                <th>{t("cov.th.policy")}</th>
                <th>{t("cov.th.index")}</th>
                <th>{t("cov.th.lastCrawl")}</th>
                <th>{t("cov.th.nextCrawl")}</th>
                <th>{t("cov.th.jobs")}</th>
                <th>{t("cov.th.reason")}</th>
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
                    <span className={`policy ${row.policy}`}>{policyLabel(row.policy, t)}</span>
                  </td>
                  <td>
                    {row.policy === "link_only" ? (
                      <span className="policy link_only">{t("cov.index.notCrawled")}</span>
                    ) : row.incomplete ? (
                      <span className="policy incomplete">{t("cov.index.incomplete")}</span>
                    ) : (
                      <span className="policy">{t("cov.index.complete")}</span>
                    )}
                  </td>
                  <td>{formatWhen(row.lastFetch, locale, t)}</td>
                  <td>
                    {row.policy === "link_only" ? "—" : formatWhen(row.nextFetch, locale, t, true)}
                  </td>
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
                          {t("cov.terms")}
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
