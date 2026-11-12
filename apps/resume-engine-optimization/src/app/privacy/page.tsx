import Link from "next/link"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { copy } from "src/app/i18n/copy"
import { privacyCopy } from "src/app/i18n/copy-privacy"
import { getLocale } from "src/app/i18n/server"
import { invoke } from "src/app/rpc"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { llmProvider } from "src/server/llm/client"
import { operator } from "src/server/operator"
import { noModelLine, serviceHost, servicePrivacy } from "./service"

export async function generateMetadata() {
  return { title: copy(await getLocale()).privacy }
}

export default async function PrivacyPage() {
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  const t = copy(locale)
  const page = privacyCopy[locale]
  // Set on a service run for others: say what is true of this deployment, not of a local install.
  const who = operator()
  const noModel = who && llmProvider() === "none"
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <article className="prose">
        <p className="draft-banner">{t.draft}</p>
        <p className="eyebrow">{t.privacy}</p>
        <h1>{t.privacy}</h1>
        <p className="lede">{page.promise}</p>
        {who
          ? servicePrivacy(locale, who).map((section) => (
              <section key={section.title}>
                <h2>{section.title}</h2>
                {section.lines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </section>
            ))
          : null}
        <h2>{page.storeTitle}</h2>
        <ul>
          {page.store.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{page.whoTitle}</h2>
        <h3>{page.hostTitle}</h3>
        <p>{who ? serviceHost(locale, who) : page.host}</p>
        <h3>{page.emailTitle}</h3>
        <p>{page.email}</p>
        <h3>{page.llmTitle}</h3>
        <p>{noModel ? noModelLine(locale) : page.llm}</p>
        <h3>{page.linkedinTitle}</h3>
        <p>{page.linkedin}</p>
        <h3>{page.gmailTitle}</h3>
        <p>{page.gmail}</p>
        <h2>{page.controlTitle}</h2>
        <p>{page.control}</p>
        <p>
          <Link className="text-link" href="/settings">
            {page.settings}
          </Link>
        </p>
      </article>
    </SiteFrame>
  )
}
