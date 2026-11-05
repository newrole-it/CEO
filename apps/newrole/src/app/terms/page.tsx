import { SiteFrame } from "src/app/components/site/SiteFrame"
import { copy } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import { invoke } from "src/app/blitz-server"
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
          <p className="lede">
            {locale === "pl"
              ? "Wyniki prowadzą do ogłoszeń pracodawców. newrole.it nie jest stroną aplikacji i nie gwarantuje, że oferta jest nadal otwarta. Indeks czyta publiczne strony kariery z limitem co najmniej 1 sekundy między zapytaniami do jednego hosta. To szkic regulaminu."
              : "Results link to employers' postings. newrole.it is not a party to an application and does not guarantee an offer is still open. The index reads public career pages and waits at least 1 second between requests to one host. This is a draft of the terms."}
          </p>
        )}
      </article>
    </SiteFrame>
  )
}
