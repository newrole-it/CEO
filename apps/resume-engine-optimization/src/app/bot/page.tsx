import { invoke } from "src/app/rpc"
import { GITHUB_ISSUES } from "src/app/components/site/links"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { botCopy } from "src/app/i18n/copy-bot"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { operator } from "src/server/operator"

export const metadata = { title: "NewRoleBot" }

export default async function BotPage() {
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  const page = botCopy[locale]
  const contact = operator()?.contact
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <article className="prose">
        <p className="eyebrow">NewRoleBot</p>
        <h1>NewRoleBot</h1>
        <p className="lede">{page.lede}</p>
        <p>{page.noCrawl}</p>
        <h2>{page.rulesTitle}</h2>
        <ul>
          {page.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <h2>{page.stopTitle}</h2>
        <p>{page.robots}</p>
        <pre>{"User-agent: NewRoleBot\nDisallow: /"}</pre>
        <p>
          {page.report}{" "}
          {contact ? (
            contact
          ) : (
            <a className="text-link" href={GITHUB_ISSUES} target="_blank" rel="noreferrer noopener">
              {page.issue}
            </a>
          )}
          .
        </p>
      </article>
    </SiteFrame>
  )
}
