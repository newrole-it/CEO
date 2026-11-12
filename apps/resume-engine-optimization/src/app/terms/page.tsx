import { SiteFrame } from "src/app/components/site/SiteFrame"
import { copy } from "src/app/i18n/copy"
import { termsCopy } from "src/app/i18n/copy-terms"
import { getLocale } from "src/app/i18n/server"
import { invoke } from "src/app/rpc"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { operator } from "src/server/operator"
import { serviceTerms } from "./service"

export async function generateMetadata() {
  return { title: copy(await getLocale()).terms }
}

export default async function TermsPage() {
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  const t = copy(locale)
  const who = operator()
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <article className="prose">
        <p className="draft-banner">{t.draft}</p>
        <p className="eyebrow">{t.terms}</p>
        <h1>{t.terms}</h1>
        {who ? (
          serviceTerms(locale, who).map((item) => (
            <section key={item.title}>
              <h2>{item.title}</h2>
              <p>{item.text}</p>
            </section>
          ))
        ) : (
          <p className="lede">{termsCopy[locale].lede}</p>
        )}
      </article>
    </SiteFrame>
  )
}
