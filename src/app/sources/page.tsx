import { coverageRows } from "config/source-policies"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { copy } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import { invoke } from "src/app/blitz-server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"

export const metadata = { title: "Sources" }

export default async function SourcesPage() {
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  const t = copy(locale)
  const rows = coverageRows()
  return (
    <SiteFrame user={user} locale={locale}>
      <div className="page-head">
        <p className="eyebrow">{t.sourcesEyebrow}</p>
        <h1>{t.sourcesList}</h1>
        <p className="lede">{t.fact1Body}</p>
      </div>
      <ul className="facts-list">
        {rows.map((row) => (
          <li key={`${row.platform}-${row.employer}`}>
            <div>
              <h3>
                {row.employer} · {row.platform}
              </h3>
              <p>
                {row.policy === "link_only"
                  ? locale === "pl"
                    ? "Tylko link do wyszukiwarki serwisu. Treści nie pobieramy."
                    : "Link only. We do not download the content."
                  : locale === "pl"
                    ? "Publiczna lista ofert pracodawcy."
                    : "The employer's public job list."}
              </p>
              {row.href ? (
                <p>
                  <a href={row.href} target="_blank" rel="noreferrer noopener">
                    {row.href}
                  </a>
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </SiteFrame>
  )
}
