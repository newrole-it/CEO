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
    "The profile built from a CV or LinkedIn PDF, the parsed sections, and any profile audits made before the audit moved to the CV.",
    "Saved searches, the offers you mark interested or rejected, and the activity-log action (the search phrase is removed when you delete the account).",
    "A PDF uploaded to build the profile is read in a temporary file and deleted as soon as the text is extracted. That file is not stored.",
    "What you save yourself: CV documents and cover letters under My CV (the content and its earlier versions, the photo, the uploaded or generated PDF, and the latest audit), applications with their stages, notes and form answers, the answer bank, form details (phone, links, notice period), extension tokens (only as a hash), and the Google Sheet web-app address.",
    "If you connect Gmail: your mailbox address, an encrypted access token, and a log of each message whose body was read (sender, subject, date, one sentence behind the decision, and the decision). Message bodies are not stored. Log entries are removed after 90 days.",
    "The Chrome extension talks only to this app. It sends the form's field labels, the page address and title, and up to 12,000 characters of the page's text. After you submit a job application, it also sends your answers to questions about the work, including the salary, notice period and start date you gave. They are kept on that application and, for open questions, in the answer bank, so you can come back to them. E-mail addresses, phone numbers and your name inside a longer answer are replaced. On known job-application sites it sends the address of the open tab to check whether you already applied, and on every https page if you allow all sites. On your own LinkedIn profile page it sends the profile's address and the sections visible there (headline, About, experience, education, skills, certifications, languages); the app stores them as your LinkedIn profile and keeps each audit of them. It never reads other people's profiles or other LinkedIn pages. From forms it never sends contact details, profile links, files, passwords, ID or card numbers, consents or equal-opportunity answers.",
  ],
  whoTitle: "Who else receives data",
  hostTitle: "Hosting and database",
  host: "The server that runs Nowa Rola and its PostgreSQL database. That is where the account, profile, searches, decisions, and audits are stored. This draft does not name a separate hosting company, because the database runs on the machine you deploy.",
  emailTitle: "Email",
  email:
    "Resend (api.resend.com) when the deployment uses it, otherwise the SMTP server configured for this deployment. They receive your email address and a one-time sign-in link. They do not receive your CV or searches. With the local console setting, the link is printed in the server log instead of being sent to an email company.",
  llmTitle: "Language model",
  llm: "By default, the local Claude Code (claude -p) on your own Claude subscription, so the text goes to Anthropic under that subscription's terms. Without Claude Code nothing is sent and rules do the work. A deployment without Claude Code can set an API key for an OpenAI-compatible provider instead. The CV text is sent to extract a profile. The text of the CV you audit and counted phrases from matched offers are sent for the audit. The search phrase is sent to expand the query. A short summary of the role (titles, seniority, places, salary floor) and the public job text are sent for a match explanation. Classifying a job's industry, or whether the role is in tech when the title is unclear, sends the public job text only. Tailoring a CV to an offer or writing a cover letter sends the CV text, your profile, your notes for the model, and the public job text; when the offer's site opts out of AI use, only its company, title and place. Replies derived from the CV are stored under your user id and deleted with the profile or the account.",
  searchTitle: "Search APIs",
  search:
    "Brave Search, then Serper if Brave is unset or the call fails. They receive web queries built from the role you typed, such as a site: query plus that phrase. They do not receive your CV. The query is stored with the search and deleted with it. Pages returned by the search API are not stored.",
  linkedinTitle: "LinkedIn sign-in",
  linkedin:
    "Optional. LinkedIn's OpenID Connect flow returns your name, email, and picture. Nowa Rola does not send your CV to LinkedIn.",
  gmailTitle: "Gmail",
  gmail:
    "Optional, and you connect it with your own Google OAuth client. Google's permission covers reading all your mail, because it has none for selected mail, so this app does the narrowing: it searches only for mail from recruiting systems and the companies you applied to, checks the sender and subject before fetching a body, and never opens attachments or links. Nothing in your mailbox is sent, changed or deleted. When the rules cannot read a message and you left the option on, the language model above receives its subject and up to 3,000 characters of its text, without links, addresses or phone numbers. Data from Google is used only for this feature and follows the Google API Services User Data Policy, including its Limited Use requirements. It is not sold, not used for advertising, and not used to train models. Disconnecting revokes access at Google and deletes the token and the log.",
  controlTitle: "Export and deletion",
  control:
    "Settings lets you download a JSON file of your own data, delete the CV and profile, or delete the account. Deleting the profile removes the CV text, audits, and model replies from that CV. Documents under My CV, with their audits, are deleted separately on that page. Deleting the account also removes saved searches, decisions, applications, CV documents, the answer bank, extension tokens, the sheet connection, sessions, magic-link tokens, the LinkedIn connection, and queued work for those searches. Audit-log rows then keep the action name only.",
  settings: "Open settings",
}

