import { coverageRows } from "config/source-policies"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import { invoke } from "src/app/blitz-server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("sourcesList") }
}

export default async function SourcesPage() {
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  const t = translator(locale)
  const rows = coverageRows()
  return (
    <SiteFrame user={user} locale={locale}>
      <header className="page-head">
        <p className="eyebrow">{t("sourcesEyebrow")}</p>
        <h1 className="t-h1">{t("sourcesList")}</h1>
        <p>{t("sources.body")}</p>
        <p>{t("sources.rules")}</p>
      </header>
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
