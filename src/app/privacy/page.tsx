import Link from "next/link"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { copy, type Locale } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import { invoke } from "src/app/blitz-server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"

export const metadata = { title: "Privacy" }

const en = {
  promise:
    "We never sell your data or share it with employers, recruiters or advertisers. You can delete your account and CV anytime.",
  storeTitle: "What stays on the server",
  store: [
    "The account: email, name, and, if you use it, the LinkedIn sign-in id and picture URL.",
    "The profile built from a CV or LinkedIn PDF, the parsed sections, and each profile audit.",
    "Saved searches, the offers you mark interested or rejected, and the activity-log action (the search phrase is removed when you delete the account).",
    "The uploaded PDF is read in a temporary file and deleted as soon as the text is extracted. The file is not stored.",
  ],
  whoTitle: "Who else receives data",
  hostTitle: "Hosting and database",
  host: "The server that runs Jobscanner and its PostgreSQL database. That is where the account, profile, searches, decisions, and audits are stored. This draft does not name a separate hosting company, because the database runs on the machine you deploy.",
  emailTitle: "Email",
  email:
    "Resend (api.resend.com) when the deployment uses it, otherwise the SMTP server configured for this deployment. They receive your email address and a one-time sign-in link. They do not receive your CV or searches. With the local console setting, the link is printed in the server log instead of being sent to an email company.",
  llmTitle: "Language model",
  llm: "An OpenAI-compatible API. The default is OpenAI at api.openai.com (gpt-4o-mini). A deployment can point the same calls at another provider. Nothing is sent unless an API key is set. The CV text is sent to extract a profile. Profile sections and counted phrases from matched offers are sent for the audit. The search phrase is sent to expand the query. A short summary of the role (titles, seniority, places, salary floor) and the public job text are sent for a match explanation. Classifying a job's industry sends the public job text only. Replies derived from the CV are stored under your user id and deleted with the profile or the account.",
  searchTitle: "Search APIs",
  search:
    "Brave Search, then Serper if Brave is unset or the call fails. They receive web queries built from the role you typed, such as a site: query plus that phrase. They do not receive your CV. The query is stored with the search and deleted with it. Pages returned by the search API are not stored.",
  linkedinTitle: "LinkedIn sign-in",
  linkedin:
    "Optional. LinkedIn's OpenID Connect flow returns your name, email, and picture. Jobscanner does not send your CV to LinkedIn.",
  controlTitle: "Export and deletion",
  control:
    "Settings lets you download a JSON file of your own data, delete the CV and profile, or delete the account. Deleting the profile removes the CV text, audits, and model replies from that CV. Deleting the account also removes saved searches, decisions, sessions, magic-link tokens, the LinkedIn connection, and queued work for those searches. Audit-log rows then keep the action name only.",
  settings: "Open settings",
}

const pl = {
  promise:
    "Nie sprzedajemy Twoich danych i nie przekazujemy ich pracodawcom, rekruterom ani reklamodawcom. Konto i CV możesz usunąć w każdej chwili.",
  storeTitle: "Co zostaje na serwerze",
  store: [
    "Konto: e-mail, imię oraz, jeśli z tego korzystasz, identyfikator logowania LinkedIn i adres zdjęcia.",
    "Profil zbudowany z CV albo PDF-a z LinkedIn, rozłożone na części sekcje i każdy audyt profilu.",
    "Zapisane wyszukiwania, oferty oznaczone jako interesujące albo odrzucone oraz nazwa czynności w dzienniku (fraza wyszukiwania znika po usunięciu konta).",
    "Wgrany PDF jest czytany z pliku tymczasowego i usuwany zaraz po wyjęciu tekstu. Plik nie jest przechowywany.",
  ],
  whoTitle: "Kto jeszcze dostaje dane",
  hostTitle: "Hosting i baza",
  host: "Serwer, na którym działa Jobscanner, i jego baza PostgreSQL. Tam leżą konto, profil, wyszukiwania, decyzje i audyty. Ten szkic nie wymienia osobnej firmy hostingowej, bo baza działa na maszynie, na której wdrażasz aplikację.",
  emailTitle: "Poczta",
  email:
    "Resend (api.resend.com), gdy wdrożenie go używa, a w przeciwnym razie serwer SMTP ustawiony dla tego wdrożenia. Dostają adres e-mail i jednorazowy link do logowania. Nie dostają CV ani wyszukiwań. Przy lokalnym ustawieniu konsoli link trafia do logu serwera, a nie do firmy pocztowej.",
  llmTitle: "Model językowy",
  llm: "API zgodne z OpenAI. Domyślnie jest to OpenAI pod api.openai.com (gpt-4o-mini). Wdrożenie może skierować te same wywołania do innego dostawcy. Nic nie jest wysyłane, dopóki nie ma klucza API. Tekst CV idzie do odczytu profilu. Sekcje profilu i policzone frazy z dopasowanych ofert idą do audytu. Fraza wyszukiwania idzie do rozszerzenia zapytania. Krótkie podsumowanie roli (tytuły, poziom, miejsca, próg wynagrodzenia) i publiczny tekst oferty idą do wyjaśnienia dopasowania. Rozpoznanie branży oferty wysyła tylko publiczny tekst ogłoszenia. Odpowiedzi wyliczone z CV są zapisane przy Twoim koncie i usuwane razem z profilem albo kontem.",
  searchTitle: "Wyszukiwarki",
  search:
    "Brave Search, a gdy Brave nie jest ustawiony albo wywołanie się nie uda, Serper. Dostają zapytania WWW zbudowane z wpisanej roli, na przykład zapytanie site: i tę frazę. Nie dostają CV. Zapytanie jest zapisane przy wyszukiwaniu i usuwane razem z nim. Stron zwróconych przez API wyszukiwania nie zapisujemy.",
  linkedinTitle: "Logowanie LinkedIn",
  linkedin:
    "Opcjonalne. OpenID Connect LinkedIn zwraca imię, e-mail i zdjęcie. Jobscanner nie wysyła CV do LinkedIn.",
  controlTitle: "Eksport i usuwanie",
  control:
    "W ustawieniach pobierzesz JSON ze swoimi danymi, usuniesz CV i profil albo usuniesz konto. Usunięcie profilu kasuje tekst CV, audyty i odpowiedzi modelu z tego CV. Usunięcie konta kasuje także zapisane wyszukiwania, decyzje, sesje, tokeny linków do logowania, połączenie z LinkedIn i kolejkową pracę dla tych wyszukiwań. W dzienniku zostaje wtedy tylko nazwa czynności.",
  settings: "Otwórz ustawienia",
}

function body(locale: Locale) {
  return locale === "pl" ? pl : en
}

export default async function PrivacyPage() {
  const locale = await getLocale()
  const user = await invoke(getCurrentUser, null)
  const t = copy(locale)
  const page = body(locale)
  return (
    <SiteFrame user={user} locale={locale}>
      <article className="page-head">
        <p className="draft-banner">{t.draft}</p>
        <p className="eyebrow">{t.privacy}</p>
        <h1>{t.privacy}</h1>
        <p className="lede">{page.promise}</p>
        <h2>{page.storeTitle}</h2>
        <ul>
          {page.store.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{page.whoTitle}</h2>
        <h3>{page.hostTitle}</h3>
        <p>{page.host}</p>
        <h3>{page.emailTitle}</h3>
        <p>{page.email}</p>
        <h3>{page.llmTitle}</h3>
        <p>{page.llm}</p>
        <h3>{page.searchTitle}</h3>
        <p>{page.search}</p>
        <h3>{page.linkedinTitle}</h3>
        <p>{page.linkedin}</p>
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