const pl = {
  promise:
    "Nie sprzedajemy Twoich danych i nie przekazujemy ich pracodawcom, rekruterom ani reklamodawcom. Konto i CV możesz usunąć w każdej chwili.",
  storeTitle: "Co zostaje na serwerze",
  store: [
    "Konto: e-mail, imię oraz, jeśli z tego korzystasz, identyfikator logowania LinkedIn i adres zdjęcia.",
    "Profil zbudowany z CV albo PDF-a z LinkedIn, rozłożone na części sekcje i audyty profilu sprzed przeniesienia audytu do CV.",
    "Zapisane wyszukiwania, oferty oznaczone jako interesujące albo odrzucone oraz nazwa czynności w dzienniku (fraza wyszukiwania znika po usunięciu konta).",
    "PDF wgrany do odczytu profilu jest czytany z pliku tymczasowego i usuwany zaraz po wyjęciu tekstu. Ten plik nie jest przechowywany.",
    "To, co zapisujesz sam: dokumenty i listy motywacyjne w Moje CV (treść z poprzednimi wersjami, zdjęcie oraz wgrany lub wygenerowany PDF), aplikacje z etapami, notatkami i odpowiedziami z formularzy, bazę odpowiedzi, dane do formularzy (telefon, linki, okres wypowiedzenia), tokeny rozszerzenia (tylko jako skrót) i adres aplikacji Apps Script Twojego arkusza.",
    "Jeśli połączysz Gmail: adres skrzynki, zaszyfrowany token dostępu i dziennik każdego maila, którego treść została przeczytana (nadawca, temat, data, zdanie z uzasadnieniem i decyzja). Treści maili nie są zapisywane. Wpisy w dzienniku znikają po 90 dniach.",
    "Rozszerzenie Chrome łączy się tylko z tą aplikacją. Wysyła etykiety pól formularza, adres i tytuł strony oraz do 12 000 znaków jej tekstu. Po wysłaniu aplikacji wysyła też Twoje odpowiedzi na pytania o pracę, w tym podane wynagrodzenie, okres wypowiedzenia i datę rozpoczęcia. Zostają przy tej aplikacji, a odpowiedzi na pytania otwarte także w bazie odpowiedzi, żebyś mógł do nich wrócić. Adresy e-mail, numery telefonów i Twoje imię i nazwisko w dłuższej odpowiedzi są zastępowane. Na znanych stronach rekrutacyjnych wysyła adres otwartej karty, żeby sprawdzić, czy już aplikowano, a na każdej stronie https, jeśli pozwolisz na wszystkie strony. Na Twoim profilu LinkedIn wysyła adres profilu i widoczne na stronie sekcje (nagłówek, „O mnie”, doświadczenie, wykształcenie, umiejętności, certyfikaty, języki); aplikacja zapisuje je jako Twój profil LinkedIn i zachowuje każdą jego ocenę. Nigdy nie czyta cudzych profili ani innych stron LinkedIn. Z formularzy nigdy nie wysyła danych kontaktowych, linków do profili, plików, haseł, numerów dokumentów ani kart, zgód ani odpowiedzi na pytania o równe szanse (EEO).",
  ],
  whoTitle: "Kto jeszcze dostaje dane",
  hostTitle: "Hosting i baza",
  host: "Serwer, na którym działa Nowa Rola, i jego baza PostgreSQL. Tam leżą konto, profil, wyszukiwania, decyzje i audyty. Ten szkic nie wymienia osobnej firmy hostingowej, bo baza działa na maszynie, na której wdrażasz aplikację.",
  emailTitle: "Poczta",
  email:
    "Resend (api.resend.com), gdy wdrożenie go używa, a w przeciwnym razie serwer SMTP ustawiony dla tego wdrożenia. Dostają adres e-mail i jednorazowy link do logowania. Nie dostają CV ani wyszukiwań. Przy lokalnym ustawieniu konsoli link trafia do logu serwera, a nie do firmy pocztowej.",
  llmTitle: "Model językowy",
  llm: "Domyślnie lokalny Claude Code (claude -p) na Twojej subskrypcji Claude, więc tekst trafia do Anthropic na warunkach tej subskrypcji. Bez Claude Code nic nie jest wysyłane, a pracę wykonują reguły. Wdrożenie bez Claude Code może zamiast tego ustawić klucz API dostawcy zgodnego z OpenAI. Tekst CV idzie do odczytu profilu. Tekst audytowanego CV i policzone frazy z dopasowanych ofert idą do audytu. Fraza wyszukiwania idzie do rozszerzenia zapytania. Krótkie podsumowanie roli (tytuły, poziom, miejsca, próg wynagrodzenia) i publiczny tekst oferty idą do wyjaśnienia dopasowania. Rozpoznanie branży oferty oraz, gdy tytuł jest niejednoznaczny, tego, czy rola jest w tech, wysyła tylko publiczny tekst ogłoszenia. Dopasowanie CV do oferty i pisanie listu motywacyjnego wysyła tekst CV, profil, Twoje wskazówki dla modelu i publiczny tekst oferty, a gdy strona oferty zastrzega się przed AI, tylko firmę, stanowisko i miejsce. Odpowiedzi wyliczone z CV są zapisane przy Twoim koncie i usuwane razem z profilem albo kontem.",
  searchTitle: "Wyszukiwarki",
  search:
    "Brave Search, a gdy Brave nie jest ustawiony albo wywołanie się nie uda, Serper. Dostają zapytania WWW zbudowane z wpisanej roli, na przykład zapytanie site: i tę frazę. Nie dostają CV. Zapytanie jest zapisane przy wyszukiwaniu i usuwane razem z nim. Stron zwróconych przez API wyszukiwania nie zapisujemy.",
  linkedinTitle: "Logowanie LinkedIn",
  linkedin:
    "Opcjonalne. OpenID Connect LinkedIn zwraca imię, e-mail i zdjęcie. Nowa Rola nie wysyła CV do LinkedIn.",
  gmailTitle: "Gmail",
  gmail:
    "Opcjonalne. Łączysz je przez własnego klienta OAuth w Google. Uprawnienie Google obejmuje odczyt całej poczty, bo nie ma uprawnienia do wybranych maili, więc zawężeniem zajmuje się ta aplikacja: szuka tylko maili od systemów rekrutacyjnych i firm, do których aplikujesz, sprawdza nadawcę i temat przed pobraniem treści i nie otwiera załączników ani linków. W Twojej skrzynce niczego nie wysyła, nie zmienia i nie usuwa. Gdy reguły nie potrafią odczytać maila, a ta opcja jest włączona, model językowy opisany wyżej dostaje jego temat i do 3000 znaków tekstu, bez linków, adresów i telefonów. Dane z Google służą tylko do tej funkcji i podlegają zasadom Google API Services User Data Policy, w tym wymaganiom Limited Use. Nie są sprzedawane ani używane do reklam czy trenowania modeli. Odłączenie odwołuje dostęp w Google i usuwa token oraz dziennik.",
  controlTitle: "Eksport i usuwanie",
  control:
    "W ustawieniach pobierzesz JSON ze swoimi danymi, usuniesz CV i profil albo usuniesz konto. Usunięcie profilu kasuje tekst CV, audyty i odpowiedzi modelu z tego CV. Dokumenty z Moje CV, razem z ich audytami, usuwasz osobno na tej stronie. Usunięcie konta kasuje także zapisane wyszukiwania, decyzje, aplikacje, dokumenty CV, bazę odpowiedzi, tokeny rozszerzenia, połączenie z arkuszem, sesje, tokeny linków do logowania, połączenie z LinkedIn i kolejkową pracę dla tych wyszukiwań. W dzienniku zostaje wtedy tylko nazwa czynności.",
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
    <SiteFrame user={user} locale={locale} width="narrow">
      <article className="prose">
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
