import { coverageRows } from "@newrole/offers/source-policies"
import db from "db"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { intlLocale, translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import { invoke } from "src/app/blitz-server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { SOURCE_CATALOG, type CatalogState } from "src/shared/source-catalog"

export const dynamic = "force-dynamic"

const STATE: Record<CatalogState, { pl: string; en: string; tone: string }> = {
  connected: { pl: "Podłączone", en: "Connected", tone: " badge--success" },
  at_risk: { pl: "Podłączone, polityka niepewna", en: "Connected, policy uncertain", tone: " badge--warning" },
  partial: { pl: "Częściowo", en: "Partial", tone: "" },
  link_only: { pl: "Tylko link", en: "Link only", tone: "" },
}

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("sourcesList") }
}

export default async function SourcesPage() {
  const [locale, user, offers] = await Promise.all([
    getLocale(),
    invoke(getCurrentUser, null),
    db.job.groupBy({ by: ["sourceType"], where: { status: "ACTIVE" }, _count: { _all: true } }),
  ])
  const t = translator(locale)
  const pl = locale === "pl"
  const rows = coverageRows()
  const counts = new Map(offers.map((row) => [row.sourceType as string, row._count._all]))
  const format = (value: number) => value.toLocaleString(intlLocale(locale))
  const total = offers.reduce((sum, row) => sum + row._count._all, 0)
  const catalog = SOURCE_CATALOG.map((entry) => ({
    ...entry,
    count: entry.sourceType ? counts.get(entry.sourceType) ?? 0 : null,
  })).sort((a, b) => (b.count ?? -1) - (a.count ?? -1))
  return (
    <SiteFrame user={user} locale={locale}>
      <header className="page-head">
        <p className="eyebrow">{t("sourcesEyebrow")}</p>
        <h1 className="t-h1">{t("sourcesList")}</h1>
        <p>{t("sources.body")}</p>
        <p>{t("sources.rules")}</p>
        <p>
          {pl ? "Aktywnych ofert" : "Active offers"}: <strong>{format(total)}</strong>
        </p>
      </header>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{pl ? "Źródło" : "Source"}</th>
              <th scope="col">Status</th>
              <th scope="col">{pl ? "Oferty" : "Offers"}</th>
              <th scope="col">{pl ? "Uwagi" : "Notes"}</th>
            </tr>
          </thead>
          <tbody>
            {catalog.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>
                  <span className={`badge${STATE[row.state].tone}`}>
                    {STATE[row.state][locale]}
                  </span>
                </td>
                <td>{row.count == null ? "—" : format(row.count)}</td>
                <td>
                  {row.note?.[locale] ??
                    (row.count === 0 ? (pl ? "Brak firm w indeksie." : "No companies indexed yet.") : "")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{t("sources.th.employer")}</th>
              <th scope="col">{t("sources.th.platform")}</th>
              <th scope="col">{t("sources.th.how")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.platform}-${row.employer}`}>
                <td>{row.employer}</td>
                <td>
                  {row.href ? (
                    <a className="link" href={row.href} target="_blank" rel="noreferrer noopener">
                      {row.platform}
                    </a>
                  ) : (
                    row.platform
                  )}
                </td>
                <td>
                  <span className={`badge${row.policy === "link_only" ? "" : " badge--success"}`}>
                    {row.policy === "link_only" ? t("sources.link") : t("sources.public")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SiteFrame>
  )
}
