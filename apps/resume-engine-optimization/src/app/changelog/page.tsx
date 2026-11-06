import { readFile } from "fs/promises"
import { join } from "path"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { GITHUB_URL } from "src/app/components/site/links"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import { repoRoot } from "src/server/repo"
import { invoke } from "src/app/blitz-server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { parseChangelog } from "src/shared/changelog"

export async function generateMetadata() {
  return { title: translator(await getLocale())("changelog.title") }
}

export default async function ChangelogPage() {
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  const t = translator(locale)
  const releases = parseChangelog(await readFile(join(repoRoot(), "CHANGELOG.md"), "utf8"))
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <article className="prose">
        <h1>{t("changelog.title")}</h1>
        <p className="lede">{t("changelog.lede")}</p>
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
            {t("changelog.source")}
          </a>
        </p>
      </article>
    </SiteFrame>
  )
}
