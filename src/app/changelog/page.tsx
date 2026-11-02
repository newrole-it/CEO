import { readFile } from "fs/promises"
import { join } from "path"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { GITHUB_URL } from "src/app/components/site/links"
import { getLocale } from "src/app/i18n/server"
import { invoke } from "src/app/blitz-server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { parseChangelog } from "src/shared/changelog"

export const metadata = { title: "Changelog" }

const en = {
  title: "Changelog",
  lede: "Everything that changed in newrole.it, newest first. There are no tagged releases yet, so changes are listed by date.",
  source: "CHANGELOG.md in the repository",
}

const pl = {
  title: "Historia zmian",
  lede: "Wszystko, co zmieniło się w newrole.it, od najnowszych zmian. Nie ma jeszcze oznaczonych wydań, więc zmiany są ułożone według dat. Wpisy są po angielsku, tak jak reszta dokumentacji projektu.",
  source: "CHANGELOG.md w repozytorium",
}

export default async function ChangelogPage() {
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  const page = locale === "pl" ? pl : en
  const releases = parseChangelog(await readFile(join(process.cwd(), "CHANGELOG.md"), "utf8"))
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <article className="prose">
        <h1>{page.title}</h1>
        <p className="lede">{page.lede}</p>
        {releases.map((release) => (
          <section key={release.title}>
            <h2>{release.title}</h2>
            {release.groups.map((group) => (
              <div key={group.title}>
                <h3>{group.title}</h3>
                <ul>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
        <p>
          <a
            className="text-link"
            href={`${GITHUB_URL}/blob/main/CHANGELOG.md`}
            target="_blank"
            rel="noreferrer noopener"
          >
            {page.source}
          </a>
        </p>
      </article>
    </SiteFrame>
  )
}
