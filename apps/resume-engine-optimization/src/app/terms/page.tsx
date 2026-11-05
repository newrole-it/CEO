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
              ? "Oferty, które dodajesz, prowadzą do ogłoszeń pracodawców. newrole.it nie jest stroną aplikacji i nie gwarantuje, że oferta jest nadal otwarta. Ogłoszenie z linku czytamy na Twoją prośbę, z limitem co najmniej 1 sekundy między zapytaniami do jednego hosta. Za treść CV i listów, które wysyłasz, odpowiadasz Ty. To szkic regulaminu."
              : "The offers you add link to employers' postings. newrole.it is not a party to an application and does not guarantee an offer is still open. A posting is read from its link when you ask, at least 1 second apart between requests to one host. You are responsible for the CVs and letters you send. This is a draft of the terms."}
          </p>
        )}
      </article>
    </SiteFrame>
  )
}
