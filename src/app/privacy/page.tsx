import { SiteFrame } from "src/app/components/site/SiteFrame"
import { copy } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import { invoke } from "src/app/blitz-server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"

export const metadata = { title: "Privacy" }

export default async function PrivacyPage() {
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  const t = copy(locale)
  return (
    <SiteFrame user={user} locale={locale}>
      <article className="page-head">
        <p className="draft-banner">{t.draft}</p>
        <p className="eyebrow">{t.privacy}</p>
        <h1>{t.privacy}</h1>
        <p className="lede">
          {locale === "pl"
            ? "Jobscanner przechowuje konto, zapisane wyszukiwania, decyzje o ofertach i tekst profilu, który sam wgrasz. Plik PDF jest usuwany po odczytaniu. Nie sprzedajemy tych danych. Pełna polityka powstanie po przeglądzie prawnym."
            : "Jobscanner stores your account, saved searches, offer decisions, and the profile text you upload. The PDF is deleted after it is read. We do not sell that data. The full policy will follow legal review."}
        </p>
      </article>
    </SiteFrame>
  )
}
