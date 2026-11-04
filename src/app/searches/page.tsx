import Link from "next/link"
import { Bookmark } from "lucide-react"
import { invoke } from "src/app/blitz-server"
import { ButtonLink } from "@newrole/ui/Button"
import { EmptyState } from "@newrole/ui/primitives"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { intlLocale, translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import listSearches from "./queries/listSearches"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("srch.title") }
}

export default async function SearchesPage() {
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  const t = translator(locale)
  const searches = user ? await invoke(listSearches, null) : []
  const date = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short" })
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <header className="page-head">
        <h1 className="t-h1">{t("srch.title")}</h1>
        <p>{t("srch.sub")}</p>
      </header>
      {searches.length === 0 ? (
        <EmptyState icon={<Bookmark />} title={t("srch.empty")}>
          <ButtonLink href="/jobs" variant="primary">
            {t("saved.goFeed")}
          </ButtonLink>
        </EmptyState>
      ) : (
        <ul className="stack-sm" style={{ listStyle: "none" }}>
          {searches.map((search) => {
            const mode = search.workMode !== "ANY" ? search.workMode.toLowerCase() : null
            return (
              <li
                key={search.id}
                className="card saved-row"
                style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
              >
                <div className="saved-row__main">
                  <Link href={`/searches/${search.id}`}>{search.phrase}</Link>
                  <span>
                    {[
                      search.locationHint,
                      mode ? t(`mode.${mode}` as "mode.remote") : null,
                      search.latest ? t("srch.matched", { n: search.latest.matchedJobs }) : null,
                      date.format(search.createdAt),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className="row">
                  {search.latest?.newJobs ? (
                    <span className="badge badge--new">
                      {t("srch.new", { n: search.latest.newJobs })}
                    </span>
                  ) : null}
                  <ButtonLink href={`/searches/${search.id}`} variant="outline" size="sm">
                    {t("srch.open")}
                  </ButtonLink>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </SiteFrame>
  )
}
