import { SiteFrame } from "src/app/components/site/SiteFrame"
import { copy } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import { invoke } from "src/app/blitz-server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"

export const metadata = { title: "Terms" }

export default async function TermsPage() {
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  const t = copy(locale)
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <article className="prose">
        <p className="draft-banner">{t.draft}</p>
        <p className="eyebrow">{t.terms}</p>
        <h1>{t.terms}</h1>
        <p className="lede">
          {locale === "pl"
            ? "Wyniki prowadzą do ogłoszeń pracodawców. Nowa Rola nie jest stroną aplikacji i nie gwarantuje, że oferta jest nadal otwarta. Indeks czyta publiczne strony kariery z limitem co najmniej 5 sekund między zapytaniami do jednego hosta. To szkic regulaminu."
            : "Results link to employers' postings. Nowa Rola is not a party to an application and does not guarantee an offer is still open. The index reads public career pages and waits at least 5 seconds between requests to one host. This is a draft of the terms."}
        </p>
      </article>
    </SiteFrame>
  )
}
